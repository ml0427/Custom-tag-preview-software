use crate::db;
use anyhow::Result;
use chrono::Local;
use regex::Regex;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[derive(Default)]
pub struct ScanCancelState {
    cancelled: AtomicBool,
}

impl ScanCancelState {
    pub fn begin_scan(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

fn scan_cancelled(cancel: Option<&ScanCancelState>) -> bool {
    cancel.map(ScanCancelState::is_cancelled).unwrap_or(false)
}

pub fn compute_file_fingerprint(path: &Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536]; // first 64 KB
    let n = file.read(&mut buf).ok()?;
    if n == 0 {
        return None;
    }
    hasher.update(&buf[..n]);
    Some(format!("{:x}", hasher.finalize()))
}

pub async fn full_rescan_with_clear(
    pool: &SqlitePool,
    path_str: &str,
    cache_dir: &Path,
    app: &AppHandle,
    cancel: Option<&ScanCancelState>,
) -> Result<(i32, bool)> {
    prepare_full_rescan(pool, cache_dir).await?;
    let scannable_exts = load_scannable_extensions(pool).await;
    scan_scannable_files(pool, path_str, cache_dir, app, &scannable_exts, cancel).await
}

async fn prepare_full_rescan(pool: &SqlitePool, cache_dir: &Path) -> Result<()> {
    db::clear_database(pool).await?;
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(cache_dir);
    }
    fs::create_dir_all(cache_dir)?;
    Ok(())
}

async fn load_scannable_extensions(pool: &SqlitePool) -> HashSet<String> {
    sqlx::query_scalar::<_, String>("SELECT DISTINCT extension FROM type_extensions")
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .collect()
}

async fn scan_scannable_files(
    pool: &SqlitePool,
    path_str: &str,
    cache_dir: &Path,
    app: &AppHandle,
    scannable_exts: &HashSet<String>,
    cancel: Option<&ScanCancelState>,
) -> Result<(i32, bool)> {
    let mut added_count = 0;
    let entries = WalkDir::new(path_str)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| scannable_exts.contains(&ext.to_lowercase()))
                    .unwrap_or(false)
        });

    for entry in entries {
        if scan_cancelled(cancel) {
            let _ = app.emit(
                "scan-progress",
                serde_json::json!({
                    "current": added_count,
                    "name": "掃描已取消",
                    "cancelled": true
                }),
            );
            return Ok((added_count, true));
        }
        let name = entry
            .path()
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if process_zip_file(pool, entry.path(), cache_dir).await? {
            added_count += 1;
        }
        let _ = app.emit(
            "scan-progress",
            serde_json::json!({ "current": added_count, "name": name }),
        );
    }

    Ok((added_count, false))
}

async fn process_zip_file(pool: &SqlitePool, path: &Path, cache_dir: &Path) -> Result<bool> {
    let file_path = path.to_string_lossy().to_string();
    let title = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let metadata = fs::metadata(path)?;
    let file_size = metadata.len() as i64;
    let mtime_unix = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let import_at = Local::now().to_rfc3339();

    let fingerprint = compute_file_fingerprint(path);
    let id = db::insert_item(
        pool,
        &file_path,
        "file",
        &title,
        Some(file_size),
        Some(mtime_unix),
        &import_at,
        fingerprint.as_deref(),
    )
    .await?;
    if id == 0 {
        db::mark_item_seen_by_path(pool, &file_path, &import_at).await?;
        return Ok(false);
    }

    extract_and_apply_tags(pool, id, &title).await?;

    if let Ok(images) = crate::zip_utils::get_image_entries(&file_path) {
        if !images.is_empty() {
            if let Ok(data) = crate::zip_utils::extract_image(&file_path, &images[0]) {
                let cache_file = cache_dir.join(format!("{}.jpg", id));
                let _ = fs::write(cache_file, data);
            }
        }
    }

    Ok(true)
}

