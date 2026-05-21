use sqlx::{sqlite::SqliteConnectOptions, Executor, Sqlite, SqlitePool};
use std::fs;
use std::path::{Path, PathBuf};
use anyhow::Result;
use crate::models::{Tag, Source};

pub async fn init_db(app_data_dir: &Path) -> Result<SqlitePool> {
    if !app_data_dir.exists() {
        fs::create_dir_all(app_data_dir)?;
    }

    let db_path = app_data_dir.join("comic.db");
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options).await?;

    // ── Shared lookup tables ─────────────────────────────────────────────────
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            last_sync DATETIME
        );"
    ).execute(&pool).await?;

    // ── Unified item tables ──────────────────────────────────────────────────
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            path            TEXT NOT NULL UNIQUE,
            item_type       TEXT NOT NULL DEFAULT 'file',
            name            TEXT NOT NULL,
            file_size       INTEGER,
            file_modified_at INTEGER,
            cover_cache_path TEXT,
            fingerprint     TEXT,
            note            TEXT DEFAULT '',
            category        TEXT DEFAULT 'default',
            import_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS item_tags (
            item_id INTEGER NOT NULL,
            tag_id  INTEGER NOT NULL,
            source  TEXT NOT NULL DEFAULT 'direct',
            rule_id INTEGER,
            PRIMARY KEY (item_id, tag_id),
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tag_rules (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            name              TEXT NOT NULL,
            scope_path        TEXT,
            match_type        TEXT NOT NULL DEFAULT 'prefix',
            pattern           TEXT NOT NULL,
            tag_prefix        TEXT,
            tag_name          TEXT,
            auto_apply_on_scan INTEGER NOT NULL DEFAULT 0
        );"
    ).execute(&pool).await?;

    // ── Custom item types ────────────────────────────────────────────────────
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS item_types (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL UNIQUE,
            icon         TEXT NOT NULL DEFAULT '📁',
            display_name TEXT NOT NULL,
            color        TEXT,
            example      TEXT NOT NULL DEFAULT '',
            is_builtin   INTEGER NOT NULL DEFAULT 0
        );"
    ).execute(&pool).await?;

    // Add color column if upgrading from previous version
    let _ = sqlx::query("ALTER TABLE item_types ADD COLUMN color TEXT")
        .execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE item_types ADD COLUMN example TEXT NOT NULL DEFAULT ''")
        .execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE tags ADD COLUMN color TEXT")
        .execute(&pool).await;

    // Normalize legacy tag.color rows to canonical #rrggbb (idempotent).
    // Mirrors src/utils/color.ts normalizeHex; anything unparseable becomes NULL.
    let _ = sqlx::query(
        "UPDATE tags SET color = '#'
         || lower(substr(color, 2, 1)) || lower(substr(color, 2, 1))
         || lower(substr(color, 3, 1)) || lower(substr(color, 3, 1))
         || lower(substr(color, 4, 1)) || lower(substr(color, 4, 1))
         WHERE color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]' AND length(color) = 4"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE tags SET color = '#' || lower(substr(color, 2))
         WHERE color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
         AND length(color) = 7 AND color != lower(color)"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE tags SET color = '#' || lower(color)
         WHERE color GLOB '[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
         AND length(color) = 6"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE tags SET color = NULL
         WHERE color IS NOT NULL
         AND color NOT GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'"
    ).execute(&pool).await;
    let _ = sqlx::query("UPDATE tags SET color = NULL WHERE color = ''")
        .execute(&pool).await;

    // Rename folder_type → category (idempotent)
    let _ = sqlx::query("ALTER TABLE items ADD COLUMN category TEXT DEFAULT 'default'")
        .execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE items SET category = folder_type WHERE folder_type IS NOT NULL AND folder_type != 'default' AND (category IS NULL OR category = 'default')"
    ).execute(&pool).await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS type_extensions (
            type_id   INTEGER NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
            extension TEXT NOT NULL,
            PRIMARY KEY (type_id, extension)
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category_tag_rules (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            category_name TEXT NOT NULL REFERENCES item_types(name) ON DELETE CASCADE,
            match_type    TEXT NOT NULL DEFAULT 'prefix',
            pattern       TEXT NOT NULL,
            tag_name      TEXT NOT NULL DEFAULT ''
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "INSERT OR IGNORE INTO item_types (name, icon, display_name, is_builtin)
         VALUES ('default','📁','一般資料夾',1), ('comic','📚','漫畫',1)"
    ).execute(&pool).await?;

    sqlx::query(
        "INSERT OR IGNORE INTO type_extensions (type_id, extension)
         SELECT id,'zip' FROM item_types WHERE name='comic'
         UNION ALL SELECT id,'rar' FROM item_types WHERE name='comic'
         UNION ALL SELECT id,'7z'  FROM item_types WHERE name='comic'
         UNION ALL SELECT id,'cbz' FROM item_types WHERE name='comic'
         UNION ALL SELECT id,'cbr' FROM item_types WHERE name='comic'"
    ).execute(&pool).await?;

    Ok(pool)
}

