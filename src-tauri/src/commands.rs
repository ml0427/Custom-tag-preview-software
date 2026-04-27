use tauri::{AppHandle, Emitter, Manager, State};
use sqlx::{SqlitePool, Row};
use crate::models::{Item, Tag, Page, Source, Folder, ItemType, ItemTypeInput};
use crate::db;
use crate::scanner;
use crate::zip_utils;
use anyhow::Result;
use std::fs;
use base64::{Engine as _, engine::general_purpose};
use std::path::Path;

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
        category: row.get("category"),
        import_at: row.get("import_at"),
        tags,
    }
}

async fn fetch_item_tags(pool: &SqlitePool, item_id: i64) -> Result<Vec<Tag>, String> {
    sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ?"
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
    scanner::scan_directory(&pool, &path, &cache_dir, &app)
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
    scanner::incremental_scan_directory(&pool, &path, &cache_dir, &app)
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
        match scanner::incremental_scan_directory(&pool, &source.path, &cache_dir, &app).await {
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
    tag_ids: Option<Vec<i64>>,
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
    let active_tags: Vec<i64> = tag_ids.unwrap_or_default();
    let with_tags = !active_tags.is_empty();
    let has_source = source_path.is_some();

    // Build both data and count queries with the same conditions
    macro_rules! build_query {
        ($select:expr) => {{
            let mut qb = sqlx::QueryBuilder::new($select);
            // AND-logic multi-tag filter via subquery
            if with_tags {
                qb.push(" WHERE i.id IN (SELECT item_id FROM item_tags WHERE tag_id IN (");
                let mut sep = qb.separated(", ");
                for id in &active_tags { sep.push_bind(*id); }
                qb.push(") GROUP BY item_id HAVING COUNT(DISTINCT tag_id) = ");
                qb.push_bind(active_tags.len() as i64);
                qb.push(")");
            }
            let mut need_and = with_tags;
            if has_source {
                qb.push(if need_and { " AND" } else { " WHERE" });
                qb.push(" i.path LIKE ");
                qb.push_bind(source_like.clone().unwrap());
                need_and = true;
            } else if !with_tags {
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
pub async fn get_item_by_path(path: String, pool: State<'_, SqlitePool>) -> Result<Option<Item>, String> {
    let row = sqlx::query("SELECT * FROM items WHERE path = ?")
        .bind(&path)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    match row {
        None => Ok(None),
        Some(r) => {
            let id: i64 = r.get("id");
            let tags = fetch_item_tags(&pool, id).await?;
            Ok(Some(read_item_from_row(&r, tags)))
        }
    }
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

#[tauri::command]
pub async fn get_zip_cover_by_path(path: String) -> Result<String, String> {
    let entries = zip_utils::get_image_entries(&path).map_err(|e| e.to_string())?;
    if entries.is_empty() {
        return Err("No images in zip".to_string());
    }
    let image_data = zip_utils::extract_image(&path, &entries[0]).map_err(|e| e.to_string())?;
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
            category: row.get::<Option<String>, _>("category")
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
    category: String,
    note: String,
    pool: State<'_, SqlitePool>,
) -> Result<Folder, String> {
    sqlx::query(
        "INSERT OR IGNORE INTO items (path, item_type, name, category, note) VALUES (?, 'folder', ?, ?, ?)"
    )
    .bind(&path)
    .bind(&name)
    .bind(&category)
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
        category: row.get::<Option<String>, _>("category")
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
    category: String,
    note: String,
    pool: State<'_, SqlitePool>,
) -> Result<Folder, String> {
    sqlx::query(
        "UPDATE items SET name = ?, category = ?, note = ? WHERE id = ? AND item_type = 'folder'"
    )
    .bind(&name)
    .bind(&category)
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
        category,
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

/// Move file/folder to system Recycle Bin, then remove its DB record.
#[tauri::command]
pub async fn trash_item(path: String, pool: State<'_, SqlitePool>, app: AppHandle) -> Result<(), String> {
    let id: Option<i64> = sqlx::query_scalar("SELECT id FROM items WHERE path = ?")
        .bind(&path)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if Path::new(&path).exists() {
        trash::delete(&path).map_err(|e| e.to_string())?;
    }
    sqlx::query("DELETE FROM items WHERE path = ?")
        .bind(&path)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(item_id) = id {
        let cache_dir = app.path().app_data_dir().unwrap().join("comic_cache");
        let _ = fs::remove_file(cache_dir.join(format!("{}.jpg", item_id)));
    }
    Ok(())
}

/// Remove an item from the DB without touching the filesystem (un-track).
#[tauri::command]
pub async fn untrack_item(path: String, pool: State<'_, SqlitePool>, app: AppHandle) -> Result<(), String> {
    let id: Option<i64> = sqlx::query_scalar("SELECT id FROM items WHERE path = ?")
        .bind(&path)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM items WHERE path = ?")
        .bind(&path)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(item_id) = id {
        let cache_dir = app.path().app_data_dir().unwrap().join("comic_cache");
        let _ = fs::remove_file(cache_dir.join(format!("{}.jpg", item_id)));
    }
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
pub async fn set_tag_color(id: i64, color: Option<String>, pool: State<'_, SqlitePool>) -> Result<Tag, String> {
    sqlx::query("UPDATE tags SET color = ? WHERE id = ?")
        .bind(&color)
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Tag>("SELECT id, name, color FROM tags WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())
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
    sqlx::query_as::<_, Tag>("SELECT id, name, color FROM tags WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())
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
        "SELECT id, name, color FROM tags WHERE name LIKE ? ORDER BY name ASC LIMIT 10",
    )
    .bind(pattern)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

// ── Tag counts ────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct TagCount {
    pub id: i64,
    pub count: i64,
}

#[tauri::command]
pub async fn get_tag_counts(pool: State<'_, SqlitePool>) -> Result<Vec<TagCount>, String> {
    let rows = sqlx::query(
        "SELECT tag_id AS id, COUNT(DISTINCT item_id) AS count FROM item_tags GROUP BY tag_id"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| TagCount { id: r.get("id"), count: r.get("count") }).collect())
}

// ── Tag rules & scan wizard ───────────────────────────────────────────────────

fn apply_rules_to_name(name: &str, rules: &[crate::models::TagRuleInput]) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for rule in rules {
        if rule.pattern.is_empty() { continue; }

        // 正則擷取：把 (group1) 抓到的文字直接當標籤名（支援逗號分隔多個）
        if rule.match_type == "regex_capture" {
            if let Ok(re) = regex::Regex::new(&rule.pattern) {
                if let Some(caps) = re.captures(name) {
                    if let Some(m) = caps.get(1) {
                        for part in m.as_str().split(|c: char| ",()（）、".contains(c)) {
                            let t = part.trim().to_string();
                            if !t.is_empty() && !tags.contains(&t) {
                                tags.push(t);
                            }
                        }
                    }
                }
            }
            continue;
        }

        if rule.tag_name.is_empty() { continue; }
        let matched = match rule.match_type.as_str() {
            "prefix"   => name.starts_with(&rule.pattern),
            "suffix"   => name.ends_with(&rule.pattern),
            "contains" => name.contains(&rule.pattern),
            "regex"    => regex::Regex::new(&rule.pattern)
                            .map(|re| re.is_match(name))
                            .unwrap_or(false),
            _ => false,
        };
        if matched && !tags.contains(&rule.tag_name) {
            tags.push(rule.tag_name.clone());
        }
    }
    tags
}

#[tauri::command]
pub async fn get_tag_rules(pool: State<'_, SqlitePool>) -> Result<Vec<crate::models::TagRule>, String> {
    let rows = sqlx::query(
        "SELECT id, name, match_type, pattern, COALESCE(tag_name,'') as tag_name FROM tag_rules ORDER BY id ASC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| crate::models::TagRule {
        id: r.get("id"),
        name: r.get("name"),
        match_type: r.get("match_type"),
        pattern: r.get("pattern"),
        tag_name: r.get("tag_name"),
    }).collect())
}

#[tauri::command]
pub async fn save_tag_rules(
    rules: Vec<crate::models::TagRuleInput>,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM tag_rules")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    for rule in &rules {
        sqlx::query(
            "INSERT INTO tag_rules (name, match_type, pattern, tag_name) VALUES (?, ?, ?, ?)"
        )
        .bind(&rule.name)
        .bind(&rule.match_type)
        .bind(&rule.pattern)
        .bind(&rule.tag_name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn preview_tag_scan(
    scope_path: String,
    rules: Vec<crate::models::TagRuleInput>,
) -> Result<Vec<crate::models::ScanPreviewItem>, String> {
    use walkdir::WalkDir;
    let mut results = Vec::new();
    for entry in WalkDir::new(&scope_path).min_depth(1).into_iter().filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_string();
        let proposed_tags = apply_rules_to_name(&name, &rules);
        if !proposed_tags.is_empty() {
            results.push(crate::models::ScanPreviewItem {
                path: entry.path().to_string_lossy().to_string(),
                name,
                is_dir: entry.file_type().is_dir(),
                proposed_tags,
            });
        }
    }
    results.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(results)
}

#[tauri::command]
pub async fn apply_tag_scan(
    scope_path: String,
    rules: Vec<crate::models::TagRuleInput>,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let cache_dir = app.path().app_data_dir().unwrap().join("comic_cache");
    let (added, updated, removed) = scanner::incremental_scan_directory(&pool, &scope_path, &cache_dir, &app)
        .await
        .map_err(|e| e.to_string())?;

    let items = sqlx::query("SELECT id, name FROM items WHERE path LIKE ?")
        .bind(format!("{}%", scope_path))
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut tagged = 0i32;
    for item in &items {
        let item_id: i64 = item.get("id");
        let name: String = item.get("name");
        for tag_name in apply_rules_to_name(&name, &rules) {
            sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?)")
                .bind(&tag_name)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            let tag_id: i64 = sqlx::query("SELECT id FROM tags WHERE name = ?")
                .bind(&tag_name)
                .fetch_one(&*pool)
                .await
                .map_err(|e| e.to_string())?
                .get("id");
            sqlx::query(
                "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source) VALUES (?, ?, 'rule')"
            )
            .bind(item_id)
            .bind(tag_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            tagged += 1;
        }
    }

    Ok(serde_json::json!({ "added": added, "updated": updated, "removed": removed, "tagged": tagged }))
}

// ── Duplicate detection ───────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct DuplicateGroup {
    pub fingerprint: String,
    pub items: Vec<Item>,
}

#[tauri::command]
pub async fn get_duplicate_groups(pool: State<'_, SqlitePool>) -> Result<Vec<DuplicateGroup>, String> {
    let fp_rows = sqlx::query(
        "SELECT fingerprint FROM items
         WHERE fingerprint IS NOT NULL AND item_type = 'file'
         GROUP BY fingerprint HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut groups = Vec::new();
    for row in fp_rows {
        let fingerprint: String = row.get("fingerprint");
        let item_rows = sqlx::query(
            "SELECT * FROM items WHERE fingerprint = ? AND item_type = 'file' ORDER BY import_at ASC"
        )
        .bind(&fingerprint)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        for item_row in item_rows {
            let id: i64 = item_row.get("id");
            let tags = fetch_item_tags(&pool, id).await?;
            items.push(read_item_from_row(&item_row, tags));
        }
        groups.push(DuplicateGroup { fingerprint, items });
    }
    Ok(groups)
}

#[tauri::command]
pub async fn compute_fingerprints(pool: State<'_, SqlitePool>, app: AppHandle) -> Result<i32, String> {
    let rows = sqlx::query(
        "SELECT id, path FROM items WHERE fingerprint IS NULL AND item_type = 'file'"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let total = rows.len() as i32;
    let mut count = 0i32;
    for row in &rows {
        let id: i64 = row.get("id");
        let path: String = row.get("path");
        if let Some(fp) = scanner::compute_file_fingerprint(std::path::Path::new(&path)) {
            let _ = sqlx::query("UPDATE items SET fingerprint = ? WHERE id = ?")
                .bind(&fp)
                .bind(id)
                .execute(&*pool)
                .await;
            count += 1;
        }
        let _ = app.emit("fingerprint-progress", serde_json::json!({
            "current": count,
            "total": total
        }));
    }
    Ok(count)
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

// ── Item Type management ──────────────────────────────────────────────────────

async fn fetch_type_extensions(pool: &SqlitePool, type_id: i64) -> Result<Vec<String>, String> {
    sqlx::query_scalar::<_, String>(
        "SELECT extension FROM type_extensions WHERE type_id = ? ORDER BY extension ASC"
    )
    .bind(type_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_item_types(pool: State<'_, SqlitePool>) -> Result<Vec<ItemType>, String> {
    let rows = sqlx::query(
        "SELECT id, name, icon, display_name, color, is_builtin FROM item_types ORDER BY id ASC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut types = Vec::new();
    for row in rows {
        let id: i64 = row.get("id");
        let is_builtin_int: i64 = row.get("is_builtin");
        let extensions = fetch_type_extensions(&pool, id).await?;
        types.push(ItemType {
            id,
            name: row.get("name"),
            icon: row.get("icon"),
            display_name: row.get("display_name"),
            color: row.get("color"),
            is_builtin: is_builtin_int != 0,
            extensions,
        });
    }
    Ok(types)
}

#[tauri::command]
pub async fn create_item_type(
    input: ItemTypeInput,
    pool: State<'_, SqlitePool>,
) -> Result<ItemType, String> {
    let id = sqlx::query(
        "INSERT INTO item_types (name, icon, display_name, color) VALUES (?, ?, ?, ?)"
    )
    .bind(&input.name)
    .bind(&input.icon)
    .bind(&input.display_name)
    .bind(&input.color)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    for ext in &input.extensions {
        sqlx::query(
            "INSERT OR IGNORE INTO type_extensions (type_id, extension) VALUES (?, ?)"
        )
        .bind(id)
        .bind(ext.to_lowercase())
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(ItemType {
        id,
        name: input.name,
        icon: input.icon,
        display_name: input.display_name,
        color: input.color,
        is_builtin: false,
        extensions: input.extensions.iter().map(|e| e.to_lowercase()).collect(),
    })
}

#[tauri::command]
pub async fn update_item_type(
    id: i64,
    input: ItemTypeInput,
    pool: State<'_, SqlitePool>,
) -> Result<ItemType, String> {
    let row = sqlx::query("SELECT name, is_builtin FROM item_types WHERE id = ?")
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到指定類型".to_string())?;

    let existing_name: String = row.get("name");
    let is_builtin_int: i64 = row.get("is_builtin");

    if is_builtin_int != 0 && input.name != existing_name {
        return Err("內建類型的識別名稱不可修改".to_string());
    }

    sqlx::query(
        "UPDATE item_types SET name = ?, icon = ?, display_name = ?, color = ? WHERE id = ?"
    )
    .bind(&input.name)
    .bind(&input.icon)
    .bind(&input.display_name)
    .bind(&input.color)
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM type_extensions WHERE type_id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    for ext in &input.extensions {
        sqlx::query(
            "INSERT OR IGNORE INTO type_extensions (type_id, extension) VALUES (?, ?)"
        )
        .bind(id)
        .bind(ext.to_lowercase())
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(ItemType {
        id,
        name: input.name,
        icon: input.icon,
        display_name: input.display_name,
        color: input.color,
        is_builtin: is_builtin_int != 0,
        extensions: input.extensions.iter().map(|e| e.to_lowercase()).collect(),
    })
}

#[tauri::command]
pub async fn delete_item_type(id: i64, pool: State<'_, SqlitePool>) -> Result<(), String> {
    let row = sqlx::query("SELECT name, is_builtin FROM item_types WHERE id = ?")
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到指定類型".to_string())?;

    let is_builtin_int: i64 = row.get("is_builtin");
    if is_builtin_int != 0 {
        return Err("內建類型不可刪除".to_string());
    }

    let type_name: String = row.get("name");

    sqlx::query("UPDATE items SET category = 'default' WHERE category = ?")
        .bind(&type_name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM item_types WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