async fn process_folder(pool: &SqlitePool, path: &Path) -> Result<bool> {
    let file_path = path.to_string_lossy().to_string();
    let title = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let metadata = fs::metadata(path)?;
    let mtime_unix = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let import_at = Local::now().to_rfc3339();

    let id = db::insert_item(
        pool,
        &file_path,
        "folder",
        &title,
        None,
        Some(mtime_unix),
        &import_at,
        None,
    )
    .await?;
    if id == 0 {
        db::mark_item_seen_by_path(pool, &file_path, &import_at).await?;
        return Ok(false);
    }

    extract_and_apply_tags(pool, id, &title).await?;
    Ok(true)
}

pub async fn incremental_scan_directory(
    pool: &SqlitePool,
    path_str: &str,
    cache_dir: &Path,
    app: &AppHandle,
    cancel: Option<&ScanCancelState>,
) -> Result<(i32, i32, i32, bool)> {
    let scan_root = Path::new(path_str);
    if !scan_root.is_dir() {
        return Err(anyhow::anyhow!(
            "incremental_scan_directory 需要目錄路徑，但收到非目錄：{}",
            path_str
        ));
    }

    fs::create_dir_all(cache_dir)?;

    let rows = sqlx::query("SELECT id, path, file_modified_at FROM items")
        .fetch_all(pool)
        .await?;

    let mut existing: HashMap<String, (i64, i64)> = HashMap::new();
    for row in &rows {
        let path: String = row.get("path");
        if !Path::new(&path).starts_with(scan_root) {
            continue;
        }
        let id: i64 = row.get("id");
        let mtime: i64 = row.try_get("file_modified_at").unwrap_or(0);
        existing.insert(path, (id, mtime));
    }

    let scannable_exts: HashSet<String> =
        sqlx::query_scalar::<_, String>("SELECT DISTINCT extension FROM type_extensions")
            .fetch_all(pool)
            .await
            .unwrap_or_default()
            .into_iter()
            .collect();

    // 蒐集所有實體存在的路徑（不被 scannable_exts 過濾）。
    // 副檔名白名單只決定「要不要自動匯入」，不決定一筆 row 該不該被刪除。
    let mut all_entries = Vec::new();
    for entry in WalkDir::new(path_str).into_iter().filter_map(|e| e.ok()) {
        if scan_cancelled(cancel) {
            let _ = app.emit(
                "scan-progress",
                serde_json::json!({
                    "current": 0,
                    "name": "掃描已取消",
                    "cancelled": true
                }),
            );
            return Ok((0, 0, 0, true));
        }
        all_entries.push(entry);
    }

    let mut found_paths: HashSet<String> = HashSet::new();
    for entry in &all_entries {
        found_paths.insert(entry.path().to_string_lossy().to_string());
    }

    let mut added = 0i32;
    let mut updated = 0i32;

    for entry in &all_entries {
        if scan_cancelled(cancel) {
            let _ = app.emit(
                "scan-progress",
                serde_json::json!({
                    "current": added + updated,
                    "name": "掃描已取消",
                    "cancelled": true
                }),
            );
            return Ok((added, updated, 0, true));
        }
        let file_path = entry.path().to_string_lossy().to_string();

        // 跳過根目錄本身（避免把工作目錄當成 folder 匯入）
        if entry.path() == scan_root {
            continue;
        }

        let is_dir = entry.file_type().is_dir();

        // 對檔案：副檔名不在白名單就不自動匯入（但保留在 found_paths 中以免被誤刪）
        if !is_dir {
            let scannable = entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| scannable_exts.contains(&ext.to_lowercase()))
                .unwrap_or(false);
            if !scannable && !existing.contains_key(&file_path) {
                continue;
            }
        }

        let metadata = match fs::metadata(entry.path()) {
            Ok(m) => m,
            Err(_) => continue, // 檔案無法讀取（鎖定/損毀/權限）→ 跳過，不中斷整個掃描
        };
        let file_size = if is_dir {
            None
        } else {
            Some(metadata.len() as i64)
        };
        let mtime_unix = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let name = entry
            .path()
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        if let Some((existing_id, db_mtime)) = existing.get(&file_path) {
            if (mtime_unix - db_mtime).abs() > 2 {
                db::update_item_size_mtime(pool, *existing_id, file_size, mtime_unix).await?;
                updated += 1;
            } else {
                db::mark_item_seen(pool, *existing_id, &Local::now().to_rfc3339()).await?;
            }
        } else if is_dir {
            if process_folder(pool, entry.path()).await? {
                added += 1;
            }
        } else if process_zip_file(pool, entry.path(), cache_dir).await? {
            added += 1;
        }
        let _ = app.emit(
            "scan-progress",
            serde_json::json!({
                "current": added + updated,
                "name": name
            }),
        );
    }

    let mut removed = 0i32;
    for (path, (id, _)) in &existing {
        if scan_cancelled(cancel) {
            let _ = app.emit(
                "scan-progress",
                serde_json::json!({
                    "current": added + updated + removed,
                    "name": "掃描已取消",
                    "cancelled": true
                }),
            );
            return Ok((added, updated, removed, true));
        }
        if !found_paths.contains(path) {
            db::mark_item_missing(pool, *id, &Local::now().to_rfc3339()).await?;
            removed += 1;
        }
    }

    Ok((added, updated, removed, false))
}

