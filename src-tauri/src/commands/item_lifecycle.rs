use crate::db;
use crate::debug_log::DebugState;
use serde_json::json;
use sqlx::SqlitePool;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

// ── Item-level mutation commands ──────────────────────────────────────────────
// 對單一 item 的欄位更新與生命週期動作（不分 item_type）。
// 所有寫操作一律經 `db::` helpers，禁止直接寫 SQL。

fn thumb_cache_dir(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache")
}

/// Move file/folder to system Recycle Bin, then remove its DB record.
#[tauri::command]
pub async fn trash_item(
    path: String,
    allow_missing: Option<bool>,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
    debug_state: State<'_, DebugState>,
) -> Result<(), String> {
    if Path::new(&path).exists() {
        trash::delete(&path).map_err(|e| e.to_string())?;
    }
    let outcome = db::delete_item_by_path_with_cache(&pool, &thumb_cache_dir(&app), &path)
        .await
        .map_err(|e| e.to_string())?;
    handle_delete_outcome(
        &debug_state,
        "trash_item",
        &path,
        outcome.affected_rows,
        allow_missing.unwrap_or(false),
    )
}

/// Remove an item from the DB without touching the filesystem (un-track).
#[tauri::command]
pub async fn untrack_item(
    path: String,
    allow_missing: Option<bool>,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
    debug_state: State<'_, DebugState>,
) -> Result<(), String> {
    let outcome = db::delete_item_by_path_with_cache(&pool, &thumb_cache_dir(&app), &path)
        .await
        .map_err(|e| e.to_string())?;
    handle_delete_outcome(
        &debug_state,
        "untrack_item",
        &path,
        outcome.affected_rows,
        allow_missing.unwrap_or(false),
    )
}

fn handle_delete_outcome(
    debug_state: &DebugState,
    operation: &str,
    path: &str,
    affected_rows: u64,
    allow_missing: bool,
) -> Result<(), String> {
    if affected_rows >= 1 {
        debug_state.log_info(operation, json!({
            "path": path,
            "affected_rows": affected_rows,
            "allow_missing": allow_missing,
        }));
        return Ok(());
    }
    if allow_missing {
        debug_state.log_warn(operation, json!({
            "path": path,
            "affected_rows": 0,
            "allow_missing": true,
            "message": "no row deleted (lenient, treated as success)",
        }));
        Ok(())
    } else {
        debug_state.log_error(operation, json!({
            "path": path,
            "affected_rows": 0,
            "allow_missing": false,
            "message": "expected to delete >= 1 row but DB had no matching record",
        }));
        Err("刪除失敗：資料庫沒有找到對應紀錄，可能已被其他操作移除。".to_string())
    }
}

#[tauri::command]
pub async fn set_item_category(
    id: i64,
    category: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    db::update_item_category(&*pool, id, &category)
        .await
        .map_err(|e| e.to_string())
}

/// 改顯示名稱（純 DB 動作，不動實體檔名）。連帶改實體檔名請用 `rename_item`。
#[tauri::command]
pub async fn set_item_display_name(
    id: i64,
    name: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    db::update_item_name(&*pool, id, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_item_note(
    id: i64,
    note: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    db::update_item_note(&*pool, id, &note)
        .await
        .map_err(|e| e.to_string())
}
