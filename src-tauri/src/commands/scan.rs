use crate::{db, scanner};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};

// ── Scan ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn scan_directory(
    path: String,
    confirm_full_rescan: bool,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    if !confirm_full_rescan {
        return Err(
            "scan_directory 會清空資料庫後重掃，必須明確傳入 confirmFullRescan: true".to_string(),
        );
    }

    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    scanner::full_rescan_with_clear(&pool, &path, &cache_dir, &app)
        .await
        .map(|count| serde_json::json!({ "message": "Scan completed", "addedCount": count }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn incremental_scan(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    scanner::incremental_scan_directory(&pool, &path, &cache_dir, &app)
        .await
        .map(|(added, updated, removed)| {
            serde_json::json!({
                "message": "增量掃描完成",
                "added": added,
                "updated": updated,
                "removed": removed
            })
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_sources(
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let sources = db::get_sources(&pool).await.map_err(|e| e.to_string())?;
    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");

    let mut total_added = 0i32;
    let mut total_updated = 0i32;
    let mut total_removed = 0i32;
    let mut errors: Vec<String> = Vec::new();

    for source in &sources {
        match scanner::incremental_scan_directory(&pool, &source.path, &cache_dir, &app).await {
            Ok((added, updated, removed)) => {
                total_added += added;
                total_updated += updated;
                total_removed += removed;
                let _ = db::update_source_sync_time(&pool, source.id).await;
            }
            Err(e) => errors.push(format!("{}: {}", source.path, e)),
        }
    }

    Ok(serde_json::json!({
        "added": total_added,
        "updated": total_updated,
        "removed": total_removed,
        "sourceCount": sources.len(),
        "errors": errors
    }))
}
