use crate::models::{Item, Tag};
use anyhow::Result;
use sqlx::{Row, SqlitePool};
// ── Helper ────────────────────────────────────────────────────────────────────

// Mirrors src/utils/color.ts normalizeHex — single source of truth for tag.color shape.
// Tauri commands are a public trust boundary; never trust the JS side to have validated.
pub(super) fn normalize_hex(input: &str) -> Option<String> {
    let trimmed = input.trim().to_lowercase();
    if trimmed.is_empty() {
        return None;
    }
    let stripped = trimmed.strip_prefix('#').unwrap_or(&trimmed);
    let valid = matches!(stripped.len(), 3 | 6) && stripped.chars().all(|c| c.is_ascii_hexdigit());
    if !valid {
        return None;
    }
    let expanded = if stripped.len() == 3 {
        stripped.chars().flat_map(|c| [c, c]).collect::<String>()
    } else {
        stripped.to_string()
    };
    Some(format!("#{}", expanded))
}

pub(super) fn read_item_from_row(row: &sqlx::sqlite::SqliteRow, tags: Vec<Tag>) -> Item {
    Item {
        id: row.get("id"),
        path: row.get("path"),
        item_type: row.get("item_type"),
        name: row.get("name"),
        file_size: row.get("file_size"),
        file_modified_at: row.get("file_modified_at"),
        cover_cache_path: row.get("cover_cache_path"),
        fingerprint: row.get("fingerprint"),
        note: row.get("note"),
        category: row.get("category"),
        import_at: row.get("import_at"),
        tags,
    }
}

pub(super) async fn fetch_item_tags(pool: &SqlitePool, item_id: i64) -> Result<Vec<Tag>, String> {
    sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ?"
    )
    .bind(item_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}
