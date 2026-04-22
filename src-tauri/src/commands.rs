use tauri::{AppHandle, Manager, State};
use sqlx::{SqlitePool, Row};
use crate::models::{Item, Tag, Page, Source, Folder};
use crate::db;
use crate::scanner;
use crate::zip_utils;
use anyhow::Result;
use std::fs;
use base64::{Engine as _, engine::general_purpose};

// ── Helper ────────────────────────────────────────────────────────────────────

fn read_item_from_row(row: &sqlx::sqlite::SqliteRow, tags: Vec<Tag>) -> Item {
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
        folder_type: row.get("folder_type"),
        import_at: row.get("import_at"),
        tags,
    }
}

async fn fetch_item_tags(pool: &SqlitePool, item_id: i64) -> Result<Vec<Tag>, String> {
    sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ?"
    )
    .bind(item_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

// ── Scan ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn scan_directory(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let cache_dir = app.path().app_data_dir().unwrap().join("comic_cache");
    scanner::scan_directory(&pool, &path, &cache_dir)
        .await
        .map(|count| serde_json::json!({ "message": "Scan completed", "addedCount": count }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn incremental_scan(
    path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let cache_dir = app.path().app_data_dir().unwrap().join("comic_cache");
    scanner::incremental_scan_directory(&pool, &path, &cache_dir)
        .await
        .map(|(added, updated, removed)| serde_json::json!({
            "message": "增量掃描完成",
            "added": added,
            "updated": updated,
            "removed": removed
        }))
        .map_err(|e| e.to_string())
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
            Err(e) => errors.push(format!("{}: {}", source.path, e)),
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

// ── Items (new primary API) ───────────────────────────────────────────────────

#[tauri::command]
pub async fn get_items(
    page: i64,
    size: i64,
    tag_id: Option<i64>,
    sort_by: Option<String>,
    sort_dir: Option<String>,
    source_path: Option<String>,
    item_type: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<Page<Item>, String> {
    let offset = page * size;
    let col = match sort_by.as_deref() {
        Some("name")          => "i.name",
        Some("fileSize")      => "i.file_size",
        Some("fileModifiedAt") => "i.file_modified_at",
        _                     => "i.import_at",
    };
    let dir = if sort_dir.as_deref() == Some("asc") { "ASC" } else { "DESC" };
    let source_like = source_path.as_deref().map(|p| format!("{}%", p));
    let with_tag = tag_id.is_some();
    let has_source = source_path.is_some();

    // Build both data and count queries with the same conditions
    macro_rules! build_query {
        ($select:expr) => {{
            let mut qb = sqlx::QueryBuilder::new($select);
            if with_tag {
                qb.push(" JOIN item_tags it ON i.id = it.item_id WHERE it.tag_id = ");
                qb.push_bind(tag_id.unwrap());
            }
            let mut need_and = with_tag;
            if has_source {
                qb.push(if need_and { " AND" } else { " WHERE" });
                qb.push(" i.path LIKE ");
                qb.push_bind(source_like.clone().unwrap());
                need_and = true;
            } else if !with_tag {
                qb.push(" WHERE EXISTS (SELECT 1 FROM sources s WHERE i.path LIKE s.path || '%')");
                need_and = true;
            }
            if let Some(ref itype) = item_type {
                qb.push(if need_and { " AND" } else { " WHERE" });
                qb.push(" i.item_type = ");
                qb.push_bind(itype.clone());
            }
            qb
        }};
    }

    let mut qb = build_query!("SELECT i.* FROM items i");
    qb.push(format!(" ORDER BY {} {} LIMIT ", col, dir));
    qb.push_bind(size);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let mut count_qb = build_query!("SELECT COUNT(*) FROM items i");

    let rows = qb.build().fetch_all(&*pool).await.map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows {
        let id: i64 = row.get("id");
        let tags = fetch_item_tags(&pool, id).await?;
        items.push(read_item_from_row(&row, tags));
    }

    let total_elements: i64 = count_qb
        .build()
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);

    let total_pages = (total_elements as f64 / size as f64).ceil() as i64;
    Ok(Page { content: items, total_pages, total_elements, number: page, size })
}

#[tauri::command]
pub async fn get_item(id: i64, pool: State<'_, SqlitePool>) -> Result<Item, String> {
    let row = sqlx::query("SELECT * FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let tags = fetch_item_tags(&pool, id).await?;
    Ok(read_item_from_row(&row, tags))
}

#[tauri::command]
pub async fn tag_item(item_id: i64, tag_id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    db::add_tag_to_item(&pool, item_id, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn untag_item(item_id: i64, tag_id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ? AND source = 'direct'")
        .bind(item_id)
        .bind(tag_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── File-item operations ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn rename_item(id: i64, name: String, pool: State<'_, SqlitePool>) -> Result<Item, String> {
    let row = sqlx::query("SELECT path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let old_path_str: String = row.get("path");
    let old_path = std::path::Path::new(&old_path_str);
    let extension = old_path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let new_file_name = if extension.is_empty() {
        name.clone()
    } else {
        format!("{}.{}", name, extension)
    };
    let new_path = old_path.with_file_name(new_file_name);

    if new_path.exists() {
        return Err("A file with the same name already exists".to_string());
    }

    fs::rename(old_path, &new_path)
        .map_err(|e| format!("Failed to rename file: {}", e))?;

    sqlx::query("UPDATE items SET name = ?, path = ? WHERE id = ?")
        .bind(&name)
        .bind(new_path.to_string_lossy().to_string())
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    get_item(id, pool).await
}

#[tauri::command]
pub async fn get_item_images(id: i64, pool: State<'_, SqlitePool>) -> Result<Vec<String>, String> {
    let path: String = sqlx::query("SELECT path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);
    zip_utils::get_image_entries(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_item_cover(
    id: i64,
    image_path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE items SET cover_cache_path = ? WHERE id = ?")
        .bind(&image_path)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let cache_dir = app.path().app_data_dir().unwrap().join("comic_cache");
    let file_path: String = sqlx::query("SELECT path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);

    if let Ok(data) = zip_utils::extract_image(&file_path, &image_path) {
        let cache_file = cache_dir.join(format!("{}.jpg", id));
        let _ = fs::write(cache_file, data);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_cover_base64(id: i64, pool: State<'_, SqlitePool>) -> Result<String, String> {
    let row = sqlx::query("SELECT path, cover_cache_path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let file_path: String = row.get("path");
    let cover_cache_path: Option<String> = row.get("cover_cache_path");

    let image_data = if let Some(cover) = cover_cache_path {
        zip_utils::extract_image(&file_path, &cover).map_err(|e| e.to_string())?
    } else {
        let entries = zip_utils::get_image_entries(&file_path).map_err(|e| e.to_string())?;
        if entries.is_empty() {
            return Err("No images in zip".to_string());
        }
        zip_utils::extract_image(&file_path, &entries[0]).map_err(|e| e.to_string())?
    };

    let b64 = general_purpose::STANDARD.encode(&image_data);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

// ── Folder-item operations (WorkspacePanel backward compat) ───────────────────

#[tauri::command]
pub async fn get_folders(
    tag_id: Option<i64>,
    search: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<Folder>, String> {
    let mut qb = sqlx::QueryBuilder::new("SELECT i.* FROM items i");
    if let Some(tid) = tag_id {
        qb.push(" JOIN item_tags it ON i.id = it.item_id WHERE it.tag_id = ");
        qb.push_bind(tid);
        qb.push(" AND i.item_type = 'folder'");
    } else {
        qb.push(" WHERE i.item_type = 'folder'");
    }
    if let Some(ref q) = search {
        if !q.trim().is_empty() {
            qb.push(" AND i.name LIKE ");
            qb.push_bind(format!("%{}%", q.trim()));
        }
    }
    qb.push(" ORDER BY i.import_at DESC");

    let rows = qb.build().fetch_all(&*pool).await.map_err(|e| e.to_string())?;
    let mut folders = Vec::new();
    for row in rows {
        let id: i64 = row.get("id");
        let tags = fetch_item_tags(&pool, id).await?;
        folders.push(Folder {
            id,
            path: row.get("path"),
            name: row.get("name"),
            folder_type: row.get::<Option<String>, _>("folder_type")
                .unwrap_or_else(|| "default".to_string()),
            note: row.get::<Option<String>, _>("note").unwrap_or_default(),
            created_at: row.get("import_at"),
            tags,
        });
    }
    Ok(folders)
}

#[tauri::command]
pub async fn create_folder(
    path: String,
    name: String,
    folder_type: String,
    note: String,
    pool: State<'_, SqlitePool>,
) -> Result<Folder, String> {
    sqlx::query(
        "INSERT OR IGNORE INTO items (path, item_type, name, folder_type, note) VALUES (?, 'folder', ?, ?, ?)"
    )
    .bind(&path)
    .bind(&name)
    .bind(&folder_type)
    .bind(&note)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query("SELECT * FROM items WHERE path = ? AND item_type = 'folder'")
        .bind(&path)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(Folder {
        id: row.get("id"),
        path,
        name: row.get("name"),
        folder_type: row.get::<Option<String>, _>("folder_type")
            .unwrap_or_else(|| "default".to_string()),
        note: row.get::<Option<String>, _>("note").unwrap_or_default(),
        created_at: row.get("import_at"),
        tags: vec![],
    })
}

#[tauri::command]
pub async fn update_folder(
    id: i64,
    name: String,
    folder_type: String,
    note: String,
    pool: State<'_, SqlitePool>,
) -> Result<Folder, String> {
    sqlx::query(
        "UPDATE items SET name = ?, folder_type = ?, note = ? WHERE id = ? AND item_type = 'folder'"
    )
    .bind(&name)
    .bind(&folder_type)
    .bind(&note)
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query("SELECT * FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let tags = fetch_item_tags(&pool, id).await?;
    Ok(Folder {
        id,
        path: row.get("path"),
        name,
        folder_type,
        note,
        created_at: row.get("import_at"),
        tags,
    })
}

#[tauri::command]
pub async fn delete_folder(id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM items WHERE id = ? AND item_type = 'folder'")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn add_tag_to_folder(folder_id: i64, tag_id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    db::add_tag_to_item(&pool, folder_id, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_tag_from_folder(folder_id: i64, tag_id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?")
        .bind(folder_id)
        .bind(tag_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tag management ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_tags(pool: State<'_, SqlitePool>) -> Result<Vec<Tag>, String> {
    db::get_tags(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_tag(name: String, pool: State<'_, SqlitePool>) -> Result<Tag, String> {
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
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

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
    sqlx::query(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source)
         SELECT item_id, ?, 'direct' FROM item_tags WHERE tag_id = ?",
    )
    .bind(target_id)
    .bind(source_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

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

// ── Source management ─────────────────────────────────────────────────────────

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

// ── File system ───────────────────────────────────────────────────────────────

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

#[tauri::command]
pub async fn list_dir_files(path: String) -> Result<Vec<crate::models::FileItem>, String> {
    use std::path::Path;
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("不是有效目錄：{}", path));
    }
    let mut dirs: Vec<crate::models::FileItem> = Vec::new();
    let mut files: Vec<crate::models::FileItem> = Vec::new();

    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let p = entry.path();
        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let is_dir = metadata.is_dir();
        let extension = if is_dir { None } else {
            p.extension().map(|e| e.to_string_lossy().to_string())
        };
        let file_size = if is_dir { None } else { Some(metadata.len()) };
        let modified_time = metadata.modified().ok().map(|t| {
            let dt: chrono::DateTime<chrono::Local> = t.into();
            dt.format("%Y-%m-%d %H:%M").to_string()
        });

        let item = crate::models::FileItem {
            name,
            path: p.to_string_lossy().to_string(),
            is_dir,
            file_size,
            modified_time,
            extension,
        };
        if is_dir { dirs.push(item); } else { files.push(item); }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    Ok(dirs)
}

#[tauri::command]
pub async fn list_subdirs(path: String) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("不是有效目錄：{}", path));
    }
    let mut subdirs: Vec<String> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            if entry.file_type().ok()?.is_dir() {
                Some(entry.path().to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect();
    subdirs.sort();
    Ok(subdirs)
}

#[tauri::command]
pub async fn get_image_base64_by_path(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpeg")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png"  => "image/png",
        "gif"  => "image/gif",
        "webp" => "image/webp",
        "bmp"  => "image/bmp",
        _      => "image/jpeg",
    };
    Ok(format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(&bytes)))
}
