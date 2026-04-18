use tauri::{AppHandle, Manager, State};
use sqlx::{SqlitePool, Row};
use crate::models::{Comic, Tag, Page, Source};
use crate::db;
use crate::scanner;
use crate::zip_utils;
use anyhow::Result;
use std::fs;
use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
pub async fn scan_directory(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let app_dir = app.path().app_data_dir().unwrap();
    let cache_dir = app_dir.join("comic_cache");

    scanner::scan_directory(&pool, &path, &cache_dir)
        .await
        .map(|count| serde_json::json!({ "message": "Scan completed", "addedCount": count }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_comics(
    page: i64,
    size: i64,
    tag_id: Option<i64>,
    sort_by: Option<String>,
    sort_dir: Option<String>,
    source_path: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<Page<Comic>, String> {
    let offset = page * size;

    let col = match sort_by.as_deref() {
        Some("title")              => "c.title",
        Some("file_size")          => "c.file_size",
        Some("file_modified_time") => "c.file_modified_time",
        _                          => "c.import_time",
    };
    let dir = if sort_dir.as_deref() == Some("asc") { "ASC" } else { "DESC" };

    // 來源篩選條件：指定路徑 or 所有已登記來源的聯集
    let source_cond = match &source_path {
        Some(p) => {
            let escaped = p.replace('\'', "''");
            format!("c.file_path LIKE '{}%'", escaped)
        }
        None => "EXISTS (SELECT 1 FROM sources s WHERE c.file_path LIKE s.path || '%')".to_string(),
    };

    let (comics_query, total_query) = if let Some(tid) = tag_id {
        (
            format!(
                "SELECT c.* FROM comics c JOIN comic_tags ct ON c.id = ct.comic_id \
                 WHERE ct.tag_id = {} AND {} ORDER BY {} {} LIMIT {} OFFSET {}",
                tid, source_cond, col, dir, size, offset
            ),
            format!(
                "SELECT COUNT(*) FROM comics c JOIN comic_tags ct ON c.id = ct.comic_id \
                 WHERE ct.tag_id = {} AND {}",
                tid, source_cond
            ),
        )
    } else {
        (
            format!(
                "SELECT c.* FROM comics c WHERE {} ORDER BY {} {} LIMIT {} OFFSET {}",
                source_cond, col, dir, size, offset
            ),
            format!("SELECT COUNT(*) FROM comics c WHERE {}", source_cond),
        )
    };

    let rows = sqlx::query(&comics_query).fetch_all(&*pool).await.map_err(|e| e.to_string())?;
    
    let mut comics = Vec::new();
    for row in rows {
        let id: i64 = row.get("id");
        // Get tags for this comic
        let tags = sqlx::query_as::<_, Tag>(
            "SELECT t.id, t.name FROM tags t JOIN comic_tags ct ON t.id = ct.tag_id WHERE ct.comic_id = ?"
        )
        .bind(id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        comics.push(Comic {
            id,
            title: row.get("title"),
            file_path: row.get("file_path"),
            custom_cover_path: row.get("custom_cover_path"),
            import_time: row.get("import_time"),
            file_size: row.get("file_size"),
            file_modified_time: row.get("file_modified_time"),
            tags,
        });
    }

    let total_elements: i64 = sqlx::query(&total_query)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);
    
    let total_pages = (total_elements as f64 / size as f64).ceil() as i64;

    Ok(Page {
        content: comics,
        total_pages,
        total_elements,
        number: page,
        size,
    })
}

#[tauri::command]
pub async fn get_tags(pool: State<'_, SqlitePool>) -> Result<Vec<Tag>, String> {
    db::get_tags(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_comic(
    id: i64,
    title: String,
    pool: State<'_, SqlitePool>,
) -> Result<Comic, String> {
    let comic_row = sqlx::query("SELECT * FROM comics WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let old_path_str: String = comic_row.get("file_path");
    let old_path = std::path::Path::new(&old_path_str);
    let extension = old_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    
    let new_file_name = if extension.is_empty() { title.clone() } else { format!("{}.{}", title, extension) };
    let new_path = old_path.with_file_name(new_file_name);

    if new_path.exists() {
        return Err("A file with the same name already exists".to_string());
    }

    fs::rename(old_path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))?;

    sqlx::query("UPDATE comics SET title = ?, file_path = ? WHERE id = ?")
        .bind(&title)
        .bind(new_path.to_string_lossy().to_string())
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    // Return updated comic
    let tags = sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name FROM tags t JOIN comic_tags ct ON t.id = ct.tag_id WHERE ct.comic_id = ?"
    )
    .bind(id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Comic {
        id,
        title,
        file_path: new_path.to_string_lossy().to_string(),
        custom_cover_path: comic_row.get("custom_cover_path"),
        import_time: comic_row.get("import_time"),
        file_size: comic_row.get("file_size"),
        file_modified_time: comic_row.get("file_modified_time"),
        tags,
    })
}

#[tauri::command]
pub async fn get_comic_images(id: i64, pool: State<'_, SqlitePool>) -> Result<Vec<String>, String> {
    let path: String = sqlx::query("SELECT file_path FROM comics WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);
    
    zip_utils::get_image_entries(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_tag(name: String, pool: State<'_, SqlitePool>) -> Result<Tag, String> {
    // INSERT OR IGNORE: 已存在就不報錯，直接回傳現有紀錄
    sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?)")
        .bind(&name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    db::find_tag_by_name(&pool, &name)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Tag not found after insert".to_string())
}

#[tauri::command]
pub async fn delete_tag(id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM tags WHERE id = ?").bind(id).execute(&*pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn add_tag_to_comic(comic_id: i64, tag_id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    db::add_tag_to_comic(&pool, comic_id, tag_id).await.map_err(|e| e.to_string())
}


#[tauri::command]
pub async fn remove_tag_from_comic(comic_id: i64, tag_id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM comic_tags WHERE comic_id = ? AND tag_id = ?")
        .bind(comic_id)
        .bind(tag_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_comic_cover(id: i64, image_path: String, pool: State<'_, SqlitePool>, app: AppHandle) -> Result<(), String> {
    // 1. Update DB
    sqlx::query("UPDATE comics SET custom_cover_path = ? WHERE id = ?")
        .bind(&image_path)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    // 2. Refresh Cache
    let app_dir = app.path().app_data_dir().unwrap();
    let cache_dir = app_dir.join("comic_cache");
    let file_path: String = sqlx::query("SELECT file_path FROM comics WHERE id = ?").bind(id).fetch_one(&*pool).await.map_err(|e| e.to_string())?.get(0);
    
    if let Ok(data) = zip_utils::extract_image(&file_path, &image_path) {
        let cache_file = cache_dir.join(format!("{}.jpg", id));
        let _ = fs::write(cache_file, data);
    }

    Ok(())
}

#[tauri::command]
pub async fn get_comic(id: i64, pool: State<'_, SqlitePool>) -> Result<Comic, String> {
    let row = sqlx::query("SELECT * FROM comics WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let tags = sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name FROM tags t JOIN comic_tags ct ON t.id = ct.tag_id WHERE ct.comic_id = ?"
    )
    .bind(id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Comic {
        id,
        title: row.get("title"),
        file_path: row.get("file_path"),
        custom_cover_path: row.get("custom_cover_path"),
        import_time: row.get("import_time"),
        file_size: row.get("file_size"),
        file_modified_time: row.get("file_modified_time"),
        tags,
    })
}

// ─── MISSION 3：用系統預設程式開啟本地檔案 ───────────────────────────────────
#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("開啟檔案失敗: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("開啟檔案失敗: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("開啟檔案失敗: {}", e))?;
    }
    Ok(())
}

// ─── MISSION 2：Workspace 來源管理 ──────────────────────────────────────────
#[tauri::command]
pub async fn get_sources(pool: State<'_, SqlitePool>) -> Result<Vec<Source>, String> {
    db::get_sources(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_source(path: String, pool: State<'_, SqlitePool>) -> Result<Source, String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err(format!("路徑不存在或不是資料夾：{}", path));
    }
    db::add_source(&pool, &path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_source(id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    db::remove_source(&pool, id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_sources(pool: State<'_, SqlitePool>, app: AppHandle) -> Result<serde_json::Value, String> {
    let sources = db::get_sources(&pool).await.map_err(|e| e.to_string())?;
    let cache_dir = app.path().app_data_dir().unwrap().join("comic_cache");

    let mut total_added = 0i32;
    let mut total_updated = 0i32;
    let mut total_removed = 0i32;
    let mut errors: Vec<String> = Vec::new();

    for source in &sources {
        match scanner::incremental_scan_directory(&pool, &source.path, &cache_dir).await {
            Ok((added, updated, removed)) => {
                total_added += added;
                total_updated += updated;
                total_removed += removed;
                let _ = db::update_source_sync_time(&pool, source.id).await;
            }
            Err(e) => {
                errors.push(format!("{}: {}", source.path, e));
            }
        }
    }

    Ok(serde_json::json!({
        "added": total_added,
        "updated": total_updated,
        "removed": total_removed,
        "sourceCount": sources.len(),
        "errors": errors
    }))
}

// ─── MISSION 2：增量掃描 ────────────────────────────────────────────────────
#[tauri::command]
pub async fn incremental_scan(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let cache_dir = app.path().app_data_dir().unwrap().join("comic_cache");

    scanner::incremental_scan_directory(&pool, &path, &cache_dir)
        .await
        .map(|(added, updated, removed)| {
            serde_json::json!({
                "message": "增量掃描完成",
                "added": added,
                "updated": updated,
                "removed": removed
            })
        })
        .map_err(|e| e.to_string())
}

// ─── MISSION 4：進階標籤管理 ────────────────────────────────────────────────
#[tauri::command]
pub async fn rename_tag(id: i64, name: String, pool: State<'_, SqlitePool>) -> Result<Tag, String> {
    sqlx::query("UPDATE tags SET name = ? WHERE id = ?")
        .bind(&name)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Tag { id, name })
}

#[tauri::command]
pub async fn merge_tags(source_id: i64, target_id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    // sourceId/targetId 從 JS 傳入，Tauri v2 camelCase→snake_case 自動對應
    sqlx::query(
        "INSERT OR IGNORE INTO comic_tags (comic_id, tag_id)
         SELECT comic_id, ? FROM comic_tags WHERE tag_id = ?",
    )
    .bind(target_id)
    .bind(source_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 刪除 source 標籤（cascade 會清除 comic_tags）
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(source_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn search_tags(query: String, pool: State<'_, SqlitePool>) -> Result<Vec<Tag>, String> {
    let pattern = format!("%{}%", query);
    sqlx::query_as::<_, Tag>(
        "SELECT id, name FROM tags WHERE name LIKE ? ORDER BY name ASC LIMIT 10",
    )
    .bind(pattern)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cover_base64(id: i64, pool: State<'_, SqlitePool>) -> Result<String, String> {
    // 從資料庫取得 file_path 與 custom_cover_path
    let row = sqlx::query("SELECT file_path, custom_cover_path FROM comics WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let file_path: String = row.get("file_path");
    let custom_cover_path: Option<String> = row.get("custom_cover_path");
    
    // 決定要讀取哪一張圖
    let image_data = if let Some(cover) = custom_cover_path {
        // 使用自訂封面
        zip_utils::extract_image(&file_path, &cover).map_err(|e| e.to_string())?
    } else {
        // 使用 ZIP 第一張
        let entries = zip_utils::get_image_entries(&file_path).map_err(|e| e.to_string())?;
        if entries.is_empty() {
            return Err("No images in zip".to_string());
        }
        zip_utils::extract_image(&file_path, &entries[0]).map_err(|e| e.to_string())?
    };
    
    // 轉換為 base64 data URL
    let b64 = general_purpose::STANDARD.encode(&image_data);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}
