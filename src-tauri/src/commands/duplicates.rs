use super::helpers::{fetch_item_tags, read_item_from_row};
use crate::db;
use crate::models::Item;
use crate::scanner;
use sqlx::{Row, SqlitePool};
use std::path::Path;
use tauri::{AppHandle, Emitter, State};

// ── Duplicate detection ───────────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateItem {
    #[serde(flatten)]
    pub item: Item,
    pub path_exists: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub fingerprint: String,
    /// "duplicate" — 全部 path 都還在；"moved" — 至少一筆 path 已不存在（疑似搬走）
    pub status: String,
    pub items: Vec<DuplicateItem>,
}

#[tauri::command]
pub async fn get_duplicate_groups(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<DuplicateGroup>, String> {
    let fp_rows = sqlx::query(
        "SELECT fingerprint FROM items
         WHERE fingerprint LIKE 'sha256:%' AND item_type = 'file'
         GROUP BY fingerprint HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut groups = Vec::new();
    for row in fp_rows {
        let fingerprint: String = row.get("fingerprint");
        let item_rows = sqlx::query(
            "SELECT * FROM items WHERE fingerprint = ? AND item_type = 'file' ORDER BY file_modified_at ASC, id ASC"
        )
        .bind(&fingerprint)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        let mut any_missing = false;
        let mut existing_count = 0usize;
        for item_row in item_rows {
            let id: i64 = item_row.get("id");
            let tags = fetch_item_tags(&pool, id).await?;
            let mut item = read_item_from_row(&item_row, tags);
            let path_exists = Path::new(&item.path).exists();
            if path_exists {
                let path = item.path.clone();
                let current = tauri::async_runtime::spawn_blocking(move || scanner::compute_file_fingerprint(Path::new(&path))).await.map_err(|e| e.to_string())?;
                if current.as_deref() != Some(&fingerprint) { continue; }
                if let Ok(metadata) = std::fs::metadata(&item.path) {
                    item.file_modified_at = metadata.modified().ok()
                        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|time| time.as_secs() as i64);
                    item.file_size = Some(metadata.len() as i64);
                }
            }
            if !path_exists {
                any_missing = true;
            } else {
                existing_count += 1;
            }
            items.push(DuplicateItem { item, path_exists });
        }
        let status = if any_missing && existing_count > 1 {
            "mixed"
        } else if any_missing {
            "moved"
        } else {
            "duplicate"
        };
        if items.len() < 2 { continue; }
        groups.push(DuplicateGroup {
            fingerprint,
            status: status.to_string(),
            items,
        });
    }
    Ok(groups)
}

#[tauri::command]
pub async fn compute_fingerprints(
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<i32, String> {
    let rows =
        sqlx::query("SELECT id, path FROM items WHERE item_type = 'file'")
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    let total = rows.len() as i32;
    let mut count = 0i32;
    for (index, row) in rows.iter().enumerate() {
        let id: i64 = row.get("id");
        let path: String = row.get("path");
        let hash_path = path.clone();
        let fingerprint = tauri::async_runtime::spawn_blocking(move || scanner::compute_file_fingerprint(Path::new(&hash_path))).await.map_err(|e| e.to_string())?;
        if let Some(fp) = fingerprint {
            db::update_item_fingerprint(&*pool, id, &fp).await.map_err(|e| e.to_string())?;
            count += 1;
        }
        let _ = app.emit(
            "fingerprint-progress",
            serde_json::json!({
                "current": index + 1,
                "total": total
            }),
        );
    }
    Ok(count)
}

fn verify_duplicates(keep: &str, paths: &[String]) -> Result<(), String> {
    if paths.is_empty() { return Err("沒有要移除的重複檔案".into()); }
    let expected = scanner::compute_file_fingerprint(Path::new(keep)).ok_or("保留檔案無法讀取或正在變更")?;
    let mut seen = std::collections::HashSet::new();
    seen.insert(db::path_key(keep));
    for path in paths {
        if !seen.insert(db::path_key(path)) { return Err("保留與移除的檔案不可相同或重複".into()); }
        if scanner::compute_file_fingerprint(Path::new(path)).as_deref() != Some(&expected) {
            return Err(format!("檔案內容已不同或無法驗證，未執行批次移除：{path}"));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn trash_verified_duplicates(
    keep_path: String, paths: Vec<String>, pool: State<'_, SqlitePool>, app: AppHandle,
) -> Result<(), String> {
    use tauri::Manager;
    let keep = keep_path.clone();
    let candidates = paths.clone();
    tauri::async_runtime::spawn_blocking(move || verify_duplicates(&keep, &candidates)).await.map_err(|e| e.to_string())??;
    let cache = app.path().app_data_dir().map_err(|e| e.to_string())?.join("thumb_cache");
    for path in paths {
        let keep = keep_path.clone(); let candidate = path.clone();
        tauri::async_runtime::spawn_blocking(move || verify_duplicates(&keep, &[candidate])).await.map_err(|e| e.to_string())??;
        trash::delete(&path).map_err(|e| e.to_string())?;
        db::delete_item_by_path_with_cache(&pool, &cache, &path).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod safety_tests {
    use super::*;
    #[test]
    fn rejects_equal_prefix_different_tail_and_changed_candidates() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.zip"); let b = dir.path().join("b.zip");
        let mut bytes = vec![1u8; 65536]; bytes.push(2);
        std::fs::write(&a, &bytes).unwrap(); bytes[65536] = 3;
        std::fs::write(&b, &bytes).unwrap();
        assert!(verify_duplicates(&a.to_string_lossy(), &[b.to_string_lossy().into_owned()]).is_err());
        std::fs::copy(&a, &b).unwrap();
        assert!(verify_duplicates(&a.to_string_lossy(), &[b.to_string_lossy().into_owned()]).is_ok());
        assert!(verify_duplicates(&a.to_string_lossy(), &[a.to_string_lossy().into_owned()]).is_err());
        assert!(a.exists() && b.exists());
    }
}
