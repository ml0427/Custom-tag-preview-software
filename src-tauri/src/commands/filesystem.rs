use super::helpers::{fetch_item_tags, read_item_from_row};
use crate::db;
use crate::models::Item;
use base64::{engine::general_purpose, Engine as _};
use sqlx::{Row, SqlitePool};
use tauri::State;

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
pub async fn quick_import_item(path: String, pool: State<'_, SqlitePool>) -> Result<Item, String> {
    use std::time::UNIX_EPOCH;
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("路徑不存在：{}", path));
    }
    let is_dir = p.is_dir();
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    let mtime_unix = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let file_size: Option<i64> = if is_dir {
        None
    } else {
        Some(metadata.len() as i64)
    };
    let item_type = if is_dir { "folder" } else { "file" };
    let import_at = chrono::Local::now().to_rfc3339();

    let inserted_id = db::insert_item(
        &*pool,
        &path,
        item_type,
        &name,
        file_size,
        Some(mtime_unix),
        &import_at,
        None,
    ).await.map_err(|e| e.to_string())?;
    if inserted_id == 0 {
        if !is_dir {
            db::update_item_size_mtime(&*pool, sqlx::query_scalar::<_, i64>("SELECT id FROM items WHERE path = ?")
                .bind(&path)
                .fetch_one(&*pool)
                .await
                .map_err(|e| e.to_string())?, file_size, mtime_unix)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            db::mark_item_seen_by_path(&*pool, &path, &import_at)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    let row = sqlx::query("SELECT * FROM items WHERE path = ?")
        .bind(&path)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let id: i64 = row.get("id");
    let tags = fetch_item_tags(&pool, id).await?;
    Ok(read_item_from_row(&row, tags))
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
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let is_dir = metadata.is_dir();

        let extension = if is_dir {
            None
        } else {
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
        if is_dir {
            dirs.push(item);
        } else {
            files.push(item);
        }
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
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    };
    Ok(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(&bytes)
    ))
}
