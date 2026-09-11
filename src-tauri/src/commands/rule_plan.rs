use crate::{db, models::{ScanPreviewItem, TagRuleInput}};
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::{collections::HashMap, path::Path, time::UNIX_EPOCH};

pub(super) async fn build_plan(conn: &mut SqliteConnection, scope: &str, rules: &[TagRuleInput]) -> Result<Vec<ScanPreviewItem>, String> {
    super::rules::collect_item_rule_tags("", rules)?;
    let scope_path = Path::new(scope);
    if !scope_path.exists() { return Err("掃描目錄或檔案不存在".into()); }
    let key = db::path_key(scope);
    let rows = sqlx::query("SELECT id, path, name FROM items WHERE REPLACE(path, '\\', '/') = ? COLLATE NOCASE OR REPLACE(path, '\\', '/') LIKE ? ESCAPE '!'")
        .bind(&key).bind(format!("{}/%", db::escape_like(&key)))
        .fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    let existing: HashMap<_, _> = rows.iter().map(|row| (db::path_key(&row.get::<String, _>("path")), row)).collect();
    let extensions: Vec<String> = sqlx::query_scalar("SELECT DISTINCT extension FROM type_extensions")
        .fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for entry in walkdir::WalkDir::new(scope) {
        let entry = entry.map_err(|e| format!("無法完成預覽：{e}"))?;
        let path = entry.path().to_string_lossy().to_string();
        let stored = existing.get(&db::path_key(&path));
        if entry.path() == scope_path && entry.file_type().is_dir() && stored.is_none() { continue; }
        let is_dir = entry.file_type().is_dir();
        if stored.is_none() && !is_dir && !extensions.iter().any(|ext| entry.path().extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case(ext))) { continue; }
        let name = stored.map(|row| row.get::<String, _>("name")).unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
        let id = stored.map(|row| row.get::<i64, _>("id"));
        let mut current: Vec<(String, String)> = Vec::new();
        if let Some(id) = id {
            for row in sqlx::query("SELECT t.name, it.source FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id=? ORDER BY t.name")
                .bind(id).fetch_all(&mut *conn).await.map_err(|e| e.to_string())? {
                current.push((row.get("name"), row.get("source")));
            }
        }
        let mut desired = super::rules::collect_item_rule_tags(&name, rules)?;
        desired.sort(); desired.dedup();
        let added: Vec<_> = desired.iter().filter(|tag| !current.iter().any(|(name, _)| name == *tag)).cloned().collect();
        let removed: Vec<_> = current.iter().filter(|(name, source)| matches!(source.as_str(), "rule" | "filename") && !desired.contains(name)).map(|(name, _)| name.clone()).collect();
        if id.is_some() && added.is_empty() && removed.is_empty() { continue; }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let snapshot = serde_json::to_string(&serde_json::json!({
            "id": id, "name": name, "tags": current, "rules": rules,
            "size": meta.len(), "modified": meta.modified().ok().and_then(|x| x.duration_since(UNIX_EPOCH).ok()).map(|x| x.as_nanos().to_string()),
        })).map_err(|e| e.to_string())?;
        result.push(ScanPreviewItem { path, name, is_dir, proposed_tags: desired, added_tags: added, removed_tags: removed, is_new: id.is_none(), snapshot });
    }
    result.sort_by(|a,b| a.path.cmp(&b.path));
    Ok(result)
}

