use super::helpers::{fetch_item_tags, read_item_from_row};
use crate::debug_log::DebugState;
use crate::models::{Item, Page};
use crate::{db, thumbnail_cache, zip_utils};
use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use sqlx::{Row, SqlitePool};
use std::fs;
use tauri::{AppHandle, Manager, State};

// ── Items (new primary API) ───────────────────────────────────────────────────

fn image_data_url(data: &[u8]) -> String {
    let content_type = zip_utils::image_content_type(data);
    let b64 = general_purpose::STANDARD.encode(data);
    format!("data:{};base64,{}", content_type, b64)
}

#[tauri::command]
pub async fn get_items(
    page: i64, size: i64, tag_ids: Option<Vec<i64>>, sort_by: Option<String>,
    sort_dir: Option<String>, source_path: Option<String>, item_type: Option<String>,
    include_missing: Option<bool>, search: Option<String>, frequent_only: Option<bool>,
    pool: State<'_, SqlitePool>,
) -> Result<Page<Item>, String> {
    query_items(&pool, page, size, tag_ids, sort_by, sort_dir, source_path,
        item_type, include_missing, search, frequent_only).await
}

pub(super) async fn query_items(
    pool: &SqlitePool, page: i64, size: i64, tag_ids: Option<Vec<i64>>, sort_by: Option<String>,
    sort_dir: Option<String>, source_path: Option<String>, item_type: Option<String>,
    include_missing: Option<bool>, search: Option<String>, frequent_only: Option<bool>,
) -> Result<Page<Item>, String> {
    if page < 0 || !(1..=1000).contains(&size) { return Err("頁碼或每頁數量無效".into()); }
    let offset = page.checked_mul(size).ok_or("頁碼過大")?;
    let col = match sort_by.as_deref() {
        Some("name") => "i.name COLLATE NOCASE",
        Some("fileSize") => "i.file_size",
        Some("fileModifiedAt") => "i.file_modified_at",
        Some("openCount") => "i.open_count",
        _ => "i.import_at",
    };
    let dir = if sort_dir.as_deref() == Some("asc") { "ASC" } else { "DESC" };
    let mut tags = tag_ids.unwrap_or_default();
    tags.sort_unstable(); tags.dedup();
    let search_pattern = search.as_deref().map(str::trim).filter(|q| !q.is_empty())
        .map(|q| format!("%{}%", db::escape_like(q)));
    macro_rules! build_query {
        ($select:expr) => {{
            let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new($select);
            qb.push(" WHERE 1=1");
            if !tags.is_empty() {
                qb.push(" AND i.id IN (SELECT item_id FROM item_tags WHERE tag_id IN (");
                let mut values = qb.separated(",");
                for id in &tags { values.push_bind(*id); }
                qb.push(") GROUP BY item_id HAVING COUNT(DISTINCT tag_id) = ");
                qb.push_bind(tags.len() as i64); qb.push(")");
            }
            if let Some(path) = &source_path {
                let root = db::path_key(path);
                qb.push(" AND (REPLACE(i.path, '\\', '/') = "); qb.push_bind(root.clone());
                qb.push(" COLLATE NOCASE OR REPLACE(i.path, '\\', '/') LIKE ");
                qb.push_bind(format!("{}/%", db::escape_like(&root))); qb.push(" ESCAPE '!')");
            } else if tags.is_empty() {
                qb.push(" AND EXISTS (SELECT 1 FROM sources s WHERE REPLACE(i.path, '\\', '/') = RTRIM(REPLACE(s.path, '\\', '/'), '/') COLLATE NOCASE OR SUBSTR(REPLACE(i.path, '\\', '/'), 1, LENGTH(RTRIM(REPLACE(s.path, '\\', '/'), '/')) + 1) = RTRIM(REPLACE(s.path, '\\', '/'), '/') || '/' COLLATE NOCASE)");
            }
            if let Some(kind) = &item_type { qb.push(" AND i.item_type = "); qb.push_bind(kind.clone()); }
            if !include_missing.unwrap_or(false) { qb.push(" AND i.exists_on_disk = 1"); }
            if frequent_only.unwrap_or(false) { qb.push(" AND i.open_count > 0"); }
            if let Some(pattern) = &search_pattern {
                qb.push(" AND (i.name LIKE "); qb.push_bind(pattern.clone()); qb.push(" ESCAPE '!' OR COALESCE(i.note, '') LIKE ");
                qb.push_bind(pattern.clone()); qb.push(" ESCAPE '!' OR EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id AND t.name LIKE ");
                qb.push_bind(pattern.clone()); qb.push(" ESCAPE '!'))");
            }
            qb
        }};
    }
    let mut qb = build_query!("SELECT i.* FROM items i");
    qb.push(format!(" ORDER BY {col} {dir}, i.id ASC LIMIT "));
    qb.push_bind(size); qb.push(" OFFSET "); qb.push_bind(offset);
    let rows = qb.build().fetch_all(pool).await.map_err(|e| e.to_string())?;
    let ids: Vec<i64> = rows.iter().map(|row| row.get("id")).collect();
    let mut tags_by_item = super::helpers::fetch_tags_for_items(pool, &ids).await?;
    let items = rows.iter().map(|row| read_item_from_row(row, tags_by_item.remove(&row.get::<i64, _>("id")).unwrap_or_default())).collect();
    let mut count = build_query!("SELECT COUNT(*) FROM items i");
    let total: i64 = count.build_query_scalar().fetch_one(pool).await.map_err(|e| e.to_string())?;
    Ok(Page { content: items, total_pages: (total + size - 1) / size, total_elements: total, number: page, size })
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
pub async fn get_item_by_path(
    path: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<Item>, String> {
    let row = sqlx::query("SELECT * FROM items WHERE REPLACE(path, '\\', '/') = ? COLLATE NOCASE")
        .bind(db::path_key(&path))
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
pub async fn tag_item(
    item_id: i64,
    tag_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    db::add_tag_to_item(&pool, item_id, tag_id)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn untag_item(
    item_id: i64,
    tag_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?")
        .bind(item_id)
        .bind(tag_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── File-item operations ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn rename_item(
    id: i64,
    name: String,
    pool: State<'_, SqlitePool>,
) -> Result<Item, String> {
    let row = sqlx::query("SELECT path, item_type FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let old_path_str: String = row.get("path");
    let item_type: String = row.get("item_type");
    let old_path = std::path::Path::new(&old_path_str);
    let new_path = build_renamed_path(old_path, &name, &item_type)?;
    if new_path == old_path { return get_item(id, pool).await; }

    if new_path.exists() && db::path_key(&new_path.to_string_lossy()) != db::path_key(&old_path_str) {
        return Err("A file with the same name already exists".to_string());
    }

    let new_path_str = new_path.to_string_lossy().to_string();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let display_name = new_path.file_name().unwrap().to_string_lossy();
    db::update_item_name_and_path(&mut *tx, id, &display_name, &new_path_str)
        .await
        .map_err(|e| e.to_string())?;

    if item_type == "folder" {
        let old_prefix = format!("{}\\", old_path_str);
        let new_prefix = format!("{}\\", new_path_str);
        let like_pattern = format!("{}%", old_prefix);
        db::update_item_path_prefix(&mut *tx, &old_prefix, &new_prefix, &like_pattern)
            .await
            .map_err(|e| e.to_string())?;
        for (table, column) in [("sources", "path"), ("tag_rules", "scope_path")] {
            let sql = format!("UPDATE {table} SET {column} = ? || SUBSTR({column}, LENGTH(?) + 1) WHERE REPLACE({column}, '\\', '/') = ? COLLATE NOCASE OR REPLACE({column}, '\\', '/') LIKE ? ESCAPE '!'");
            sqlx::query(&sql).bind(&new_path_str).bind(&old_path_str).bind(db::path_key(&old_path_str))
                .bind(format!("{}/%", db::escape_like(&db::path_key(&old_path_str))))
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    fs::rename(old_path, &new_path).map_err(|e| format!("重新命名失敗：{e}"))?;
    if let Err(error) = tx.commit().await {
        let rollback = fs::rename(&new_path, old_path);
        return Err(format!("資料庫更新失敗：{error}；檔案復原結果：{rollback:?}"));
    }

    get_item(id, pool).await
}

fn build_renamed_path(old_path: &std::path::Path, name: &str, item_type: &str) -> Result<std::path::PathBuf, String> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.ends_with('.')
        || name.chars().any(|c| c.is_control() || "\\/<>:\"|?*".contains(c)) {
        return Err("名稱無效，請只輸入檔名或資料夾名稱".into());
    }
    let new_name = if item_type == "file" && std::path::Path::new(name).extension().is_none() {
        match old_path.extension().and_then(|ext| ext.to_str()) {
            Some(ext) => format!("{name}.{ext}"), None => name.to_string(),
        }
    } else { name.to_string() };
    Ok(old_path.with_file_name(new_name))
}

#[cfg(test)]
mod query_tests {
    use super::*;
    #[test]
    fn rename_accepts_full_names_and_keeps_folder_dots() {
        use std::path::Path;
        assert_eq!(build_renamed_path(Path::new("book.zip"), "new.zip", "file").unwrap(), Path::new("new.zip"));
        assert_eq!(build_renamed_path(Path::new("book.zip"), "new", "file").unwrap(), Path::new("new.zip"));
        assert_eq!(build_renamed_path(Path::new("folder.old"), "folder.new", "folder").unwrap(), Path::new("folder.new"));
        assert!(build_renamed_path(Path::new("book.zip"), "../other", "file").is_err());
    }
    #[tokio::test]
    async fn search_and_sort_run_before_pagination_and_obey_scope_boundaries() {
        let dir = tempfile::tempdir().unwrap(); let pool = db::init_db(dir.path()).await.unwrap();
        db::add_source(&pool, "C:\\Library\\A_").await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        for i in 0..10000 {
            let id = db::insert_item(&mut *tx, &format!("C:\\Library\\A_\\{i}.zip"), "file", &format!("book {i:05}"), Some(i), Some(i), "now", None).await.unwrap();
            if i == 9999 { db::update_item_note(&mut *tx, id, "unique needle").await.unwrap(); }
        }
        db::insert_item(&mut *tx, "C:\\Library\\AB\\wrong.zip", "file", "wrong", Some(99999), None, "now", None).await.unwrap();
        tx.commit().await.unwrap();
        let started = std::time::Instant::now();
        let result = query_items(&pool, 0, 200, None, Some("fileSize".into()), Some("desc".into()), Some("C:/Library/A_".into()), None, None, Some("unique needle".into()), None).await.unwrap();
        assert_eq!(result.total_elements, 1); assert_eq!(result.content[0].name, "book 09999");
        let all = query_items(&pool, 0, 200, None, Some("fileSize".into()), Some("desc".into()), None, None, None, None, None).await.unwrap();
        assert_eq!(all.total_elements, 10000); assert_eq!(all.content.len(), 200); assert_eq!(all.content[0].name, "book 09999");
        println!("10k-row search + sorted first page: {:?}", started.elapsed());
        let tag = db::create_tag(&pool, "tag needle").await.unwrap();
        db::add_tag_to_item(&pool, result.content[0].id, tag.id).await.unwrap();
        let tagged = query_items(&pool, 0, 200, Some(vec![tag.id]), None, None, None, None, None, Some("tag needle".into()), None).await.unwrap();
        assert_eq!(tagged.content.len(),1);
        assert!(query_items(&pool,0,0,None,None,None,None,None,None,None,None).await.is_err());
    }
}

/// 副檔名是否為本專案 zip_utils 能解析的壓縮包。
fn is_archive_path(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let l = e.to_lowercase();
            matches!(l.as_str(), "zip" | "cbz")
        })
        .unwrap_or(false)
}

/// 副檔名是否為單張圖片。
fn is_image_path(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let l = e.to_lowercase();
            matches!(l.as_str(), "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp")
        })
        .unwrap_or(false)
}

#[tauri::command]
pub async fn get_item_images(id: i64, pool: State<'_, SqlitePool>) -> Result<Vec<String>, String> {
    let path: String = sqlx::query("SELECT path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);
    // 非壓縮包檔案沒有「內部影像條目」可列，回空陣列而不是 Err，避免前端 toast 誤報。
    if !is_archive_path(&path) {
        return Ok(Vec::new());
    }
    zip_utils::get_image_entries(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_item_image_base64(
    id: i64,
    image_path: String,
    pool: State<'_, SqlitePool>,
) -> Result<String, String> {
    let path: String = sqlx::query("SELECT path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);

    if !is_archive_path(&path) {
        return Err("Item is not a readable archive".to_string());
    }

    let image_data = zip_utils::extract_image(&path, &image_path).map_err(|e| e.to_string())?;
    Ok(image_data_url(&image_data))
}

#[tauri::command]
pub async fn get_archive_images_by_path(path: String) -> Result<Vec<String>, String> {
    if !is_archive_path(&path) {
        return Ok(Vec::new());
    }
    zip_utils::get_image_entries(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_archive_image_base64_by_path(
    path: String,
    image_path: String,
) -> Result<String, String> {
    if !is_archive_path(&path) {
        return Err("Item is not a readable archive".to_string());
    }

    let image_data = zip_utils::extract_image(&path, &image_path).map_err(|e| e.to_string())?;
    Ok(image_data_url(&image_data))
}

#[tauri::command]
pub async fn set_item_cover(
    id: i64,
    image_path: String,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<(), String> {
    db::update_item_cover(&*pool, id, &image_path)
        .await
        .map_err(|e| e.to_string())?;

    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    let file_path: String = sqlx::query("SELECT path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .get(0);

    if let Ok(data) = zip_utils::extract_image(&file_path, &image_path) {
        let _ = thumbnail_cache::write_thumbnail_cache(&cache_dir, id, &data);
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

    // 單張圖片：直接讀檔案內容做封面。
    if is_image_path(&file_path) {
        let data = fs::read(&file_path).map_err(|e| e.to_string())?;
        return Ok(image_data_url(&data));
    }

    // 不是壓縮包也不是圖片（例如影片、PDF）：沒有封面，回空字串，由前端決定備援顯示。
    if !is_archive_path(&file_path) {
        return Ok(String::new());
    }

    let image_data = if let Some(cover) = cover_cache_path {
        zip_utils::extract_image(&file_path, &cover).map_err(|e| e.to_string())?
    } else {
        let entries = zip_utils::get_image_entries(&file_path).map_err(|e| e.to_string())?;
        if entries.is_empty() {
            return Err("No images in zip".to_string());
        }
        zip_utils::extract_image(&file_path, &entries[0]).map_err(|e| e.to_string())?
    };

    Ok(image_data_url(&image_data))
}

#[tauri::command]
pub async fn get_zip_cover_by_path(path: String) -> Result<String, String> {
    let entries = zip_utils::get_image_entries(&path).map_err(|e| e.to_string())?;
    if entries.is_empty() {
        return Err("No images in zip".to_string());
    }
    let image_data = zip_utils::extract_image(&path, &entries[0]).map_err(|e| e.to_string())?;
    Ok(image_data_url(&image_data))
}

/// 確保縮圖快取存在：若 thumb_cache/{id}.jpg 不存在則現場生成。
/// 成功後前端可直接用 comic-cache://localhost/{id}.jpg 顯示縮圖，不走 IPC base64。
#[tauri::command]
pub async fn ensure_thumb_cache(
    id: i64,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
    debug_state: State<'_, DebugState>,
) -> Result<(), String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    let cache_file = thumbnail_cache::cache_path(&cache_dir, id);
    let row = sqlx::query("SELECT path, cover_cache_path FROM items WHERE id = ?")
        .bind(id).fetch_one(&*pool).await.map_err(|e| e.to_string())?;
    let file_path: String = row.get("path");
    let cover_cache_path: Option<String> = row.get("cover_cache_path");
    let metadata = fs::metadata(&file_path).map_err(|e| e.to_string())?;
    let source_version = serde_json::to_string(&json!({
        "path": file_path, "size": metadata.len(), "cover": cover_cache_path,
        "mtime": metadata.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_nanos().to_string()),
    })).map_err(|e| e.to_string())?;
    let version_file = cache_file.with_extension("version.json");

    // 快取已存在且非空 → 直接回傳
    // 若檔案大小為 0（寫入中斷、磁碟滿等），視為無效快取，刪掉重建
    if cache_file.exists() {
        let meta = fs::metadata(&cache_file).map_err(|e| e.to_string())?;
        if meta.len() > 0 && thumbnail_cache::is_valid_cache_file(&cache_file)
            && fs::read_to_string(&version_file).ok().as_deref() == Some(&source_version) {
            let data = fs::read(&cache_file).map_err(|e| e.to_string())?;
            debug_state.log_info(
                "thumbnail.ensure_cache.hit",
                json!({
                    "id": id,
                    "cache_file": cache_file.to_string_lossy(),
                    "bytes": meta.len(),
                    "content_type": zip_utils::image_content_type(&data),
                    "head": zip_utils::debug_hex_prefix(&data, 16),
                }),
            );
            return Ok(());
        }
        // 快取檔為空 → 刪除並重建
        debug_state.log_warn(
            "thumbnail.ensure_cache.invalid",
            json!({
                "id": id,
                "cache_file": cache_file.to_string_lossy(),
                "bytes": meta.len(),
            }),
        );
        fs::remove_file(&cache_file).map_err(|e| e.to_string())?;
    }

    // 確保 thumb_cache 目錄存在
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    // 查詢 item 資訊
    let row = sqlx::query("SELECT path, cover_cache_path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let file_path: String = row.get("path");
    let cover_cache_path: Option<String> = row.get("cover_cache_path");

    debug_state.log_info(
        "thumbnail.ensure_cache.build",
        json!({
            "id": id,
            "file_path": file_path,
            "cover_cache_path": cover_cache_path,
            "cache_file": cache_file.to_string_lossy(),
        }),
    );

    let image_data = if is_image_path(&file_path) {
        // 單張圖片：直接讀取寫入快取
        fs::read(&file_path).map_err(|e| e.to_string())?
    } else if is_archive_path(&file_path) {
        // 壓縮包：提取封面
        if let Some(cover) = cover_cache_path {
            zip_utils::extract_image(&file_path, &cover).map_err(|e| e.to_string())?
        } else {
            let entries = zip_utils::get_image_entries(&file_path).map_err(|e| e.to_string())?;
            if entries.is_empty() {
                return Err("No images in zip".to_string());
            }
            zip_utils::extract_image(&file_path, &entries[0]).map_err(|e| e.to_string())?
        }
    } else {
        // 非圖片/非壓縮包（影片、PDF 等）：無法生成縮圖
        return Err("No thumbnail available".to_string());
    };

    let written = thumbnail_cache::write_thumbnail_cache(&cache_dir, id, &image_data)
        .map_err(|e| e.to_string())?;
    fs::write(&version_file, source_version).map_err(|e| e.to_string())?;
    debug_state.log_info(
        "thumbnail.ensure_cache.written",
        json!({
            "id": id,
            "cache_file": written.path.to_string_lossy(),
            "source_bytes": image_data.len(),
            "bytes": written.bytes,
            "content_type": "image/jpeg",
        }),
    );
    Ok(())
}
