use crate::models::{FolderRulePreset, FolderRulePresetInput};
use sqlx::{Row, SqlitePool};
use tauri::State;

fn serialize_extensions(extensions: &[String]) -> String {
    extensions
        .iter()
        .map(|ext| ext.trim().to_lowercase())
        .filter(|ext| !ext.is_empty())
        .map(|ext| {
            if ext.starts_with('.') {
                ext
            } else {
                format!(".{ext}")
            }
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn parse_extensions(value: String) -> Vec<String> {
    value
        .split(',')
        .map(|ext| ext.trim().to_string())
        .filter(|ext| !ext.is_empty())
        .collect()
}

fn preset_from_row(row: &sqlx::sqlite::SqliteRow) -> FolderRulePreset {
    FolderRulePreset {
        folder_item_id: row.get("folder_item_id"),
        preset_type_id: row.get("preset_type_id"),
        preset_name: row.get("preset_name"),
        preset_display_name: row.get("preset_display_name"),
        preset_icon: row.get("preset_icon"),
        apply_to_subfolders: row.get::<i64, _>("apply_to_subfolders") != 0,
        apply_to_files: row.get::<i64, _>("apply_to_files") != 0,
        file_extensions: parse_extensions(row.get("file_extensions")),
    }
}

async fn ensure_folder_item(pool: &SqlitePool, folder_item_id: i64) -> Result<(), String> {
    let row = sqlx::query("SELECT item_type FROM items WHERE id = ?")
        .bind(folder_item_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到指定資料夾".to_string())?;

    let item_type: String = row.get("item_type");
    if item_type != "folder" {
        return Err("只有資料夾可以設定預設標籤規則集".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_folder_rule_presets(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<FolderRulePreset>, String> {
    let rows = sqlx::query(
        "SELECT frp.folder_item_id,
                frp.preset_type_id,
                it.name AS preset_name,
                it.display_name AS preset_display_name,
                it.icon AS preset_icon,
                frp.apply_to_subfolders,
                frp.apply_to_files,
                frp.file_extensions
         FROM folder_rule_presets frp
         JOIN item_types it ON it.id = frp.preset_type_id
         JOIN items item ON item.id = frp.folder_item_id
         WHERE item.item_type = 'folder'
         ORDER BY frp.folder_item_id ASC",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(preset_from_row).collect())
}

#[tauri::command]
pub async fn get_folder_rule_preset(
    folder_item_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<Option<FolderRulePreset>, String> {
    let row = sqlx::query(
        "SELECT frp.folder_item_id,
                frp.preset_type_id,
                it.name AS preset_name,
                it.display_name AS preset_display_name,
                it.icon AS preset_icon,
                frp.apply_to_subfolders,
                frp.apply_to_files,
                frp.file_extensions
         FROM folder_rule_presets frp
         JOIN item_types it ON it.id = frp.preset_type_id
         WHERE frp.folder_item_id = ?",
    )
    .bind(folder_item_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.as_ref().map(preset_from_row))
}

#[tauri::command]
pub async fn set_folder_rule_preset(
    input: FolderRulePresetInput,
    pool: State<'_, SqlitePool>,
) -> Result<FolderRulePreset, String> {
    ensure_folder_item(&pool, input.folder_item_id).await?;

    let preset_exists: Option<i64> = sqlx::query_scalar("SELECT id FROM item_types WHERE id = ?")
        .bind(input.preset_type_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    if preset_exists.is_none() {
        return Err("找不到指定標籤規則集".to_string());
    }

    sqlx::query(
        "INSERT INTO folder_rule_presets (
            folder_item_id,
            preset_type_id,
            apply_to_subfolders,
            apply_to_files,
            file_extensions,
            updated_at
         ) VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(folder_item_id) DO UPDATE SET
            preset_type_id = excluded.preset_type_id,
            apply_to_subfolders = excluded.apply_to_subfolders,
            apply_to_files = excluded.apply_to_files,
            file_extensions = excluded.file_extensions,
            updated_at = datetime('now')",
    )
    .bind(input.folder_item_id)
    .bind(input.preset_type_id)
    .bind(if input.apply_to_subfolders { 1 } else { 0 })
    .bind(if input.apply_to_files { 1 } else { 0 })
    .bind(serialize_extensions(&input.file_extensions))
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    get_folder_rule_preset(input.folder_item_id, pool)
        .await?
        .ok_or_else(|| "儲存標籤規則集失敗".to_string())
}

#[tauri::command]
pub async fn clear_folder_rule_preset(
    folder_item_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM folder_rule_presets WHERE folder_item_id = ?")
        .bind(folder_item_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
