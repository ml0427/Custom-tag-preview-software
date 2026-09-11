use crate::models::{Item, Tag};
use anyhow::Result;
use sqlx::{Row, SqlitePool};

pub(super) async fn fetch_tags_for_items(pool: &SqlitePool, ids: &[i64]) -> Result<std::collections::HashMap<i64, Vec<Tag>>, String> {
    let mut result = std::collections::HashMap::<i64, Vec<Tag>>::new();
    for chunk in ids.chunks(500) {
        let mut query = sqlx::QueryBuilder::<sqlx::Sqlite>::new("SELECT it.item_id, t.id, t.name, t.color FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id IN (");
        let mut values = query.separated(",");
        for id in chunk { values.push_bind(*id); }
        query.push(") ORDER BY t.name");
        for row in query.build().fetch_all(pool).await.map_err(|e| e.to_string())? {
            result.entry(row.get("item_id")).or_default().push(Tag { id: row.get("id"), name: row.get("name"), color: row.get("color") });
        }
    }
    Ok(result)
}
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
        exists_on_disk: row.get::<i64, _>("exists_on_disk") != 0,
        missing_since: row.get("missing_since"),
        last_seen_at: row.get("last_seen_at"),
        open_count: row.get("open_count"),
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
