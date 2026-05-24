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
    let imported_count = import_child_folders(&pool, &path).await?;
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

async fn import_child_folders(pool: &SqlitePool, root_path: &str) -> Result<usize, String> {
    let import_at = chrono::Local::now().to_rfc3339();
    let mut imported_count = 0usize;

    for entry in WalkDir::new(root_path).min_depth(1).into_iter() {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_dir() {
            continue;
        }
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

        let inserted_id = db::insert_item(
            pool,
            &path,
            "folder",
            &name,
            None,
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
