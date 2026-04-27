use serde::{Deserialize, Serialize};

// Unified Item — replaces Comic + Folder
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: i64,
    pub path: String,
    pub item_type: String,           // 'file' | 'folder'
    pub name: String,
    pub file_size: Option<i64>,
    pub file_modified_at: Option<i64>,   // Unix timestamp (seconds)
    pub cover_cache_path: Option<String>,
    pub fingerprint: Option<String>,
    pub note: Option<String>,
    pub category: Option<String>,
    pub import_at: String,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: i64,
    pub path: String,
    pub last_sync: Option<String>,
}

// Legacy Folder struct (used by WorkspacePanel for backward compat)
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub category: String,
    pub note: String,
    pub created_at: String,
    #[sqlx(skip)]
    pub tags: Vec<Tag>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub file_size: Option<u64>,
    pub modified_time: Option<String>,
    pub extension: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub content: Vec<T>,
    pub total_pages: i64,
    pub total_elements: i64,
    pub number: i64,
    pub size: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagRule {
    pub id: i64,
    pub name: String,
    pub match_type: String,  // 'prefix' | 'suffix' | 'contains' | 'regex'
    pub pattern: String,
    pub tag_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagRuleInput {
    pub name: String,
    pub match_type: String,
    pub pattern: String,
    pub tag_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemType {
    pub id: i64,
    pub name: String,
    pub icon: String,
    pub display_name: String,
    pub color: Option<String>,
    pub is_builtin: bool,
    pub extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemTypeInput {
    pub name: String,
    pub icon: String,
    pub display_name: String,
    pub color: Option<String>,
    pub extensions: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanPreviewItem {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub proposed_tags: Vec<String>,
}
