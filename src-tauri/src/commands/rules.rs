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

fn collect_item_rule_tags(name: &str, rules: &[crate::models::TagRuleInput]) -> Result<Vec<String>, String> {
    let mut tags = scanner::extract_filename_tags(name).map_err(|e| e.to_string())?;
    for rule in rules {
        let (rule_tags, error) = evaluate_rule_for_name(name, rule);
        if let Some(error) = error {
            return Err(format!("規則「{}」無效: {}", rule.name, error));
        }
        for tag in rule_tags {
            if !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }
    Ok(tags)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameTagChanges {
    added: Vec<String>,
    removed: Vec<String>,
}

// None 只預覽；false 只新增；true 只同步這次新舊名稱的差異（包含舊版 direct 標籤）。
async fn sync_renamed_item_tags_inner(
    pool: &SqlitePool,
    item_id: i64,
    previous_name: &str,
    expected_name: &str,
    rules: &[crate::models::TagRuleInput],
    apply_mode: Option<bool>,
) -> Result<RenameTagChanges, String> {
    let old_tags = collect_item_rule_tags(previous_name, rules)?;
    let new_tags = collect_item_rule_tags(expected_name, rules)?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let current_name: String = sqlx::query_scalar("SELECT name FROM items WHERE id = ?")
        .bind(item_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    if current_name != expected_name {
        return Err("名稱已再次變更，請重新檢查標籤".into());
    }
    let current_tags: Vec<String> = sqlx::query_scalar(
        "SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ?",
    ).bind(item_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
    let changes = RenameTagChanges {
        added: new_tags.iter().filter(|tag| !current_tags.contains(tag)).cloned().collect(),
        removed: old_tags.iter().filter(|tag| !new_tags.contains(tag) && current_tags.contains(tag)).cloned().collect(),
    };
    if let Some(remove_obsolete) = apply_mode {
        if remove_obsolete {
            for name in &changes.removed {
                sqlx::query("DELETE FROM item_tags WHERE item_id = ? AND tag_id IN (SELECT id FROM tags WHERE name = ?)")
                    .bind(item_id).bind(name).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            }
        }
        for name in &changes.added {
            sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?)")
                .bind(name).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            sqlx::query("INSERT OR IGNORE INTO item_tags (item_id, tag_id, source) SELECT ?, id, 'rule' FROM tags WHERE name = ?")
                .bind(item_id).bind(name).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(changes)
}

#[tauri::command]
pub async fn sync_renamed_item_tags(
    item_id: i64,
    previous_name: String,
    expected_name: String,
    rules: Vec<crate::models::TagRuleInput>,
    apply_mode: Option<bool>,
    pool: State<'_, SqlitePool>,
) -> Result<RenameTagChanges, String> {
    sync_renamed_item_tags_inner(&pool, item_id, &previous_name, &expected_name, &rules, apply_mode).await
}

/// 對單一 item 套用 tag rules：① 重跑檔名標籤擷取 ② 套用自定義類別規則。
/// 純資料層動作，不碰檔案系統同步。
async fn apply_rules_to_item_inner(
    pool: &SqlitePool,
    item_id: i64,
    name: &str,
    rules: &[crate::models::TagRuleInput],
) -> Result<i32, String> {
    // 先完成擷取與規則驗證，再原子替換，避免錯誤規則或寫入失敗清掉舊結果。
    let tags = collect_item_rule_tags(name, rules)?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    // 舊版的 direct 也可能來自檔名，但無法與手動標籤區分，保留以免誤刪。
    sqlx::query("DELETE FROM item_tags WHERE item_id = ? AND source IN ('rule', 'filename')")
        .bind(item_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for tag_name in &tags {
        sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?)")
            .bind(&tag_name)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        let tag_id: i64 = sqlx::query("SELECT id FROM tags WHERE name = ?")
            .bind(&tag_name)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .get("id");
        sqlx::query(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, source) VALUES (?, ?, 'rule')",
        )
        .bind(item_id)
        .bind(tag_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(tags.len() as i32)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, models::TagRuleInput};

    async fn fixture() -> (tempfile::TempDir, SqlitePool, i64) {
        let dir = tempfile::tempdir().unwrap();
        let pool = db::init_db(dir.path()).await.unwrap();
        let id = db::insert_item(
            &pool, "C:/Library/book.zip", "file", "book", None, None,
            "2026-09-11T00:00:00Z", None,
        ).await.unwrap();
        (dir, pool, id)
    }

    fn capture_rule() -> Vec<TagRuleInput> {
        vec![TagRuleInput {
            name: "author".into(), match_type: "regex_capture".into(),
            pattern: r"^\[(.*?)\]".into(), tag_name: String::new(),
        }]
    }

    async fn names(pool: &SqlitePool, id: i64) -> Vec<String> {
        sqlx::query_scalar(
            "SELECT t.name FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ? ORDER BY t.name",
        ).bind(id).fetch_all(pool).await.unwrap()
    }

    #[tokio::test]
    async fn reapply_replaces_imported_filename_tags_after_rename() {
        let (_dir, pool, id) = fixture().await;
        scanner::extract_and_apply_tags(&pool, id, "[デコ助18号] Book").await.unwrap();
        apply_rules_to_item_inner(&pool, id, "[デコ助18号] Book", &capture_rule()).await.unwrap();
        let count = apply_rules_to_item_inner(&pool, id, "[デコ助] Book", &capture_rule()).await.unwrap();
        assert_eq!(names(&pool, id).await, vec!["デコ助"]);
        assert_eq!(count, 1);
        apply_rules_to_item_inner(&pool, id, "[デコ助] Book", &capture_rule()).await.unwrap();
        assert_eq!(names(&pool, id).await, vec!["デコ助"]);
    }

    #[tokio::test]
    async fn reapply_removes_unmatched_rules_and_preserves_manual_tags_and_other_items() {
        let (_dir, pool, id) = fixture().await;
        let manual = db::create_tag(&pool, "Keep").await.unwrap();
        db::add_tag_to_item(&pool, id, manual.id).await.unwrap();
        let other = db::insert_item(&pool, "C:/Library/other.zip", "file", "other", None, None, "now", None).await.unwrap();
        let rules = vec![TagRuleInput {
            name: "rule".into(), match_type: "contains".into(),
            pattern: "Book".into(), tag_name: "Old rule".into(),
        }];
        apply_rules_to_item_inner(&pool, id, "[Keep] Book", &rules).await.unwrap();
        apply_rules_to_item_inner(&pool, other, "Book", &rules).await.unwrap();
        apply_rules_to_item_inner(&pool, id, "Renamed", &rules).await.unwrap();
        assert_eq!(names(&pool, id).await, vec!["Keep"]);
        assert_eq!(names(&pool, other).await, vec!["Old rule"]);
        apply_rules_to_item_inner(&pool, other, "Book", &[]).await.unwrap();
        assert!(names(&pool, other).await.is_empty());
    }

    #[tokio::test]
    async fn failed_reapply_rolls_back_tag_replacement() {
        let (_dir, pool, id) = fixture().await;
        apply_rules_to_item_inner(&pool, id, "[Old] Book", &capture_rule()).await.unwrap();
        sqlx::query("CREATE TRIGGER reject_new_tag BEFORE INSERT ON tags WHEN NEW.name = 'New' BEGIN SELECT RAISE(ABORT, 'test write failure'); END")
            .execute(&pool).await.unwrap();
        assert!(apply_rules_to_item_inner(&pool, id, "[New] Book", &capture_rule()).await.is_err());
        assert_eq!(names(&pool, id).await, vec!["Old"]);
    }

    #[tokio::test]
    async fn rename_preview_and_both_choices_handle_legacy_tags_without_touching_unrelated_tags() {
        let (_dir, pool, id) = fixture().await;
        for name in ["デコ助18号", "Keep"] {
            let tag = db::create_tag(&pool, name).await.unwrap();
            db::add_tag_to_item(&pool, id, tag.id).await.unwrap();
        }
        let old_name = "[デコ助18号] Book";
        let new_name = "[デコ助] Book";
        db::update_item_name(&pool, id, new_name).await.unwrap();
        let preview = sync_renamed_item_tags_inner(&pool, id, old_name, new_name, &capture_rule(), None).await.unwrap();
        assert_eq!(preview.added, vec!["デコ助"]);
        assert_eq!(preview.removed, vec!["デコ助18号"]);
        assert_eq!(names(&pool, id).await, vec!["Keep", "デコ助18号"]);

        sync_renamed_item_tags_inner(&pool, id, old_name, new_name, &capture_rule(), Some(false)).await.unwrap();
        assert_eq!(names(&pool, id).await, vec!["Keep", "デコ助", "デコ助18号"]);

        sync_renamed_item_tags_inner(&pool, id, old_name, new_name, &capture_rule(), Some(true)).await.unwrap();
        assert_eq!(names(&pool, id).await, vec!["Keep", "デコ助"]);
        let again = sync_renamed_item_tags_inner(&pool, id, old_name, new_name, &capture_rule(), None).await.unwrap();
        assert!(again.added.is_empty() && again.removed.is_empty());
    }

    #[tokio::test]
    async fn rename_sync_rejects_stale_name_and_rolls_back_write_failures() {
        let (_dir, pool, id) = fixture().await;
        scanner::extract_and_apply_tags(&pool, id, "[Old] Book").await.unwrap();
        assert!(sync_renamed_item_tags_inner(&pool, id, "[Old] Book", "[New] Book", &[], Some(true)).await.is_err());
        db::update_item_name(&pool, id, "[New] Book").await.unwrap();
        sqlx::query("CREATE TRIGGER reject_rename_tag BEFORE INSERT ON tags WHEN NEW.name = 'New' BEGIN SELECT RAISE(ABORT, 'test failure'); END")
            .execute(&pool).await.unwrap();
        assert!(sync_renamed_item_tags_inner(&pool, id, "[Old] Book", "[New] Book", &[], Some(true)).await.is_err());
        assert_eq!(names(&pool, id).await, vec!["Old"]);
    }

    #[tokio::test]
    async fn invalid_rules_do_not_clear_existing_tags() {
        let (_dir, pool, id) = fixture().await;
        apply_rules_to_item_inner(&pool, id, "[Old] Book", &[]).await.unwrap();
        let rules = vec![TagRuleInput { name: "broken".into(), match_type: "regex_capture".into(), pattern: "[".into(), tag_name: String::new() }];
        assert!(apply_rules_to_item_inner(&pool, id, "Book", &rules).await.is_err());
        assert_eq!(names(&pool, id).await, vec!["Old"]);
    }
}
