use crate::scanner;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager, State};

// ── Tag rules & scan wizard ───────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRuleTestHit {
    pub index: usize,
    pub match_type: String,
    pub pattern: String,
    pub tags: Vec<String>,
    pub error: Option<String>,
}

fn evaluate_rule_for_name(
    name: &str,
    rule: &crate::models::TagRuleInput,
) -> (Vec<String>, Option<String>) {
    if rule.pattern.is_empty() {
        return (Vec::new(), None);
    }

    if rule.match_type == "regex_capture" {
        let re = match regex::Regex::new(&rule.pattern) {
            Ok(re) => re,
            Err(e) => return (Vec::new(), Some(e.to_string())),
        };
        let Some(caps) = re.captures(name) else {
            return (Vec::new(), None);
        };
        let Some(m) = caps.get(1) else {
            return (Vec::new(), None);
        };
        let tags = m
            .as_str()
            .split(|c: char| ",()（）、".contains(c))
            .map(|part| part.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect();
        return (tags, None);
    }

    if rule.tag_name.is_empty() {
        return (Vec::new(), None);
    }

    let matched = match rule.match_type.as_str() {
        "prefix" => name.starts_with(&rule.pattern),
        "suffix" => name.ends_with(&rule.pattern),
        "contains" => name.contains(&rule.pattern),
        "regex" => match regex::Regex::new(&rule.pattern) {
            Ok(re) => re.is_match(name),
            Err(e) => return (Vec::new(), Some(e.to_string())),
        },
        _ => false,
    };

    if matched {
        (vec![rule.tag_name.clone()], None)
    } else {
        (Vec::new(), None)
    }
}

fn apply_rules_to_name(name: &str, rules: &[crate::models::TagRuleInput]) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for rule in rules {
        let (rule_tags, _) = evaluate_rule_for_name(name, rule);
        for tag in rule_tags {
            if !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }
    tags
}

#[tauri::command]
pub async fn test_tag_rules(
    name: String,
    rules: Vec<crate::models::TagRuleInput>,
) -> Result<Vec<TagRuleTestHit>, String> {
    let mut hits = Vec::new();
    let name = name.trim();
    if name.is_empty() {
        return Ok(hits);
    }

    for (index, rule) in rules.iter().enumerate() {
        let (tags, error) = evaluate_rule_for_name(name, rule);
        if error.is_some() || !tags.is_empty() {
            hits.push(TagRuleTestHit {
                index,
                match_type: rule.match_type.clone(),
                pattern: rule.pattern.clone(),
                tags,
                error,
            });
        }
    }
    Ok(hits)
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

/// 對單一 item 套用 tag rules：① 重跑檔名標籤擷取 ② 套用自定義類別規則。
/// 純資料層動作，不碰檔案系統同步。
async fn apply_rules_to_item_inner(
    pool: &SqlitePool,
    item_id: i64,
    name: &str,
    rules: &[crate::models::TagRuleInput],
) -> Result<i32, String> {
    let mut tagged = 0i32;

    if let Ok(c) = scanner::extract_and_apply_tags(pool, item_id, name).await {
        tagged += c as i32;
    }

    for tag_name in apply_rules_to_name(name, rules) {
        sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?)")
            .bind(&tag_name)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        let tag_id: i64 = sqlx::query("SELECT id FROM tags WHERE name = ?")
            .bind(&tag_name)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?
            .get("id");
        sqlx::query(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source) VALUES (?, ?, 'rule')",
        )
        .bind(item_id)
        .bind(tag_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        tagged += 1;
    }

    Ok(tagged)
}

/// 套用 tag rules。後端自己判斷 scope_path 是檔案還是目錄：
/// - 檔案：只對該 item 套規則（純資料層動作，不碰 FS 同步）
/// - 目錄：做 FS↔DB 增量同步（增/改/刪），然後對 scope 內所有 items 套規則
///
/// 此 command 是給「不知道 target 形態」的呼叫端用的安全入口（SourcePanel、
/// 右鍵選單等）；對於已經拿到 item.id 的場景，直接呼叫 `apply_rules_to_item`
/// 更有效率。
#[tauri::command]
pub async fn apply_tag_scan(
    scope_path: String,
    rules: Vec<crate::models::TagRuleInput>,
    pool: State<'_, SqlitePool>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    // 路徑指向單一檔案：避開「目錄同步」流程，直接對該 item 套規則。
    let scope = std::path::Path::new(&scope_path);
    if scope.is_file() {
        let row = sqlx::query("SELECT id, name FROM items WHERE path = ?")
            .bind(&scope_path)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        let tagged = if let Some(row) = row {
            let item_id: i64 = row.get("id");
            let name: String = row.get("name");
            apply_rules_to_item_inner(&pool, item_id, &name, &rules).await?
        } else {
            // 檔案存在於 FS 但尚未 import 到 DB；單一檔案場景不主動 import，
            // 維持「套規則」這個動作的語意純度（要 import 請走 quick_import_item）。
            0
        };
        return Ok(serde_json::json!({
            "added": 0, "updated": 0, "removed": 0, "tagged": tagged
        }));
    }

    let cache_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("thumb_cache");
    let (added, updated, removed, cancelled) =
        scanner::incremental_scan_directory(&pool, &scope_path, &cache_dir, &app, None)
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
        tagged += apply_rules_to_item_inner(&pool, item_id, &name, &rules).await?;
    }

    Ok(
        serde_json::json!({ "added": added, "updated": updated, "removed": removed, "tagged": tagged, "cancelled": cancelled }),
    )
}

/// 對單一 item 套用 tag rules（純資料層，不碰 FS 同步）。
/// 給「對單個檔案/已 import 的 item 重跑規則」使用。
#[tauri::command]
pub async fn apply_rules_to_item(
    item_id: i64,
    rules: Vec<crate::models::TagRuleInput>,
    pool: State<'_, SqlitePool>,
) -> Result<serde_json::Value, String> {
    let row = sqlx::query("SELECT name FROM items WHERE id = ?")
        .bind(item_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("項目 id={} 不存在", item_id))?;
    let name: String = row.get("name");

    let tagged = apply_rules_to_item_inner(&pool, item_id, &name, &rules).await?;

    Ok(serde_json::json!({
        "added": 0, "updated": 0, "removed": 0, "tagged": tagged
    }))
}
