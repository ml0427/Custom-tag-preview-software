use crate::{db, scanner};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};

// ── Scan ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cancel_scan(
    cancel_state: State<'_, scanner::ScanCancelState>,
) -> Result<serde_json::Value, String> {
    cancel_state.cancel();
    Ok(serde_json::json!({ "cancelled": true }))
}

#[tauri::command]
pub async fn scan_directory(
    path: String,
    confirm_full_rescan: bool,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
    cancel_state: State<'_, scanner::ScanCancelState>,
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
    cancel_state.begin_scan();
    scanner::full_rescan_with_clear(&pool, &path, &cache_dir, &app, Some(cancel_state.inner()))
        .await
        .map(|(count, cancelled)| {
            serde_json::json!({
                "message": if cancelled { "掃描已取消" } else { "Scan completed" },
                "addedCount": count,
                "cancelled": cancelled
            })
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn incremental_scan(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
    cancel_state: State<'_, scanner::ScanCancelState>,
) -> Result<serde_json::Value, String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    cancel_state.begin_scan();
    scanner::incremental_scan_directory(&pool, &path, &cache_dir, &app, Some(cancel_state.inner()))
        .await
        .map(|(added, updated, removed, cancelled)| {
            serde_json::json!({
                "message": if cancelled { "掃描已取消" } else { "增量掃描完成" },
                "added": added,
                "updated": updated,
                "removed": removed,
                "cancelled": cancelled
            })
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_sources(
    pool: State<'_, SqlitePool>,
    app: AppHandle,
    cancel_state: State<'_, scanner::ScanCancelState>,
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
    let mut cancelled = false;

    cancel_state.begin_scan();
    for source in &sources {
        if cancel_state.is_cancelled() {
            cancelled = true;
            break;
        }
        match scanner::incremental_scan_directory(
            &pool,
            &source.path,
            &cache_dir,
            &app,
            Some(cancel_state.inner()),
        )
        .await
        {
            Ok((added, updated, removed, was_cancelled)) => {
                total_added += added;
                total_updated += updated;
                total_removed += removed;
                if was_cancelled {
                    cancelled = true;
                    break;
                }
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
        "errors": errors,
        "cancelled": cancelled
    }))
}