// Clear file items only (used by full-scan)
pub async fn clear_database(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        "DELETE FROM item_tags WHERE item_id IN (SELECT id FROM items WHERE item_type = 'file')"
    ).execute(pool).await?;
    sqlx::query("DELETE FROM items WHERE item_type = 'file'").execute(pool).await?;
    sqlx::query("DELETE FROM tags").execute(pool).await?;
    Ok(())
}

pub async fn get_tags(pool: &SqlitePool) -> Result<Vec<Tag>> {
    let tags = sqlx::query_as::<_, Tag>("SELECT id, name, color FROM tags ORDER BY name ASC")
        .fetch_all(pool)
        .await?;
    Ok(tags)
}

pub async fn find_tag_by_name(pool: &SqlitePool, name: &str) -> Result<Option<Tag>> {
    let tag = sqlx::query_as::<_, Tag>("SELECT id, name, color FROM tags WHERE name = ?")
        .bind(name)
        .fetch_optional(pool)
        .await?;
    Ok(tag)
}

pub async fn create_tag(pool: &SqlitePool, name: &str) -> Result<Tag> {
    let id = sqlx::query("INSERT INTO tags (name) VALUES (?)")
        .bind(name)
        .execute(pool)
        .await?
        .last_insert_rowid();
    Ok(Tag { id, name: name.to_string(), color: None })
}

pub async fn get_sources(pool: &SqlitePool) -> Result<Vec<Source>> {
    let sources = sqlx::query_as::<_, Source>(
        "SELECT id, path, last_sync FROM sources ORDER BY id ASC"
    )
    .fetch_all(pool)
    .await?;
    Ok(sources)
}

pub async fn add_source(pool: &SqlitePool, path: &str) -> Result<Source> {
    sqlx::query("INSERT OR IGNORE INTO sources (path) VALUES (?)")
        .bind(path)
        .execute(pool)
        .await?;

    let source = sqlx::query_as::<_, Source>(
        "SELECT id, path, last_sync FROM sources WHERE path = ?"
    )
    .bind(path)
    .fetch_one(pool)
    .await?;

    Ok(source)
}

