use sqlx::{sqlite::SqliteConnectOptions, Executor, Row, Sqlite, SqlitePool, SqliteConnection};
use std::fs;
use std::path::{Path, PathBuf};
use anyhow::Result;
use crate::models::{Tag, Source};

pub fn path_key(path: &str) -> String {
    path.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

pub fn escape_like(value: &str) -> String {
    value.replace('!', "!!").replace('%', "!%").replace('_', "!_")
}

pub async fn backup_database(pool: &SqlitePool, directory: &Path, reason: &str) -> Result<PathBuf> {
    let backups = directory.join("backups");
    fs::create_dir_all(&backups)?;
    let path = backups.join(format!("comic-{}-{}.db", reason, chrono::Utc::now().format("%Y%m%dT%H%M%S%.9f")));
    sqlx::query("VACUUM INTO ?").bind(path.to_string_lossy().as_ref()).execute(pool).await?;
    Ok(path)
}

async fn column_exists(conn: &mut SqliteConnection, table: &str, column: &str) -> Result<bool> {
    let rows = sqlx::query(&format!("PRAGMA table_info({table})")).fetch_all(conn).await?;
    Ok(rows.iter().any(|row| row.get::<String, _>("name") == column))
}

async fn ensure_column(conn: &mut SqliteConnection, table: &str, column: &str, definition: &str) -> Result<()> {
    if !column_exists(&mut *conn, table, column).await? {
        sqlx::query(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}")).execute(conn).await?;
    }
    Ok(())
}

pub async fn init_db(app_data_dir: &Path) -> Result<SqlitePool> {
    if !app_data_dir.exists() {
        fs::create_dir_all(app_data_dir)?;
    }

    let db_path = app_data_dir.join("comic.db");
    let existed = db_path.exists();
    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options).await?;

    let version: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&pool).await?;
    if version > 1 { anyhow::bail!("資料庫版本較新，請使用較新版應用程式"); }
    if version == 1 { return Ok(pool); }
    if existed { backup_database(&pool, app_data_dir, "before-migration").await?; }
    let mut tx = pool.begin().await?;
    backup_legacy_tables(&mut tx).await?;

    // ── Shared lookup tables ─────────────────────────────────────────────────
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );"
    ).execute(&mut *tx).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            last_sync DATETIME
        );"
    ).execute(&mut *tx).await?;

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
            exists_on_disk  INTEGER NOT NULL DEFAULT 1,
            missing_since   TEXT,
            last_seen_at    TEXT,
            open_count      INTEGER NOT NULL DEFAULT 0,
            import_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    ).execute(&mut *tx).await?;

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
    ).execute(&mut *tx).await?;

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
    ).execute(&mut *tx).await?;

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
    ).execute(&mut *tx).await?;

    for (table, name, definition) in [
        ("item_types", "color", "TEXT"), ("item_types", "example", "TEXT NOT NULL DEFAULT ''"),
        ("tags", "color", "TEXT"), ("items", "exists_on_disk", "INTEGER NOT NULL DEFAULT 1"),
        ("items", "missing_since", "TEXT"), ("items", "last_seen_at", "TEXT"),
        ("items", "open_count", "INTEGER NOT NULL DEFAULT 0"),
        ("items", "category", "TEXT DEFAULT 'default'"),
    ] { ensure_column(&mut tx, table, name, definition).await?; }
    sqlx::query("UPDATE items SET last_seen_at = COALESCE(last_seen_at, import_at), exists_on_disk = COALESCE(exists_on_disk, 1)")
        .execute(&mut *tx).await?;

    // Normalize legacy tag.color rows to canonical #rrggbb (idempotent).
    // Mirrors src/utils/color.ts normalizeHex; anything unparseable becomes NULL.
    sqlx::query(
        "UPDATE tags SET color = '#'
         || lower(substr(color, 2, 1)) || lower(substr(color, 2, 1))
         || lower(substr(color, 3, 1)) || lower(substr(color, 3, 1))
         || lower(substr(color, 4, 1)) || lower(substr(color, 4, 1))
         WHERE color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]' AND length(color) = 4"
    ).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE tags SET color = '#' || lower(substr(color, 2))
         WHERE color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
         AND length(color) = 7 AND color != lower(color)"
    ).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE tags SET color = '#' || lower(color)
         WHERE color GLOB '[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
         AND length(color) = 6"
    ).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE tags SET color = NULL
         WHERE color IS NOT NULL
         AND color NOT GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'"
    ).execute(&mut *tx).await?;
    sqlx::query("UPDATE tags SET color = NULL WHERE color = ''")
        .execute(&mut *tx).await?;

    if column_exists(&mut tx, "items", "folder_type").await? {
        sqlx::query("UPDATE items SET category = folder_type WHERE folder_type IS NOT NULL AND folder_type != 'default' AND (category IS NULL OR category = 'default')")
            .execute(&mut *tx).await?;
    }

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS type_extensions (
            type_id   INTEGER NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
            extension TEXT NOT NULL,
            PRIMARY KEY (type_id, extension)
        );"
    ).execute(&mut *tx).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category_tag_rules (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            category_name TEXT NOT NULL REFERENCES item_types(name) ON DELETE CASCADE,
            match_type    TEXT NOT NULL DEFAULT 'prefix',
            pattern       TEXT NOT NULL,
            tag_name      TEXT NOT NULL DEFAULT ''
        );"
    ).execute(&mut *tx).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS folder_rule_presets (
            folder_item_id      INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
            preset_type_id      INTEGER NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
            apply_to_subfolders INTEGER NOT NULL DEFAULT 0,
            apply_to_files      INTEGER NOT NULL DEFAULT 0,
            file_extensions     TEXT NOT NULL DEFAULT '',
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    ).execute(&mut *tx).await?;

    sqlx::query(
        "INSERT OR IGNORE INTO item_types (name, icon, display_name, is_builtin)
         VALUES ('default','📁','一般資料夾',1), ('comic','📚','漫畫',1)"
    ).execute(&mut *tx).await?;

    sqlx::query(
        "INSERT OR IGNORE INTO type_extensions (type_id, extension)
         SELECT id,'zip' FROM item_types WHERE name='comic'
         UNION ALL SELECT id,'rar' FROM item_types WHERE name='comic'
         UNION ALL SELECT id,'7z'  FROM item_types WHERE name='comic'
         UNION ALL SELECT id,'cbz' FROM item_types WHERE name='comic'
         UNION ALL SELECT id,'cbr' FROM item_types WHERE name='comic'"
    ).execute(&mut *tx).await?;

    sqlx::query("UPDATE items SET fingerprint = NULL WHERE fingerprint IS NOT NULL AND fingerprint NOT LIKE 'sha256:%'")
        .execute(&mut *tx).await?;
    for sql in [
        "CREATE INDEX IF NOT EXISTS idx_item_tags_tag_item ON item_tags(tag_id, item_id)",
        "CREATE INDEX IF NOT EXISTS idx_items_fingerprint ON items(fingerprint)",
        "CREATE INDEX IF NOT EXISTS idx_items_import ON items(import_at, id)",
        "CREATE INDEX IF NOT EXISTS idx_items_open_count ON items(open_count, id)",
        "PRAGMA user_version = 1",
    ] { sqlx::query(sql).execute(&mut *tx).await?; }
    tx.commit().await?;
    Ok(pool)
}

