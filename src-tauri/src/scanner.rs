use std::path::Path;
use walkdir::WalkDir;
use regex::Regex;
use anyhow::Result;
use sqlx::{SqlitePool, Row};
use crate::db;
use chrono::{Local, DateTime};
use std::fs;
use std::collections::{HashMap, HashSet};

pub async fn scan_directory(pool: &SqlitePool, path_str: &str, cache_dir: &Path) -> Result<i32> {
    // 完整掃描：先清空再重建
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

/// 增量掃描：比對 file_path + mtime，只處理新增/變動/刪除，保留使用者手動修改
pub async fn incremental_scan_directory(
    pool: &SqlitePool,
    path_str: &str,
    cache_dir: &Path,
) -> Result<(i32, i32, i32)> {
    fs::create_dir_all(cache_dir)?;

    // 1. 只載入屬於本次掃描路徑下的漫畫，避免誤刪其他來源的資料
    let rows = sqlx::query("SELECT id, file_path, file_modified_time FROM comics")
        .fetch_all(pool)
        .await?;

    let scan_root = Path::new(path_str);
    let mut existing: HashMap<String, (i64, i64)> = HashMap::new();
    for row in &rows {
        let path: String = row.get("file_path");
        // 僅納入路徑在 scan_root 下的紀錄
        if !Path::new(&path).starts_with(scan_root) {
            continue;
        }
        let id: i64 = row.get("id");
        let mtime: DateTime<Local> = row.try_get("file_modified_time").unwrap_or_else(|_| Local::now());
        existing.insert(path, (id, mtime.timestamp()));
    }

    let mut found_paths: HashSet<String> = HashSet::new();
    let mut added = 0i32;
    let mut updated = 0i32;

    // 2. 遍歷磁碟上所有 ZIP 檔
    let entries: Vec<_> = WalkDir::new(path_str)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path().extension().map_or(false, |ext| ext == "zip")
        })
        .collect();

    for entry in entries {
        let file_path = entry.path().to_string_lossy().to_string();
        found_paths.insert(file_path.clone());

        let metadata = fs::metadata(entry.path())?;
        let file_size = metadata.len() as i64;
        let modified_time: DateTime<Local> = metadata.modified()?.into();
        let disk_secs = modified_time.timestamp();

        if let Some((existing_id, db_secs)) = existing.get(&file_path) {
            // 已存在：檢查 mtime（2 秒容差避免 FAT32 精度問題）
            if (disk_secs - db_secs).abs() > 2 {
                sqlx::query(
                    "UPDATE comics SET file_size = ?, file_modified_time = ? WHERE id = ?",
                )
                .bind(file_size)
                .bind(modified_time)
                .bind(existing_id)
                .execute(pool)
                .await?;
                updated += 1;
            }
        } else {
            // 新檔案：插入 + 自動標籤 + 快取封面
            if process_zip_file(pool, entry.path(), cache_dir).await? {
                added += 1;
            }
        }
    }

    // 3. 刪除磁碟上已不存在的 DB 紀錄
    let mut removed = 0i32;
    for (path, (id, _)) in &existing {
        if !found_paths.contains(path) {
            let _ = fs::remove_file(cache_dir.join(format!("{}.jpg", id)));
            sqlx::query("DELETE FROM comics WHERE id = ?")
                .bind(id)
                .execute(pool)
                .await?;
            removed += 1;
        }
    }

    Ok((added, updated, removed))
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