pub async fn remove_source(pool: &SqlitePool, id: i64) -> Result<()> {
    sqlx::query("DELETE FROM sources WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_source_sync_time(pool: &SqlitePool, id: i64) -> Result<()> {
    sqlx::query("UPDATE sources SET last_sync = datetime('now') WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn add_tag_to_item(pool: &SqlitePool, item_id: i64, tag_id: i64) -> Result<u64> {
    let res = sqlx::query(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source) VALUES (?, ?, 'direct')"
    )
    .bind(item_id)
    .bind(tag_id)
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}

// ── items 表 mutation helpers ────────────────────────────────────────────────
// 凡是寫 `items` 表（INSERT/UPDATE/DELETE）一律走這層，禁止其他模組散寫 SQL。
// helpers 透過 `sqlx::Executor` 通用化，可同時餵 `&pool` 或 `&mut *tx`。
// 涉及縮圖快取的刪除一律經 `delete_item_*_with_cache`，避免快取殘留。

fn thumbnail_cache_path(cache_dir: &Path, id: i64) -> PathBuf {
    cache_dir.join(format!("{}.jpg", id))
}

/// INSERT OR IGNORE 一筆 item，回 last_insert_rowid。
/// 若 path 已存在（UNIQUE 衝突），回 0。
pub async fn insert_item<'e, E>(
    executor: E,
    path: &str,
    item_type: &str,
    name: &str,
    file_size: Option<i64>,
    file_modified_at: Option<i64>,
    import_at: &str,
    fingerprint: Option<&str>,
) -> Result<i64>
where
    E: Executor<'e, Database = Sqlite>,
{
    let result = sqlx::query(
        "INSERT OR IGNORE INTO items (path, item_type, name, file_size, file_modified_at, import_at, fingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(path)
    .bind(item_type)
    .bind(name)
    .bind(file_size)
    .bind(file_modified_at)
    .bind(import_at)
    .bind(fingerprint)
    .execute(executor)
    .await?;
    if result.rows_affected() == 0 {
        return Ok(0);
    }
    Ok(result.last_insert_rowid())
}

pub async fn update_item_category<'e, E>(executor: E, id: i64, category: &str) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET category = ? WHERE id = ?")
        .bind(category)
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn update_item_name<'e, E>(executor: E, id: i64, name: &str) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET name = ? WHERE id = ?")
        .bind(name)
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn update_item_note<'e, E>(executor: E, id: i64, note: &str) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET note = ? WHERE id = ?")
        .bind(note)
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

/// 用於 rename：同時改 name 與 path。
pub async fn update_item_name_and_path<'e, E>(
    executor: E,
    id: i64,
    name: &str,
    path: &str,
) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET name = ?, path = ? WHERE id = ?")
        .bind(name)
        .bind(path)
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

/// 資料夾改名後，連帶把所有底下 item 的 path prefix 換掉。
/// `like_pattern` 通常是 `format!("{}%", old_prefix)`。
pub async fn update_item_path_prefix<'e, E>(
    executor: E,
    old_prefix: &str,
    new_prefix: &str,
    like_pattern: &str,
) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET path = ? || SUBSTR(path, LENGTH(?) + 1) WHERE path LIKE ?")
        .bind(new_prefix)
        .bind(old_prefix)
        .bind(like_pattern)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn update_item_cover<'e, E>(
    executor: E,
    id: i64,
    cover_cache_path: &str,
) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET cover_cache_path = ? WHERE id = ?")
        .bind(cover_cache_path)
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn update_item_size_mtime<'e, E>(
    executor: E,
    id: i64,
    file_size: Option<i64>,
    file_modified_at: i64,
) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET file_size = ?, file_modified_at = ? WHERE id = ?")
        .bind(file_size)
        .bind(file_modified_at)
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn update_item_fingerprint<'e, E>(
    executor: E,
    id: i64,
    fingerprint: &str,
) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET fingerprint = ? WHERE id = ?")
        .bind(fingerprint)
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

/// 把所有 `category = ?` 的 item 重置回 'default'。
/// 用於刪除某個 item_type 後，避免遺孤 category 值。
pub async fn reset_items_category_to_default<'e, E>(
    executor: E,
    category: &str,
) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET category = 'default' WHERE category = ?")
        .bind(category)
        .execute(executor)
        .await?;
    Ok(())
}

