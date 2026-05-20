use super::helpers::{fetch_item_tags, read_item_from_row};
use crate::models::{Item, Page};
use crate::{db, zip_utils};
use base64::{engine::general_purpose, Engine as _};
use sqlx::{Row, SqlitePool};
use std::fs;
use tauri::{AppHandle, Manager, State};

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
        Some("name") => "i.name",
        Some("fileSize") => "i.file_size",
        Some("fileModifiedAt") => "i.file_modified_at",
        _ => "i.import_at",
    };
    let dir = if sort_dir.as_deref() == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };
    let source_like = source_path.as_deref().map(|p| format!("{}%", p));
    let source_like_alt = source_path.as_deref().map(|p| {
        let alt = if p.contains('\\') {
            p.replace('\\', "/")
        } else {
            p.replace('/', "\\")
        };
        format!("{}%", alt)
    });
    let active_tags: Vec<i64> = tag_ids.unwrap_or_default();
    let with_tags = !active_tags.is_empty();
    let has_source = source_path.is_some();

    // Build both data and count queries with the same conditions
    macro_rules! build_query {
        ($select:expr) => {{
            let mut qb = sqlx::QueryBuilder::new($select);
            // OR-logic multi-tag filter: show items that have ANY of the selected tags
            if with_tags {
                qb.push(" WHERE i.id IN (SELECT DISTINCT item_id FROM item_tags WHERE tag_id IN (");
                let mut sep = qb.separated(", ");
                for id in &active_tags {
                    sep.push_bind(*id);
                }
                qb.push("))");
            }
            let mut need_and = with_tags;
            if has_source {
                qb.push(if need_and { " AND" } else { " WHERE" });
                qb.push(" (i.path LIKE ");
                qb.push_bind(
                    source_like
                        .clone()
                        .expect("source_like is Some when has_source is true"),
                );
                qb.push(" OR i.path LIKE ");
                qb.push_bind(
                    source_like_alt
                        .clone()
                        .expect("source_like_alt is Some when has_source is true"),
                );
                qb.push(")");
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

    let rows = qb
        .build()
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
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
    Ok(Page {
        content: items,
        total_pages,
        total_elements,
        number: page,
        size,
    })
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

    fs::rename(old_path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))?;

    let new_path_str = new_path.to_string_lossy().to_string();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    db::update_item_name_and_path(&mut *tx, id, &name, &new_path_str)
        .await
        .map_err(|e| e.to_string())?;

    if item_type == "folder" {
        let old_prefix = format!("{}\\", old_path_str);
        let new_prefix = format!("{}\\", new_path_str);
        let like_pattern = format!("{}%", old_prefix);
        db::update_item_path_prefix(&mut *tx, &old_prefix, &new_prefix, &like_pattern)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    get_item(id, pool).await
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
            matches!(
                l.as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp"
            )
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

    // 單張圖片：直接讀檔案內容做封面。
    if is_image_path(&file_path) {
        let data = fs::read(&file_path).map_err(|e| e.to_string())?;
        let b64 = general_purpose::STANDARD.encode(&data);
        return Ok(format!("data:image/jpeg;base64,{}", b64));
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

/// 確保縮圖快取存在：若 thumb_cache/{id}.jpg 不存在則現場生成。
/// 成功後前端可直接用 comic-cache://localhost/{id}.jpg 顯示縮圖，不走 IPC base64。
#[tauri::command]
pub async fn ensure_thumb_cache(
    id: i64,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<(), String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    let cache_file = cache_dir.join(format!("{}.jpg", id));

    // 快取已存在 → 直接回傳
    if cache_file.exists() {
        return Ok(());
    }

    // 查詢 item 資訊
    let row = sqlx::query("SELECT path, cover_cache_path FROM items WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let file_path: String = row.get("path");
    let cover_cache_path: Option<String> = row.get("cover_cache_path");

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

    fs::write(&cache_file, &image_data).map_err(|e| e.to_string())?;
    Ok(())
}
