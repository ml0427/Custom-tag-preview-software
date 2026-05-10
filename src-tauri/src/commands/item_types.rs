use crate::models::{ItemType, ItemTypeInput};
use sqlx::{Row, SqlitePool};
use tauri::State;

// ── Item Type management ──────────────────────────────────────────────────────

async fn fetch_type_extensions(pool: &SqlitePool, type_id: i64) -> Result<Vec<String>, String> {
    sqlx::query_scalar::<_, String>(
        "SELECT extension FROM type_extensions WHERE type_id = ? ORDER BY extension ASC",
    )
    .bind(type_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn fetch_category_tag_rules(
    pool: &SqlitePool,
    category_name: &str,
) -> Result<Vec<crate::models::TagRuleInput>, String> {
    let rows = sqlx::query(
        "SELECT match_type, pattern, tag_name FROM category_tag_rules WHERE category_name = ? ORDER BY id ASC"
    )
    .bind(category_name)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| crate::models::TagRuleInput {
            name: String::new(),
            match_type: r.get("match_type"),
            pattern: r.get("pattern"),
            tag_name: r.get("tag_name"),
        })
        .collect())
}

async fn save_category_tag_rules(
    pool: &SqlitePool,
    category_name: &str,
    rules: &[crate::models::TagRuleInput],
) -> Result<(), String> {
    sqlx::query("DELETE FROM category_tag_rules WHERE category_name = ?")
        .bind(category_name)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    for rule in rules {
        sqlx::query(
            "INSERT INTO category_tag_rules (category_name, match_type, pattern, tag_name) VALUES (?, ?, ?, ?)"
        )
        .bind(category_name)
        .bind(&rule.match_type)
        .bind(&rule.pattern)
        .bind(&rule.tag_name)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_item_types(pool: State<'_, SqlitePool>) -> Result<Vec<ItemType>, String> {
    let rows = sqlx::query(
        "SELECT id, name, icon, display_name, color, COALESCE(example,'') AS example, is_builtin FROM item_types ORDER BY id ASC",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut types = Vec::new();
    for row in rows {
        let id: i64 = row.get("id");
        let name: String = row.get("name");
        let is_builtin_int: i64 = row.get("is_builtin");
        let extensions = fetch_type_extensions(&pool, id).await?;
        let tag_rules = fetch_category_tag_rules(&pool, &name).await?;
        types.push(ItemType {
            id,
            name,
            icon: row.get("icon"),
            display_name: row.get("display_name"),
            color: row.get("color"),
            example: row.get("example"),
            is_builtin: is_builtin_int != 0,
            extensions,
            tag_rules,
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
        "INSERT INTO item_types (name, icon, display_name, color, example) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&input.name)
    .bind(&input.icon)
    .bind(&input.display_name)
    .bind(&input.color)
    .bind(&input.example)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    for ext in &input.extensions {
        sqlx::query("INSERT OR IGNORE INTO type_extensions (type_id, extension) VALUES (?, ?)")
            .bind(id)
            .bind(ext.to_lowercase())
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    save_category_tag_rules(&pool, &input.name, &input.tag_rules).await?;

    Ok(ItemType {
        id,
        name: input.name,
        icon: input.icon,
        display_name: input.display_name,
        color: input.color,
        example: input.example,
        is_builtin: false,
        extensions: input.extensions.iter().map(|e| e.to_lowercase()).collect(),
        tag_rules: input.tag_rules,
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
        "UPDATE item_types SET name = ?, icon = ?, display_name = ?, color = ?, example = ? WHERE id = ?",
    )
    .bind(&input.name)
    .bind(&input.icon)
    .bind(&input.display_name)
    .bind(&input.color)
    .bind(&input.example)
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
        sqlx::query("INSERT OR IGNORE INTO type_extensions (type_id, extension) VALUES (?, ?)")
            .bind(id)
            .bind(ext.to_lowercase())
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    save_category_tag_rules(&pool, &input.name, &input.tag_rules).await?;

    Ok(ItemType {
        id,
        name: input.name,
        icon: input.icon,
        display_name: input.display_name,
        color: input.color,
        example: input.example,
        is_builtin: is_builtin_int != 0,
        extensions: input.extensions.iter().map(|e| e.to_lowercase()).collect(),
        tag_rules: input.tag_rules,
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
