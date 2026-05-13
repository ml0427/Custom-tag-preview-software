use crate::db;
use sqlx::SqlitePool;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

// ── Item-level mutation commands ──────────────────────────────────────────────
// 對單一 item 的欄位更新與生命週期動作（不分 item_type）。
// 檔名仍為 folders.rs 是歷史遺留，內容已收斂為通用 Item 操作。
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
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<(), String> {
    if Path::new(&path).exists() {
        trash::delete(&path).map_err(|e| e.to_string())?;
    }
    db::delete_item_by_path_with_cache(&pool, &thumb_cache_dir(&app), &path)
        .await
        .map_err(|e| e.to_string())
}

/// Remove an item from the DB without touching the filesystem (un-track).
#[tauri::command]
pub async fn untrack_item(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<(), String> {
    db::delete_item_by_path_with_cache(&pool, &thumb_cache_dir(&app), &path)
        .await
        .map_err(|e| e.to_string())
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
