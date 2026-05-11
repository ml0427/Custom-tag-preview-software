use sqlx::SqlitePool;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

// ── Item-level mutation commands ──────────────────────────────────────────────
// 對單一 item 的欄位更新與生命週期動作（不分 item_type）。
// 檔名仍為 folders.rs 是歷史遺留，內容已收斂為通用 Item 操作。

/// Move file/folder to system Recycle Bin, then remove its DB record.
#[tauri::command]
pub async fn trash_item(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<(), String> {
    let id: Option<i64> = sqlx::query_scalar("SELECT id FROM items WHERE path = ?")
        .bind(&path)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if Path::new(&path).exists() {
        trash::delete(&path).map_err(|e| e.to_string())?;
    }
    sqlx::query("DELETE FROM items WHERE path = ?")
        .bind(&path)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(item_id) = id {
        let cache_dir = app
            .path()
            .app_data_dir()
            .expect("failed to get app data dir")
            .join("thumb_cache");
        let _ = fs::remove_file(cache_dir.join(format!("{}.jpg", item_id)));
    }
    Ok(())
}

/// Remove an item from the DB without touching the filesystem (un-track).
#[tauri::command]
pub async fn untrack_item(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<(), String> {
    let id: Option<i64> = sqlx::query_scalar("SELECT id FROM items WHERE path = ?")
        .bind(&path)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM items WHERE path = ?")
        .bind(&path)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(item_id) = id {
        let cache_dir = app
            .path()
            .app_data_dir()
            .expect("failed to get app data dir")
            .join("thumb_cache");
        let _ = fs::remove_file(cache_dir.join(format!("{}.jpg", item_id)));
    }
    Ok(())
}

#[tauri::command]
pub async fn set_item_category(
    id: i64,
    category: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE items SET category = ? WHERE id = ?")
        .bind(&category)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 改顯示名稱（純 DB 動作，不動實體檔名）。連帶改實體檔名請用 `rename_item`。
#[tauri::command]
pub async fn set_item_display_name(
    id: i64,
    name: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE items SET name = ? WHERE id = ?")
        .bind(&name)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_item_note(
    id: i64,
    note: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE items SET note = ? WHERE id = ?")
        .bind(&note)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
