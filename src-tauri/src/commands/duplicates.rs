use super::helpers::{fetch_item_tags, read_item_from_row};
use crate::models::Item;
use crate::scanner;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Emitter, State};

// ── Duplicate detection ───────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct DuplicateGroup {
    pub fingerprint: String,
    pub items: Vec<Item>,
}

#[tauri::command]
pub async fn get_duplicate_groups(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<DuplicateGroup>, String> {
    let fp_rows = sqlx::query(
        "SELECT fingerprint FROM items
         WHERE fingerprint IS NOT NULL AND item_type = 'file'
         GROUP BY fingerprint HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut groups = Vec::new();
    for row in fp_rows {
        let fingerprint: String = row.get("fingerprint");
        let item_rows = sqlx::query(
            "SELECT * FROM items WHERE fingerprint = ? AND item_type = 'file' ORDER BY import_at ASC"
        )
        .bind(&fingerprint)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        for item_row in item_rows {
            let id: i64 = item_row.get("id");
            let tags = fetch_item_tags(&pool, id).await?;
            items.push(read_item_from_row(&item_row, tags));
        }
        groups.push(DuplicateGroup { fingerprint, items });
    }
    Ok(groups)
}

#[tauri::command]
pub async fn compute_fingerprints(
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<i32, String> {
    let rows =
        sqlx::query("SELECT id, path FROM items WHERE fingerprint IS NULL AND item_type = 'file'")
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    let total = rows.len() as i32;
    let mut count = 0i32;
    for row in &rows {
        let id: i64 = row.get("id");
        let path: String = row.get("path");
        if let Some(fp) = scanner::compute_file_fingerprint(std::path::Path::new(&path)) {
            let _ = sqlx::query("UPDATE items SET fingerprint = ? WHERE id = ?")
                .bind(&fp)
                .bind(id)
                .execute(&*pool)
                .await;
            count += 1;
        }
        let _ = app.emit(
            "fingerprint-progress",
            serde_json::json!({
                "current": count,
                "total": total
            }),
        );
    }
    Ok(count)
}
