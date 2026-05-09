use super::helpers::fetch_item_tags;
use crate::db;
use crate::models::Folder;
use sqlx::{Row, SqlitePool};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

// ── Folder-item operations (WorkspacePanel backward compat) ───────────────────

#[tauri::command]
pub async fn get_folders(
    tag_id: Option<i64>,
    search: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<Folder>, String> {
    let mut qb = sqlx::QueryBuilder::new("SELECT i.* FROM items i");
    if let Some(tid) = tag_id {
        qb.push(" JOIN item_tags it ON i.id = it.item_id WHERE it.tag_id = ");
        qb.push_bind(tid);
        qb.push(" AND i.item_type = 'folder'");
    } else {
        qb.push(" WHERE i.item_type = 'folder'");
    }
    if let Some(ref q) = search {
        if !q.trim().is_empty() {
            qb.push(" AND i.name LIKE ");
            qb.push_bind(format!("%{}%", q.trim()));
        }
    }
    qb.push(" ORDER BY i.import_at DESC");

    let rows = qb
        .build()
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut folders = Vec::new();
    for row in rows {
        let id: i64 = row.get("id");
        let tags = fetch_item_tags(&pool, id).await?;
        folders.push(Folder {
            id,
            path: row.get("path"),
            name: row.get("name"),
            category: row
                .get::<Option<String>, _>("category")
                .unwrap_or_else(|| "default".to_string()),
            note: row.get::<Option<String>, _>("note").unwrap_or_default(),
            created_at: row.get("import_at"),
            tags,
        });
    }
    Ok(folders)
}

#[tauri::command]
pub async fn create_folder(
    path: String,
    name: String,
    category: String,
    note: String,
    pool: State<'_, SqlitePool>,
) -> Result<Folder, String> {
    sqlx::query(
        "INSERT OR IGNORE INTO items (path, item_type, name, category, note) VALUES (?, 'folder', ?, ?, ?)"
    )
    .bind(&path)
    .bind(&name)
    .bind(&category)
    .bind(&note)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query("SELECT * FROM items WHERE path = ? AND item_type = 'folder'")
        .bind(&path)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(Folder {
        id: row.get("id"),
        path,
        name: row.get("name"),
        category: row
            .get::<Option<String>, _>("category")
            .unwrap_or_else(|| "default".to_string()),
        note: row.get::<Option<String>, _>("note").unwrap_or_default(),
        created_at: row.get("import_at"),
        tags: vec![],
    })
}

#[tauri::command]
pub async fn update_folder(
    id: i64,
    name: String,
    category: String,
    note: String,
    pool: State<'_, SqlitePool>,
) -> Result<Folder, String> {
    sqlx::query(
        "UPDATE items SET name = ?, category = ?, note = ? WHERE id = ? AND item_type = 'folder'",
    )
    .bind(&name)
    .bind(&category)
    .bind(&note)
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query("SELECT * FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let tags = fetch_item_tags(&pool, id).await?;
    Ok(Folder {
        id,
        path: row.get("path"),
        name,
        category,
        note,
        created_at: row.get("import_at"),
        tags,
    })
}

#[tauri::command]
pub async fn delete_folder(id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM items WHERE id = ? AND item_type = 'folder'")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

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
pub async fn add_tag_to_folder(
    folder_id: i64,
    tag_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    db::add_tag_to_item(&pool, folder_id, tag_id)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_tag_from_folder(
    folder_id: i64,
    tag_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?")
        .bind(folder_id)
        .bind(tag_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
