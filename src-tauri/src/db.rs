use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::fs;
use std::path::Path;
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

    // ── Legacy tables (kept for migration source, no longer written to) ──────
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS comics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            file_path TEXT NOT NULL UNIQUE,
            custom_cover_path TEXT,
            import_time DATETIME NOT NULL,
            file_size INTEGER NOT NULL,
            file_modified_time DATETIME NOT NULL
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            last_sync DATETIME
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS comic_tags (
            comic_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (comic_id, tag_id),
            FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS folders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            path        TEXT NOT NULL UNIQUE,
            name        TEXT NOT NULL,
            folder_type TEXT NOT NULL DEFAULT 'default',
            note        TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS folder_tags (
            folder_id INTEGER NOT NULL,
            tag_id    INTEGER NOT NULL,
            PRIMARY KEY (folder_id, tag_id),
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );"
    ).execute(&pool).await?;

    // ── New unified tables ───────────────────────────────────────────────────
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
            folder_type     TEXT DEFAULT 'default',
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
            is_builtin   INTEGER NOT NULL DEFAULT 0
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS type_extensions (
            type_id   INTEGER NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
            extension TEXT NOT NULL,
            PRIMARY KEY (type_id, extension)
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

    // ── One-time migration: comics + folders → items ─────────────────────────
    // Idempotent via UNIQUE(path) + INSERT OR IGNORE
    sqlx::query(
        "INSERT OR IGNORE INTO items (path, item_type, name, file_size, import_at)
         SELECT file_path, 'file', title, file_size, CAST(import_time AS TEXT)
         FROM comics"
    ).execute(&pool).await?;

    sqlx::query(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source)
         SELECT i.id, ct.tag_id, 'direct'
         FROM comic_tags ct
         JOIN comics c ON c.id = ct.comic_id
         JOIN items i ON i.path = c.file_path"
    ).execute(&pool).await?;

    sqlx::query(
        "INSERT OR IGNORE INTO items (path, item_type, name, folder_type, note, import_at)
         SELECT path, 'folder', name, folder_type, note, created_at
         FROM folders"
    ).execute(&pool).await?;

    sqlx::query(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source)
         SELECT i.id, ft.tag_id, 'direct'
         FROM folder_tags ft
         JOIN folders f ON f.id = ft.folder_id
         JOIN items i ON i.path = f.path"
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
    let tags = sqlx::query_as::<_, Tag>("SELECT id, name FROM tags ORDER BY name ASC")
        .fetch_all(pool)
        .await?;
    Ok(tags)
}

pub async fn find_tag_by_name(pool: &SqlitePool, name: &str) -> Result<Option<Tag>> {
    let tag = sqlx::query_as::<_, Tag>("SELECT id, name FROM tags WHERE name = ?")
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
    Ok(Tag { id, name: name.to_string() })
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

pub async fn add_tag_to_item(pool: &SqlitePool, item_id: i64, tag_id: i64) -> Result<()> {
    sqlx::query(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source) VALUES (?, ?, 'direct')"
    )
    .bind(item_id)
    .bind(tag_id)
    .execute(pool)
    .await?;
    Ok(())
}