async fn backup_legacy_tables(pool: &mut SqliteConnection) -> Result<()> {
    for table in ["comics", "folders", "comic_tags", "folder_tags"] {
        backup_legacy_table(&mut *pool, table).await?;
    }
    Ok(())
}

async fn backup_legacy_table(pool: &mut SqliteConnection, table: &str) -> Result<()> {
    let backup = format!("_legacy_{}_backup", table);
    if !table_exists(&mut *pool, table).await? || table_exists(&mut *pool, &backup).await? {
        return Ok(());
    }

    let sql = format!("ALTER TABLE \"{}\" RENAME TO \"{}\"", table, backup);
    sqlx::query(&sql).execute(pool).await?;
    Ok(())
}

async fn table_exists<'e, E: Executor<'e, Database = Sqlite>>(pool: E, table: &str) -> Result<bool> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .bind(table)
    .fetch_one(pool)
    .await?;
    Ok(count > 0)
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

pub async fn delete_empty_tags(pool: &SqlitePool) -> Result<u64> {
    let result = sqlx::query(
        "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM item_tags)"
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
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

pub async fn get_source_by_id(pool: &SqlitePool, id: i64) -> Result<Option<Source>> {
    let source = sqlx::query_as::<_, Source>(
        "SELECT id, path, last_sync FROM sources WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(source)
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
        "INSERT OR IGNORE INTO items (path, item_type, name, file_size, file_modified_at, import_at, fingerprint, exists_on_disk, missing_since, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)"
    )
    .bind(path)
    .bind(item_type)
    .bind(name)
    .bind(file_size)
    .bind(file_modified_at)
    .bind(import_at)
    .bind(fingerprint)
    .bind(import_at)
    .execute(executor)
    .await?;
    if result.rows_affected() == 0 {
        return Ok(0);
    }
    Ok(result.last_insert_rowid())
}

pub async fn mark_item_seen<'e, E>(executor: E, id: i64, seen_at: &str) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query(
        "UPDATE items SET exists_on_disk = 1, missing_since = NULL, last_seen_at = ? WHERE id = ?"
    )
    .bind(seen_at)
    .bind(id)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn mark_item_seen_by_path<'e, E>(executor: E, path: &str, seen_at: &str) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query(
        "UPDATE items SET exists_on_disk = 1, missing_since = NULL, last_seen_at = ? WHERE path = ?"
    )
    .bind(seen_at)
    .bind(path)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn mark_item_missing<'e, E>(executor: E, id: i64, missing_since: &str) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query(
        "UPDATE items SET exists_on_disk = 0, missing_since = COALESCE(missing_since, ?) WHERE id = ?"
    )
    .bind(missing_since)
    .bind(id)
    .execute(executor)
    .await?;
    Ok(())
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
    _like_pattern: &str,
) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    let normalized_prefix = format!("{}/", path_key(old_prefix));
    sqlx::query("UPDATE items SET path = ? || SUBSTR(path, LENGTH(?) + 1) WHERE REPLACE(path, '\\', '/') LIKE ? ESCAPE '!'")
        .bind(new_prefix)
        .bind(old_prefix)
        .bind(format!("{}%", escape_like(&normalized_prefix)))
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
    sqlx::query("UPDATE items SET fingerprint = CASE WHEN file_size IS NOT ? OR file_modified_at IS NOT ? THEN NULL ELSE fingerprint END, file_size = ?, file_modified_at = ?, exists_on_disk = 1, missing_since = NULL, last_seen_at = datetime('now') WHERE id = ?")
        .bind(file_size)
        .bind(file_modified_at)
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

