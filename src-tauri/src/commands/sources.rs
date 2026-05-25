use crate::db;
use crate::models::Source;
use serde::Serialize;
use sqlx::SqlitePool;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;

// ── Source management ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSourceResult {
    pub source: Source,
    pub imported_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveSourceResult {
    pub removed_count: u64,
}

#[tauri::command]
pub async fn get_sources(pool: State<'_, SqlitePool>) -> Result<Vec<Source>, String> {
    db::get_sources(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_source(
    path: String,
    pool: State<'_, SqlitePool>,
) -> Result<AddSourceResult, String> {
    if !Path::new(&path).is_dir() {
        return Err(format!("路徑不存在或不是資料夾：{}", path));
    }
    let source = db::add_source(&pool, &path)
        .await
        .map_err(|e| e.to_string())?;
    let imported_count = import_source_tree(&pool, &path).await?;
    Ok(AddSourceResult {
        source,
        imported_count,
    })
}

#[tauri::command]
pub async fn remove_source(
    id: i64,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<RemoveSourceResult, String> {
    let source = db::get_source_by_id(&pool, id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("找不到來源目錄：{}", id))?;
    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    let removed_count = db::delete_items_under_path_with_cache(&pool, &cache_dir, &source.path)
        .await
        .map_err(|e| e.to_string())?;
    db::remove_source(&pool, id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(RemoveSourceResult { removed_count })
}

async fn import_source_tree(pool: &SqlitePool, root_path: &str) -> Result<usize, String> {
    let import_at = chrono::Local::now().to_rfc3339();
    let mut imported_count = 0usize;

    for entry in WalkDir::new(root_path).min_depth(1).into_iter() {
        let entry = entry.map_err(|e| e.to_string())?;
        let is_dir = entry.file_type().is_dir();
        let path = entry.path().to_string_lossy().to_string();
        let name = entry
            .path()
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs() as i64);
        let file_size = if is_dir {
            None
        } else {
            Some(metadata.len() as i64)
        };
        let item_type = if is_dir { "folder" } else { "file" };

        let inserted_id = db::insert_item(
            pool,
            &path,
            item_type,
            &name,
            file_size,
            modified_at,
            &import_at,
            None,
        )
        .await
        .map_err(|e| e.to_string())?;

        if inserted_id == 0 {
            db::mark_item_seen_by_path(pool, &path, &import_at)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            imported_count += 1;
        }
    }

    Ok(imported_count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use sqlx::Row;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn import_source_tree_imports_child_folders_and_files() {
        let db_dir = tempdir().unwrap();
        let source_dir = tempdir().unwrap();
        let pool = db::init_db(db_dir.path()).await.unwrap();

        let nested_dir = source_dir.path().join("Series").join("Volume 1");
        fs::create_dir_all(&nested_dir).unwrap();
        fs::write(source_dir.path().join("cover.jpg"), b"cover").unwrap();
        fs::write(nested_dir.join("page01.jpg"), b"page").unwrap();

        let imported = import_source_tree(&pool, source_dir.path().to_str().unwrap())
            .await
            .unwrap();
        let rows = sqlx::query("SELECT path, item_type, file_size FROM items ORDER BY path ASC")
            .fetch_all(&pool)
            .await
            .unwrap();
        let folder_count = rows
            .iter()
            .filter(|row| row.get::<String, _>("item_type") == "folder")
            .count();
        let file_count = rows
            .iter()
            .filter(|row| row.get::<String, _>("item_type") == "file")
            .count();

        assert_eq!(imported, 4);
        assert_eq!(rows.len(), 4);
        assert_eq!(folder_count, 2);
        assert_eq!(file_count, 2);
        assert!(rows
            .iter()
            .any(|row| row.get::<String, _>("path").ends_with("cover.jpg")
                && row.get::<i64, _>("file_size") == 5));
        assert!(!rows
            .iter()
            .any(|row| row.get::<String, _>("path") == source_dir.path().to_string_lossy()));
    }

    #[tokio::test]
    async fn import_source_tree_marks_existing_items_seen_without_overwriting_metadata() {
        let db_dir = tempdir().unwrap();
        let source_dir = tempdir().unwrap();
        let pool = db::init_db(db_dir.path()).await.unwrap();
        let file_path = source_dir.path().join("cover.jpg");
        fs::write(&file_path, b"cover").unwrap();
        let file_path = file_path.to_string_lossy().to_string();

        db::insert_item(
            &pool,
            &file_path,
            "file",
            "Custom Cover",
            Some(999),
            Some(123),
            "2026-05-24T10:00:00Z",
            None,
        )
        .await
        .unwrap();

        let imported = import_source_tree(&pool, source_dir.path().to_str().unwrap())
            .await
            .unwrap();
        let row = sqlx::query(
            "SELECT name, file_size, exists_on_disk, missing_since, last_seen_at FROM items WHERE path = ?",
        )
        .bind(&file_path)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(imported, 0);
        assert_eq!(row.get::<String, _>("name"), "Custom Cover");
        assert_eq!(row.get::<i64, _>("file_size"), 999);
        assert_eq!(row.get::<i64, _>("exists_on_disk"), 1);
        assert_eq!(row.get::<Option<String>, _>("missing_since"), None);
        assert!(row.get::<String, _>("last_seen_at").contains('T'));
    }
}
