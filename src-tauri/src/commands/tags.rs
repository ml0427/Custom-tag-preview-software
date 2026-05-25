use super::helpers::normalize_hex;
use crate::db;
use crate::models::Tag;
use sqlx::{Row, SqlitePool};
use tauri::State;

// ── Tag management ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_tags(pool: State<'_, SqlitePool>) -> Result<Vec<Tag>, String> {
    db::get_tags(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_tag(name: String, pool: State<'_, SqlitePool>) -> Result<Tag, String> {
    sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?)")
        .bind(&name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    db::find_tag_by_name(&pool, &name)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Tag not found after insert".to_string())
}

#[tauri::command]
pub async fn set_tag_color(
    id: i64,
    color: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<Tag, String> {
    let normalized = match color.as_deref() {
        None | Some("") => None,
        Some(s) => match normalize_hex(s) {
            Some(hex) => Some(hex),
            None => {
                return Err(format!(
                    "Invalid tag color: {:?} (expected #rgb or #rrggbb)",
                    s
                ))
            }
        },
    };
    sqlx::query("UPDATE tags SET color = ? WHERE id = ?")
        .bind(&normalized)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Tag>("SELECT id, name, color FROM tags WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_tag(id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_empty_tags(pool: State<'_, SqlitePool>) -> Result<u64, String> {
    db::delete_empty_tags(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_tag(id: i64, name: String, pool: State<'_, SqlitePool>) -> Result<Tag, String> {
    sqlx::query("UPDATE tags SET name = ? WHERE id = ?")
        .bind(&name)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Tag>("SELECT id, name, color FROM tags WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn merge_tags(
    source_id: i64,
    target_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source)
         SELECT item_id, ?, 'direct' FROM item_tags WHERE tag_id = ?",
    )
    .bind(target_id)
    .bind(source_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(source_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn search_tags(query: String, pool: State<'_, SqlitePool>) -> Result<Vec<Tag>, String> {
    let pattern = format!("%{}%", query);
    sqlx::query_as::<_, Tag>(
        "SELECT id, name, color FROM tags WHERE name LIKE ? ORDER BY name ASC LIMIT 10",
    )
    .bind(pattern)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

// ── Tag counts ────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct TagCount {
    pub id: i64,
    pub count: i64,
}

#[tauri::command]
pub async fn get_tag_counts(pool: State<'_, SqlitePool>) -> Result<Vec<TagCount>, String> {
    let rows = sqlx::query(
        "SELECT tag_id AS id, COUNT(DISTINCT item_id) AS count FROM item_tags GROUP BY tag_id",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|r| TagCount {
            id: r.get("id"),
            count: r.get("count"),
        })
        .collect())
}