pub async fn extract_and_apply_tags(pool: &SqlitePool, item_id: i64, title: &str) -> Result<i64> {
    let mut count = 0;
    let re = Regex::new(r"^\s*[\[【](.*?)[\]】]")?;
    if let Some(caps) = re.captures(title) {
        let content = &caps[1];
        let segments: Vec<&str> = content
            .split(['(', ')', ',', '（', '）', '、'])
            .collect();

        for segment in segments {
            let clean_name = segment.trim();
            if clean_name.is_empty() {
                continue;
            }

            let tag_id = if let Some(tag) = db::find_tag_by_name(pool, clean_name).await? {
                tag.id
            } else {
                db::create_tag(pool, clean_name).await?.id
            };

            count += db::add_tag_to_item(pool, item_id, tag_id).await? as i64;
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn compute_file_fingerprint_uses_first_64kb_and_skips_empty_files() {
        let dir = tempdir().unwrap();
        let empty_path = dir.path().join("empty.zip");
        let file_path = dir.path().join("book.zip");

        fs::write(&empty_path, []).unwrap();
        fs::write(&file_path, vec![b'a'; 70 * 1024]).unwrap();

        let actual = compute_file_fingerprint(&file_path).unwrap();
        let mut hasher = Sha256::new();
        hasher.update(vec![b'a'; 64 * 1024]);
        let expected = format!("{:x}", hasher.finalize());

        assert_eq!(compute_file_fingerprint(&empty_path), None);
        assert_eq!(actual, expected);
    }

    #[test]
    fn scan_cancel_state_resets_between_jobs() {
        let state = ScanCancelState::default();

        assert!(!state.is_cancelled());
        state.cancel();
        assert!(state.is_cancelled());
        state.begin_scan();

        assert!(!state.is_cancelled());
    }

    #[tokio::test]
    async fn extract_and_apply_tags_creates_tags_from_leading_brackets() {
        let dir = tempdir().unwrap();
        let pool = db::init_db(dir.path()).await.unwrap();
        let item_id = db::insert_item(
            &pool,
            "C:/Library/book.zip",
            "file",
            "book",
            None,
            None,
            "2026-05-21T10:00:00Z",
            None,
        )
        .await
        .unwrap();

        let count = extract_and_apply_tags(&pool, item_id, "[Action, Drama（Sci-Fi）] Book")
            .await
            .unwrap();
        let tags = db::get_tags(&pool).await.unwrap();
        let mut names: Vec<_> = tags.into_iter().map(|tag| tag.name).collect();
        names.sort();

        assert_eq!(count, 3);
        assert_eq!(names, vec!["Action", "Drama", "Sci-Fi"]);
    }

    #[tokio::test]
    async fn extract_and_apply_tags_ignores_titles_without_leading_brackets() {
        let dir = tempdir().unwrap();
        let pool = db::init_db(dir.path()).await.unwrap();
        let item_id = db::insert_item(
            &pool,
            "C:/Library/book.zip",
            "file",
            "book",
            None,
            None,
            "2026-05-21T10:00:00Z",
            None,
        )
        .await
        .unwrap();

        let count = extract_and_apply_tags(&pool, item_id, "Book [Action]")
            .await
            .unwrap();

        assert_eq!(count, 0);
        assert!(db::get_tags(&pool).await.unwrap().is_empty());
    }
}
