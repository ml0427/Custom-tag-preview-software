use std::path::Path;
use walkdir::WalkDir;
use regex::Regex;
use anyhow::Result;
use sqlx::{SqlitePool, Row};
use crate::db;
use crate::models::Comic;
use chrono::{Local, DateTime};
use std::fs;

pub async fn scan_directory(pool: &SqlitePool, path_str: &str, cache_dir: &Path) -> Result<i32> {
    // 1. Clear database and cache
    db::clear_database(pool).await?;
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(cache_dir);
    }
    fs::create_dir_all(cache_dir)?;

    let mut added_count = 0;
    let entries = WalkDir::new(path_str)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && e.path().extension().map_or(false, |ext| ext == "zip"));

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
    let modified_time: DateTime<Local> = metadata.modified()?.into();

    let id = sqlx::query(
        "INSERT INTO comics (title, file_path, import_time, file_size, file_modified_time) 
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&title)
    .bind(&file_path)
    .bind(Local::now())
    .bind(file_size)
    .bind(modified_time)
    .execute(pool)
    .await?
    .last_insert_rowid();

    // Auto-tagging
    extract_and_apply_tags(pool, id, &title).await?;

    // Initial thumbnail extraction (Simulating ComicCacheService)
    // In Tauri, we might do this on the fly or pre-extract. 
    // For consistency with Spring version, let's pre-extract the first image to cache_dir/{id}.jpg
    if let Ok(images) = crate::zip_utils::get_image_entries(&file_path) {
        if !images.is_empty() {
             if let Ok(data) = crate::zip_utils::extract_image(&file_path, &images[0]) {
                 let cache_file = cache_dir.join(format!("{}.jpg", id));
                 fs::write(cache_file, data)?;
             }
        }
    }

    Ok(true)
}

pub async fn extract_and_apply_tags(pool: &SqlitePool, comic_id: i64, title: &str) -> Result<()> {
    let re = Regex::new(r"^\s*[\[【](.*?)[\]】]")?;
    if let Some(caps) = re.captures(title) {
        let content = &caps[1];
        // Split by ( ) , （ ）
        let segments: Vec<&str> = content.split(|c| c == '(' || c == ')' || c == ',' || c == '（' || c == '）').collect();
        
        for segment in segments {
            let clean_name = segment.trim();
            if clean_name.is_empty() { continue; }

            // Find or create tag
            let tag_id = if let Some(tag) = db::find_tag_by_name(pool, clean_name).await? {
                tag.id
            } else {
                db::create_tag(pool, clean_name).await?.id
            };

            db::add_tag_to_comic(pool, comic_id, tag_id).await?;
        }
    }
    Ok(())
}