pub(super) async fn apply_plan(pool: &SqlitePool, scope: &str, rules: &[TagRuleInput], expected: &[ScanPreviewItem]) -> Result<serde_json::Value, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let plan = build_plan(&mut tx, scope, rules).await?;
    if plan != expected { return Err("預覽後資料或規則已變更，請重新預覽後再套用".into()); }
    let mut added = 0; let mut tagged = 0;
    for item in &plan {
        let existing_id: Option<i64> = sqlx::query_scalar("SELECT id FROM items WHERE REPLACE(path, '\\', '/')=? COLLATE NOCASE")
            .bind(db::path_key(&item.path)).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;
        let id = match existing_id {
            Some(id) => id,
            None => {
                let meta = std::fs::metadata(&item.path).map_err(|e| e.to_string())?;
                let mtime = meta.modified().ok().and_then(|x| x.duration_since(UNIX_EPOCH).ok()).map(|x| x.as_secs() as i64);
                let id = db::insert_item(&mut *tx, &item.path, if item.is_dir { "folder" } else { "file" }, &item.name,
                    if item.is_dir { None } else { Some(meta.len() as i64) }, mtime, &chrono::Local::now().to_rfc3339(), None).await.map_err(|e| e.to_string())?;
                added += 1; id
            }
        };
        for name in &item.removed_tags {
            sqlx::query("DELETE FROM item_tags WHERE item_id=? AND source IN ('rule','filename') AND tag_id IN (SELECT id FROM tags WHERE name=?)")
                .bind(id).bind(name).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
        for name in &item.added_tags {
            sqlx::query("INSERT OR IGNORE INTO tags(name) VALUES (?)").bind(name).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            sqlx::query("INSERT OR IGNORE INTO item_tags(item_id, tag_id, source) SELECT ?,id,'rule' FROM tags WHERE name=?")
                .bind(id).bind(name).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
        tagged += item.added_tags.len() + item.removed_tags.len();
    }
    sqlx::query("DELETE FROM tag_rules").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    for rule in rules {
        sqlx::query("INSERT INTO tag_rules(name,match_type,pattern,tag_name) VALUES (?,?,?,?)")
            .bind(&rule.name).bind(&rule.match_type).bind(&rule.pattern).bind(&rule.tag_name)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "added": added, "updated": plan.len() - added, "removed": 0, "tagged": tagged }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn new_imports_and_saved_rules_roll_back_together_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let pool = db::init_db(dir.path()).await.unwrap();
        let scope = dir.path().join("library");
        std::fs::create_dir(&scope).unwrap();
        std::fs::write(scope.join("[New] book.zip"), b"fixture").unwrap();
        sqlx::query("INSERT INTO tag_rules(name,match_type,pattern,tag_name) VALUES ('original','contains','x','keep')").execute(&pool).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        let plan = build_plan(&mut tx, &scope.to_string_lossy(), &[]).await.unwrap();
        tx.rollback().await.unwrap();
        assert_eq!(plan.len(), 1);
        assert!(plan[0].is_new);
        assert_eq!(plan[0].added_tags, vec!["New"]);
        sqlx::query("CREATE TRIGGER reject_rule_save BEFORE DELETE ON tag_rules BEGIN SELECT RAISE(ABORT,'fixture failure'); END").execute(&pool).await.unwrap();
        assert!(apply_plan(&pool, &scope.to_string_lossy(), &[], &plan).await.is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items").fetch_one(&pool).await.unwrap();
        assert_eq!(count, 0);
        let name: String = sqlx::query_scalar("SELECT name FROM tag_rules").fetch_one(&pool).await.unwrap();
        assert_eq!(name, "original");
        sqlx::query("DROP TRIGGER reject_rule_save").execute(&pool).await.unwrap();
        apply_plan(&pool, &scope.to_string_lossy(), &[], &plan).await.unwrap();
        let name: String = sqlx::query_scalar("SELECT name FROM items").fetch_one(&pool).await.unwrap();
        assert_eq!(name, plan[0].name);
        let tags: Vec<String> = sqlx::query_scalar("SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id=t.id").fetch_all(&pool).await.unwrap();
        assert_eq!(tags, plan[0].added_tags);
    }
    #[tokio::test]
    async fn previews_removals_and_rejects_stale_plans_atomically() {
        let dir = tempfile::tempdir().unwrap(); let pool = db::init_db(dir.path()).await.unwrap();
        let scope = dir.path().join("library"); std::fs::create_dir(&scope).unwrap();
        let file = scope.join("book.zip"); std::fs::write(&file, b"abc").unwrap();
        let id = db::insert_item(&pool, &file.to_string_lossy(), "file", "custom display", Some(3), Some(1), "now", None).await.unwrap();
        let old = db::create_tag(&pool, "old").await.unwrap();
        sqlx::query("INSERT INTO item_tags(item_id,tag_id,source) VALUES (?,?,'rule')").bind(id).bind(old.id).execute(&pool).await.unwrap();
        let mut tx = pool.begin().await.unwrap(); let plan = build_plan(&mut tx, &scope.to_string_lossy(), &[]).await.unwrap(); tx.rollback().await.unwrap();
        assert_eq!(plan.len(), 1); assert_eq!(plan[0].removed_tags, vec!["old"]); assert_eq!(plan[0].name, "custom display");
        std::fs::write(&file, b"changed").unwrap();
        assert!(apply_plan(&pool, &scope.to_string_lossy(), &[], &plan).await.is_err());
        let count:i64 = sqlx::query_scalar("SELECT COUNT(*) FROM item_tags").fetch_one(&pool).await.unwrap(); assert_eq!(count,1);
        let mut tx = pool.begin().await.unwrap(); let plan = build_plan(&mut tx, &scope.to_string_lossy(), &[]).await.unwrap(); tx.rollback().await.unwrap();
        apply_plan(&pool, &scope.to_string_lossy(), &[], &plan).await.unwrap();
        let count:i64 = sqlx::query_scalar("SELECT COUNT(*) FROM item_tags").fetch_one(&pool).await.unwrap(); assert_eq!(count,0);
    }
}
