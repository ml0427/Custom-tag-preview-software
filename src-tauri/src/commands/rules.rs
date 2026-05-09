use crate::scanner;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager, State};

// ── Tag rules & scan wizard ───────────────────────────────────────────────────

fn apply_rules_to_name(name: &str, rules: &[crate::models::TagRuleInput]) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for rule in rules {
        if rule.pattern.is_empty() {
            continue;
        }

        // 正規擷取：把 (group1) 抓到的文字直接當標籤名（支援逗號分隔多個）
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

        if rule.tag_name.is_empty() {
            continue;
        }
        let matched = match rule.match_type.as_str() {
            "prefix" => name.starts_with(&rule.pattern),
            "suffix" => name.ends_with(&rule.pattern),
            "contains" => name.contains(&rule.pattern),
            "regex" => regex::Regex::new(&rule.pattern)
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
pub async fn get_tag_rules(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<crate::models::TagRule>, String> {
    let rows = sqlx::query(
        "SELECT id, name, match_type, pattern, COALESCE(tag_name,'') as tag_name FROM tag_rules ORDER BY id ASC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| crate::models::TagRule {
            id: r.get("id"),
            name: r.get("name"),
            match_type: r.get("match_type"),
            pattern: r.get("pattern"),
            tag_name: r.get("tag_name"),
        })
        .collect())
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
            "INSERT INTO tag_rules (name, match_type, pattern, tag_name) VALUES (?, ?, ?, ?)",
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
    for entry in WalkDir::new(&scope_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
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
    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    let (added, updated, removed) =
        scanner::incremental_scan_directory(&pool, &scope_path, &cache_dir, &app)
            .await
            .map_err(|e| e.to_string())?;

    let folder_prefix = if scope_path.ends_with('\\') || scope_path.ends_with('/') {
        scope_path.clone()
    } else {
        format!("{}\\", scope_path)
    };
    let folder_prefix_alt = if folder_prefix.contains('\\') {
        folder_prefix.replace('\\', "/")
    } else {
        folder_prefix.replace('/', "\\")
    };

    let items = sqlx::query(
        "SELECT id, name, item_type FROM items WHERE path = ? OR path LIKE ? OR path LIKE ?",
    )
    .bind(&scope_path)
    .bind(format!("{}%", folder_prefix))
    .bind(format!("{}%", folder_prefix_alt))
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut tagged = 0i32;
    for item in &items {
        let item_id: i64 = item.get("id");
        let name: String = item.get("name");

        // 1. 重新執行檔名標籤擷取 (例如 [Tag] 格式)
        if let Ok(c) = scanner::extract_and_apply_tags(&pool, item_id, &name).await {
            tagged += c as i32;
        }

        // 2. 套用自定義類別規則
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
                "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source) VALUES (?, ?, 'rule')",
            )
            .bind(item_id)
            .bind(tag_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            tagged += 1;
        }
    }

    Ok(
        serde_json::json!({ "added": added, "updated": updated, "removed": removed, "tagged": tagged }),
    )
}
