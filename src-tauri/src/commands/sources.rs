use crate::db;
use crate::models::Source;
use sqlx::SqlitePool;
use tauri::State;

// ── Source management ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_sources(pool: State<'_, SqlitePool>) -> Result<Vec<Source>, String> {
    db::get_sources(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_source(path: String, pool: State<'_, SqlitePool>) -> Result<Source, String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err(format!("路徑不存在或不是資料夾：{}", path));
    }
    db::add_source(&pool, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_source(id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    db::remove_source(&pool, id)
        .await
        .map_err(|e| e.to_string())
}
