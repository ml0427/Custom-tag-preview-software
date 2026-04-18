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

    // Create tables
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

    Ok(pool)
}

pub async fn clear_database(pool: &SqlitePool) -> Result<()> {
    sqlx::query("DELETE FROM comic_tags").execute(pool).await?;
    sqlx::query("DELETE FROM comics").execute(pool).await?;
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
    let id = sqlx::query("INSERT OR IGNORE INTO sources (path) VALUES (?)")
        .bind(path)
        .execute(pool)
        .await?
        .last_insert_rowid();

    // 若 path 已存在，last_insert_rowid 為 0，改用查詢取得
    let source = sqlx::query_as::<_, Source>(
        "SELECT id, path, last_sync FROM sources WHERE path = ?"
    )
    .bind(path)
    .fetch_one(pool)
    .await?;

    let _ = id;
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

pub async fn add_tag_to_comic(pool: &SqlitePool, comic_id: i64, tag_id: i64) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO comic_tags (comic_id, tag_id) VALUES (?, ?)")
        .bind(comic_id)
        .bind(tag_id)
        .execute(pool)
        .await?;
    Ok(())
}
