use std::path::Path;
use walkdir::WalkDir;
use regex::Regex;
use anyhow::Result;
use sqlx::{SqlitePool, Row};
use crate::db;
use chrono::Local;
use std::fs;
use std::collections::{HashMap, HashSet};
use std::time::UNIX_EPOCH;

pub async fn scan_directory(pool: &SqlitePool, path_str: &str, cache_dir: &Path) -> Result<i32> {
    db::clear_database(pool).await?;
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(cache_dir);
    }
    fs::create_dir_all(cache_dir)?;

    let scannable_exts: HashSet<String> = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT extension FROM type_extensions"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    let mut added_count = 0;
    let entries = WalkDir::new(path_str)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && e.path().extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| scannable_exts.contains(&ext.to_lowercase()))
            .unwrap_or(false));

    for entry in entries {
        if process_zip_file(pool, entry.path(), cache_dir).await? {
            added_count += 1;
        }
    }

    Ok(added_count)
}

async fn process_zip_file(pool: &SqlitePool, path: &Path, cache_dir: &Path) -> Result<bool> {
    let file_path = path.to_string_lossy().to_string();
    let title = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let metadata = fs::metadata(path)?;
    let file_size = metadata.len() as i64;
    let mtime_unix = metadata.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let import_at = Local::now().to_rfc3339();

    let result = sqlx::query(
        "INSERT OR IGNORE INTO items (path, item_type, name, file_size, file_modified_at, import_at)
         VALUES (?, 'file', ?, ?, ?, ?)"
    )
    .bind(&file_path)
    .bind(&title)
    .bind(file_size)
    .bind(mtime_unix)
    .bind(&import_at)
    .execute(pool)
    .await?;

    let id = result.last_insert_rowid();
    if id == 0 {
        return Ok(false);
    }

    extract_and_apply_tags(pool, id, &title).await?;

    if let Ok(images) = crate::zip_utils::get_image_entries(&file_path) {
        if !images.is_empty() {
            if let Ok(data) = crate::zip_utils::extract_image(&file_path, &images[0]) {
                let cache_file = cache_dir.join(format!("{}.jpg", id));
                let _ = fs::write(cache_file, data);
            }
        }
    }

    Ok(true)
}

async fn process_folder(pool: &SqlitePool, path: &Path) -> Result<bool> {
    let file_path = path.to_string_lossy().to_string();
    let title = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let metadata = fs::metadata(path)?;
    let mtime_unix = metadata.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let import_at = Local::now().to_rfc3339();

    let result = sqlx::query(
        "INSERT OR IGNORE INTO items (path, item_type, name, file_modified_at, import_at)
         VALUES (?, 'folder', ?, ?, ?)"
    )
    .bind(&file_path)
    .bind(&title)
    .bind(mtime_unix)
    .bind(&import_at)
    .execute(pool)
    .await?;

    let id = result.last_insert_rowid();
    if id == 0 {
        return Ok(false);
    }

    extract_and_apply_tags(pool, id, &title).await?;
    Ok(true)
}

pub async fn incremental_scan_directory(
    pool: &SqlitePool,
    path_str: &str,
    cache_dir: &Path,
) -> Result<(i32, i32, i32)> {
    fs::create_dir_all(cache_dir)?;

    let rows = sqlx::query(
        "SELECT id, path, file_modified_at FROM items"
    )
    .fetch_all(pool)
    .await?;

    let scan_root = Path::new(path_str);
    let mut existing: HashMap<String, (i64, i64)> = HashMap::new();
    for row in &rows {
        let path: String = row.get("path");
        if !Path::new(&path).starts_with(scan_root) {
            continue;
        }
        let id: i64 = row.get("id");
        let mtime: i64 = row.try_get("file_modified_at").unwrap_or(0);
        existing.insert(path, (id, mtime));
    }

    let mut found_paths: HashSet<String> = HashSet::new();
    let mut added = 0i32;
    let mut updated = 0i32;

    let scannable_exts: HashSet<String> = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT extension FROM type_extensions"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    let entries: Vec<_> = WalkDir::new(path_str)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_dir() || (e.file_type().is_file() && e.path().extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| scannable_exts.contains(&ext.to_lowercase()))
                .unwrap_or(false))
        })
        .collect();

    for entry in entries {
        let file_path = entry.path().to_string_lossy().to_string();
        found_paths.insert(file_path.clone());

        let metadata = fs::metadata(entry.path())?;
        let is_dir = entry.file_type().is_dir();
        let file_size = if is_dir { None } else { Some(metadata.len() as i64) };
        let mtime_unix = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        if let Some((existing_id, db_mtime)) = existing.get(&file_path) {
            if (mtime_unix - db_mtime).abs() > 2 {
                sqlx::query(
                    "UPDATE items SET file_size = ?, file_modified_at = ? WHERE id = ?",
                )
                .bind(file_size)
                .bind(mtime_unix)
                .bind(existing_id)
                .execute(pool)
                .await?;
                updated += 1;
            }
        } else {
            if is_dir {
                if process_folder(pool, entry.path()).await? {
                    added += 1;
                }
            } else {
                if process_zip_file(pool, entry.path(), cache_dir).await? {
                    added += 1;
                }
            }
        }
    }

    let mut removed = 0i32;
    for (path, (id, _)) in &existing {
        if !found_paths.contains(path) {
            let _ = fs::remove_file(cache_dir.join(format!("{}.jpg", id)));
            sqlx::query("DELETE FROM items WHERE id = ?")
                .bind(id)
                .execute(pool)
                .await?;
            removed += 1;
        }
    }

    Ok((added, updated, removed))
}

pub async fn extract_and_apply_tags(pool: &SqlitePool, item_id: i64, title: &str) -> Result<()> {
    let re = Regex::new(r"^\s*[\[【](.*?)[\]】]")?;
    if let Some(caps) = re.captures(title) {
        let content = &caps[1];
        let segments: Vec<&str> = content
            .split(|c| c == '(' || c == ')' || c == ',' || c == '（' || c == '）' || c == '、')
            .collect();

        for segment in segments {
            let clean_name = segment.trim();
            if clean_name.is_empty() { continue; }

            let tag_id = if let Some(tag) = db::find_tag_by_name(pool, clean_name).await? {
                tag.id
            } else {
                db::create_tag(pool, clean_name).await?.id
            };

            db::add_tag_to_item(pool, item_id, tag_id).await?;
        }
    }
    Ok(())
}