pub async fn increment_item_open_count<'e, E>(executor: E, id: i64) -> Result<()>
where
    E: Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE items SET open_count = open_count + 1 WHERE id = ?")
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
#[allow(dead_code)]
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
    let id: Option<i64> = sqlx::query_scalar("SELECT id FROM items WHERE REPLACE(path, '\\', '/') = ? COLLATE NOCASE")
        .bind(path_key(path))
        .fetch_optional(pool)
        .await?;

    let affected_rows = delete_items_under_path_with_cache(pool, cache_dir, path).await?;
    Ok(DeleteOutcome {
        affected_rows,
        item_id: id,
    })
}

pub async fn delete_items_under_path_with_cache(
    pool: &SqlitePool,
    cache_dir: &Path,
    root_path: &str,
) -> Result<u64> {
    let root = path_key(root_path);
    let pattern = format!("{}/%", escape_like(&root));
    let mut tx = pool.begin().await?;
    let rows = sqlx::query("SELECT id FROM items WHERE REPLACE(path, '\\', '/') = ? COLLATE NOCASE OR REPLACE(path, '\\', '/') LIKE ? ESCAPE '!'")
        .bind(&root)
        .bind(&pattern)
        .fetch_all(&mut *tx)
        .await?;
    let result = sqlx::query("DELETE FROM items WHERE REPLACE(path, '\\', '/') = ? COLLATE NOCASE OR REPLACE(path, '\\', '/') LIKE ? ESCAPE '!'")
        .bind(root)
        .bind(pattern)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    for row in &rows {
        let id: i64 = row.get("id");
        let cache = thumbnail_cache_path(cache_dir, id);
        let _ = fs::remove_file(cache.with_extension("version.json"));
        let _ = fs::remove_file(cache);
    }

    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;
    use tempfile::tempdir;

    #[tokio::test]
    async fn rename_and_delete_trees_treat_wildcards_literally() {
        let dir = tempdir().unwrap(); let pool = init_db(dir.path()).await.unwrap();
        for path in ["C:\\Library\\A_", "C:\\Library\\A_\\one.zip", "C:\\Library\\AB\\two.zip", "C:\\Library\\A%\\three.zip"] {
            insert_item(&pool, path, "file", "item", None, None, "now", None).await.unwrap();
        }
        update_item_path_prefix(&pool, "C:\\Library\\A_\\", "C:\\Library\\New\\", "unused").await.unwrap();
        let paths: Vec<String> = sqlx::query_scalar("SELECT path FROM items ORDER BY id").fetch_all(&pool).await.unwrap();
        assert_eq!(paths[1], "C:\\Library\\New\\one.zip");
        assert_eq!(paths[2], "C:\\Library\\AB\\two.zip");
        let removed = delete_items_under_path_with_cache(&pool, dir.path(), "c:/library/A%").await.unwrap();
        assert_eq!(removed, 1);
        let removed = delete_item_by_path_with_cache(&pool, dir.path(), "c:/library/new").await.unwrap();
        assert_eq!(removed.affected_rows, 1);
        assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM items").fetch_one(&pool).await.unwrap(), 2);
    }

    #[tokio::test]
    async fn changed_content_invalidates_fingerprint_but_unchanged_open_preserves_it() {
        let dir = tempdir().unwrap(); let pool = init_db(dir.path()).await.unwrap();
        let id = insert_item(&pool, "book.zip", "file", "book", Some(1), Some(10), "now", Some("sha256:old")).await.unwrap();
        update_item_size_mtime(&pool, id, Some(1), 10).await.unwrap();
        assert_eq!(sqlx::query_scalar::<_,Option<String>>("SELECT fingerprint FROM items WHERE id=?").bind(id).fetch_one(&pool).await.unwrap().as_deref(), Some("sha256:old"));
        update_item_size_mtime(&pool, id, Some(2), 10).await.unwrap();
        assert!(sqlx::query_scalar::<_,Option<String>>("SELECT fingerprint FROM items WHERE id=?").bind(id).fetch_one(&pool).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn failed_migration_rolls_back_and_keeps_readable_backup() {
        let dir = tempdir().unwrap();
        let pool = SqlitePool::connect_with(SqliteConnectOptions::new().filename(dir.path().join("comic.db")).create_if_missing(true)).await.unwrap();
        sqlx::query("CREATE TABLE tags(id INTEGER PRIMARY KEY, name TEXT, color TEXT)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO tags VALUES (1,'keep','#ABC')").execute(&pool).await.unwrap();
        sqlx::query("CREATE TRIGGER reject_upgrade BEFORE UPDATE ON tags BEGIN SELECT RAISE(ABORT,'blocked'); END").execute(&pool).await.unwrap();
        assert!(init_db(dir.path()).await.is_err());
        assert_eq!(sqlx::query_scalar::<_,i64>("PRAGMA user_version").fetch_one(&pool).await.unwrap(), 0);
        assert!(!table_exists(&pool, "items").await.unwrap());
        let backup = fs::read_dir(dir.path().join("backups")).unwrap().next().unwrap().unwrap().path();
        let saved = SqlitePool::connect_with(SqliteConnectOptions::new().filename(backup).read_only(true)).await.unwrap();
        assert_eq!(sqlx::query_scalar::<_,String>("SELECT color FROM tags").fetch_one(&saved).await.unwrap(), "#ABC");
    }

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
    async fn init_db_creates_folder_rule_preset_bindings_table() {
        let dir = tempdir().unwrap();
        let pool = init_db(dir.path()).await.unwrap();

        let table_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'folder_rule_presets'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let column_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info('folder_rule_presets') WHERE name IN ('folder_item_id', 'preset_type_id', 'apply_to_subfolders', 'apply_to_files', 'file_extensions')")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(table_count, 1);
        assert_eq!(column_count, 5);
    }

    #[tokio::test]
    async fn init_db_adds_open_count_to_items() {
        let dir = tempdir().unwrap();
        let pool = init_db(dir.path()).await.unwrap();

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name = 'open_count'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn increment_item_open_count_updates_existing_item() {
        let dir = tempdir().unwrap();
        let pool = init_db(dir.path()).await.unwrap();
        let item_id = insert_item(
            &pool,
            "C:/Library/book.zip",
            "file",
            "book",
            Some(123),
            Some(456),
            "2026-06-19T10:00:00Z",
            None,
        )
        .await
        .unwrap();

        increment_item_open_count(&pool, item_id).await.unwrap();
        increment_item_open_count(&pool, item_id).await.unwrap();

        let open_count: i64 = sqlx::query_scalar("SELECT open_count FROM items WHERE id = ?")
            .bind(item_id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(open_count, 2);
    }

    #[tokio::test]
    async fn init_db_renames_legacy_tables_to_backups_idempotently() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("comic.db");
        let options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        let legacy_pool = SqlitePool::connect_with(options).await.unwrap();

        sqlx::query("CREATE TABLE comics (id INTEGER PRIMARY KEY, title TEXT NOT NULL)")
            .execute(&legacy_pool)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE folders (id INTEGER PRIMARY KEY, path TEXT NOT NULL)")
            .execute(&legacy_pool)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE comic_tags (comic_id INTEGER NOT NULL, tag_id INTEGER NOT NULL)")
            .execute(&legacy_pool)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE folder_tags (folder_id INTEGER NOT NULL, tag_id INTEGER NOT NULL)")
            .execute(&legacy_pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO comics (id, title) VALUES (1, 'Legacy Comic')")
            .execute(&legacy_pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO folders (id, path) VALUES (1, 'C:/Legacy')")
            .execute(&legacy_pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO comic_tags (comic_id, tag_id) VALUES (1, 7)")
            .execute(&legacy_pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO folder_tags (folder_id, tag_id) VALUES (1, 8)")
            .execute(&legacy_pool)
            .await
            .unwrap();
        legacy_pool.close().await;

        let pool = init_db(dir.path()).await.unwrap();
        init_db(dir.path()).await.unwrap().close().await;

        for table in ["comics", "folders", "comic_tags", "folder_tags"] {
            assert!(!table_exists(&pool, table).await.unwrap());
            assert!(
                table_exists(&pool, &format!("_legacy_{}_backup", table))
                    .await
                    .unwrap()
            );
        }

        let comic_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _legacy_comics_backup")
            .fetch_one(&pool)
            .await
            .unwrap();
        let folder_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _legacy_folders_backup")
            .fetch_one(&pool)
            .await
            .unwrap();
        let comic_tag_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM _legacy_comic_tags_backup")
                .fetch_one(&pool)
                .await
                .unwrap();
        let folder_tag_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM _legacy_folder_tags_backup")
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(comic_count, 1);
        assert_eq!(folder_count, 1);
        assert_eq!(comic_tag_count, 1);
        assert_eq!(folder_tag_count, 1);
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

    #[tokio::test]
    async fn item_presence_markers_are_idempotent() {
        let dir = tempdir().unwrap();
        let pool = init_db(dir.path()).await.unwrap();

        let item_id = insert_item(
            &pool,
            "C:/Library/book.zip",
            "file",
            "book",
            Some(123),
            Some(456),
            "2026-05-21T10:00:00Z",
            None,
        )
        .await
        .unwrap();

        mark_item_missing(&pool, item_id, "2026-05-21T11:00:00Z").await.unwrap();
        mark_item_missing(&pool, item_id, "2026-05-21T12:00:00Z").await.unwrap();
        let missing_row = sqlx::query(
            "SELECT exists_on_disk, missing_since, last_seen_at FROM items WHERE id = ?"
        )
        .bind(item_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(missing_row.get::<i64, _>("exists_on_disk"), 0);
        assert_eq!(missing_row.get::<String, _>("missing_since"), "2026-05-21T11:00:00Z");

        mark_item_seen(&pool, item_id, "2026-05-21T13:00:00Z").await.unwrap();
        let seen_row = sqlx::query(
            "SELECT exists_on_disk, missing_since, last_seen_at FROM items WHERE id = ?"
        )
        .bind(item_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(seen_row.get::<i64, _>("exists_on_disk"), 1);
        assert_eq!(seen_row.get::<Option<String>, _>("missing_since"), None);
        assert_eq!(seen_row.get::<String, _>("last_seen_at"), "2026-05-21T13:00:00Z");
    }

    #[tokio::test]
    async fn delete_items_under_path_respects_path_boundaries() {
        let dir = tempdir().unwrap();
        let pool = init_db(dir.path()).await.unwrap();
        let cache_dir = dir.path().join("thumb_cache");
        fs::create_dir_all(&cache_dir).unwrap();

        let target_id = insert_item(
            &pool,
            "C:/Library/Series",
            "folder",
            "Series",
            None,
            None,
            "2026-05-24T10:00:00Z",
            None,
        )
        .await
        .unwrap();
        insert_item(
            &pool,
            "C:/Library/Series/Vol1",
            "folder",
            "Vol1",
            None,
            None,
            "2026-05-24T10:00:00Z",
            None,
        )
        .await
        .unwrap();
        let sibling_id = insert_item(
            &pool,
            "C:/Library/SeriesExtra",
            "folder",
            "SeriesExtra",
            None,
            None,
            "2026-05-24T10:00:00Z",
            None,
        )
        .await
        .unwrap();
        fs::write(thumbnail_cache_path(&cache_dir, target_id), b"cache").unwrap();
        fs::write(thumbnail_cache_path(&cache_dir, sibling_id), b"cache").unwrap();

        let removed = delete_items_under_path_with_cache(&pool, &cache_dir, "C:/Library/Series")
            .await
            .unwrap();
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(removed, 2);
        assert_eq!(remaining, 1);
        assert!(!thumbnail_cache_path(&cache_dir, target_id).exists());
        assert!(thumbnail_cache_path(&cache_dir, sibling_id).exists());
    }
}