/// 依 id 刪除 item，同步清掉縮圖快取檔（失敗忽略，避免阻擋 DB 操作）。
pub async fn delete_item_by_id_with_cache(
    pool: &SqlitePool,
    cache_dir: &Path,
    id: i64,
) -> Result<()> {
    let _ = fs::remove_file(thumbnail_cache_path(cache_dir, id));
    sqlx::query("DELETE FROM items WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 依 path 刪除 item，同步清掉縮圖快取檔。
/// 先查 id 才能算快取路徑；若 path 不存在於 DB，僅執行 DELETE（noop）。
#[allow(dead_code)]
pub struct DeleteOutcome {
    pub affected_rows: u64,
    pub item_id: Option<i64>,
}

pub async fn delete_item_by_path_with_cache(
    pool: &SqlitePool,
    cache_dir: &Path,
    path: &str,
) -> Result<DeleteOutcome> {
    let id: Option<i64> = sqlx::query_scalar("SELECT id FROM items WHERE path = ?")
        .bind(path)
        .fetch_optional(pool)
        .await?;

    let result = sqlx::query("DELETE FROM items WHERE path = ?")
        .bind(path)
        .execute(pool)
        .await?;

    if let Some(item_id) = id {
        let _ = fs::remove_file(thumbnail_cache_path(cache_dir, item_id));
    }
    Ok(DeleteOutcome {
        affected_rows: result.rows_affected(),
        item_id: id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;
    use tempfile::tempdir;

    #[tokio::test]
    async fn init_db_creates_core_tables_and_builtin_types() {
        let dir = tempdir().unwrap();
        let pool = init_db(dir.path()).await.unwrap();

        let item_type_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM item_types")
            .fetch_one(&pool)
            .await
            .unwrap();
        let zip_extension_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM type_extensions WHERE extension = 'zip'"
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert!(dir.path().join("comic.db").exists());
        assert!(item_type_count >= 2);
        assert_eq!(zip_extension_count, 1);
    }

    #[tokio::test]
    async fn insert_item_ignores_duplicate_paths() {
        let dir = tempdir().unwrap();
        let pool = init_db(dir.path()).await.unwrap();

        let first_id = insert_item(
            &pool,
            "C:/Library/book.zip",
            "file",
            "book",
            Some(123),
            Some(456),
            "2026-05-21T10:00:00Z",
            Some("abc"),
        )
        .await
        .unwrap();
        let duplicate_id = insert_item(
            &pool,
            "C:/Library/book.zip",
            "file",
            "book copy",
            Some(999),
            Some(999),
            "2026-05-21T10:00:00Z",
            Some("def"),
        )
        .await
        .unwrap();

        let row = sqlx::query("SELECT name, file_size, fingerprint FROM items WHERE path = ?")
            .bind("C:/Library/book.zip")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert!(first_id > 0);
        assert_eq!(duplicate_id, 0);
        assert_eq!(row.get::<String, _>("name"), "book");
        assert_eq!(row.get::<i64, _>("file_size"), 123);
        assert_eq!(row.get::<String, _>("fingerprint"), "abc");
    }

    #[tokio::test]
    async fn tag_crud_and_item_relationships_are_idempotent() {
        let dir = tempdir().unwrap();
        let pool = init_db(dir.path()).await.unwrap();

        let tag = create_tag(&pool, "Action").await.unwrap();
        let item_id = insert_item(
            &pool,
            "C:/Library/action.zip",
            "file",
            "action",
            None,
            None,
            "2026-05-21T10:00:00Z",
            None,
        )
        .await
        .unwrap();

        let first = add_tag_to_item(&pool, item_id, tag.id).await.unwrap();
        let second = add_tag_to_item(&pool, item_id, tag.id).await.unwrap();
        let found = find_tag_by_name(&pool, "Action").await.unwrap().unwrap();

        assert_eq!(first, 1);
        assert_eq!(second, 0);
        assert_eq!(found.id, tag.id);
        assert_eq!(get_tags(&pool).await.unwrap().len(), 1);
    }
}
