use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, REFERER};
use regex::Regex;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const WNACG_BASE_URL: &str = "https://www.wnacg.com";
const HITOMI_BASE_URL: &str = "https://hitomi.la";
const HITOMI_CDN_BASE_URL: &str = "https://ltn.gold-usergeneratedcontent.net";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetadataProviderInfo {
    pub id: String,
    pub display_name: String,
    pub adult: bool,
    pub supports_search: bool,
    pub supports_lookup_by_url: bool,
    pub supports_lookup_by_id: bool,
    pub parser_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataLookupInput {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub existing_tags: Vec<String>,
    #[serde(default)]
    pub provider_ids: Vec<String>,
    pub query: Option<String>,
    #[serde(default)]
    pub allow_adult: bool,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetadataProviderMessage {
    pub provider_id: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetadataTagGroup {
    pub key: String,
    pub label: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetadataCandidate {
    pub provider_id: String,
    pub provider_name: String,
    pub provider_parser_version: String,
    pub id: String,
    pub title: String,
    pub source_url: String,
    pub thumbnail_url: Option<String>,
    pub image_count: Option<i64>,
    pub created_at: Option<String>,
    pub raw_tags: Vec<String>,
    pub tag_groups: Vec<MetadataTagGroup>,
    pub suggested_tags: Vec<String>,
    pub warnings: Vec<String>,
    pub confidence: f64,
    pub matched_by: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataLookupResponse {
    pub candidates: Vec<MetadataCandidate>,
    pub messages: Vec<MetadataProviderMessage>,
}

#[derive(Debug, Clone)]
struct WnacgSearchHit {
    id: String,
    title: String,
    source_url: String,
    thumbnail_url: Option<String>,
    image_count: Option<i64>,
    created_at: Option<String>,
}

#[tauri::command]
pub async fn get_metadata_providers() -> Result<Vec<MetadataProviderInfo>, String> {
    Ok(metadata_providers())
}

#[tauri::command]
pub async fn lookup_metadata(input: MetadataLookupInput) -> Result<MetadataLookupResponse, String> {
    let client = http_client()?;
    let provider_ids = selected_provider_ids(&input);
    let existing_tags = normalized_tag_set(&input.existing_tags);
    let mut candidates = Vec::new();
    let mut messages = Vec::new();

    for provider_id in provider_ids {
        let Some(provider) = metadata_providers()
            .into_iter()
            .find(|provider| provider.id == provider_id)
        else {
            messages.push(message(
                &provider_id,
                "warning",
                "Unknown metadata provider.",
            ));
            continue;
        };

        if provider.adult && !input.allow_adult {
            messages.push(message(
                &provider.id,
                "warning",
                "Adult metadata provider skipped until the lookup is explicitly allowed.",
            ));
            continue;
        }

        match provider.id.as_str() {
            "wnacg" => match lookup_wnacg(&client, &input, &provider).await {
                Ok(mut next) => {
                    if next.is_empty() {
                        messages.push(message(&provider.id, "info", "WNACG returned no matches."));
                    }
                    candidates.append(&mut next);
                }
                Err(error) => messages.push(message(&provider.id, wnacg_error_level(&error), &error)),
            },
            "hitomi" => match lookup_hitomi(&client, &input, &provider).await {
                Ok(mut next) => {
                    if next.is_empty() {
                        messages.push(message(
                            &provider.id,
                            "info",
                            "Hitomi lookup currently supports pasted gallery URLs or numeric IDs.",
                        ));
                    }
                    candidates.append(&mut next);
                }
                Err(error) => messages.push(message(&provider.id, "error", &error)),
            },
            _ => messages.push(message(
                &provider.id,
                "warning",
                "Provider is not implemented.",
            )),
        }
    }

    filter_existing_suggestions(&mut candidates, &existing_tags);

    Ok(MetadataLookupResponse {
        candidates,
        messages,
    })
}

fn metadata_providers() -> Vec<MetadataProviderInfo> {
    vec![
        MetadataProviderInfo {
            id: "wnacg".to_string(),
            display_name: "WNACG".to_string(),
            adult: true,
            supports_search: true,
            supports_lookup_by_url: true,
            supports_lookup_by_id: true,
            parser_version: "wnacg-2026-06-18.1".to_string(),
        },
        MetadataProviderInfo {
            id: "hitomi".to_string(),
            display_name: "Hitomi.la".to_string(),
            adult: true,
            supports_search: false,
            supports_lookup_by_url: true,
            supports_lookup_by_id: true,
            parser_version: "hitomi-2026-06-18.1".to_string(),
        },
    ]
}

fn selected_provider_ids(input: &MetadataLookupInput) -> Vec<String> {
    if input.provider_ids.is_empty() {
        return metadata_providers()
            .into_iter()
            .map(|provider| provider.id)
            .collect();
    }
    input.provider_ids.clone()
}

fn message(provider_id: &str, level: &str, text: &str) -> MetadataProviderMessage {
    MetadataProviderMessage {
        provider_id: provider_id.to_string(),
        level: level.to_string(),
        message: text.to_string(),
    }
}

fn wnacg_error_level(error: &str) -> &'static str {
    if error.contains("403 Forbidden") {
        "warning"
    } else {
        "error"
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    );
    headers.insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_static("zh-TW,zh;q=0.9,en;q=0.8,ja;q=0.7"),
    );

    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(4))
        .default_headers(headers)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) CustomTagPreview/metadata-lookup")
        .build()
        .map_err(|e| e.to_string())
}

async fn fetch_html(client: &reqwest::Client, url: &str) -> Result<String, String> {
    client
        .get(url)
        .header(REFERER, HeaderValue::from_static(WNACG_BASE_URL))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Request returned error status: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Response text failed: {e}"))
}

async fn lookup_wnacg(
    client: &reqwest::Client,
    input: &MetadataLookupInput,
    provider: &MetadataProviderInfo,
) -> Result<Vec<MetadataCandidate>, String> {
    let query = lookup_query(input);
    let limit = input.limit.unwrap_or(5).clamp(1, 10);

    if let Some(id) = extract_wnacg_aid(&query) {
        let hit = WnacgSearchHit {
            id: id.clone(),
            title: query.clone(),
            source_url: format!("{WNACG_BASE_URL}/photos-index-aid-{id}.html"),
            thumbnail_url: None,
            image_count: None,
            created_at: None,
        };
        return detail_wnacg_hit(client, hit, provider, "url")
            .await
            .map(|candidate| vec![candidate]);
    }

    let search_url = format!("{WNACG_BASE_URL}/search/");
    let request_url = reqwest::Url::parse_with_params(
        &search_url,
        &[
            ("q", query.as_str()),
            ("f", "_all"),
            ("s", "create_time_DESC"),
            ("syn", "yes"),
        ],
    )
    .map_err(|e| format!("WNACG search URL failed: {e}"))?;
    let response = client
        .get(request_url)
        .header(REFERER, HeaderValue::from_static(WNACG_BASE_URL))
        .send()
        .await
        .map_err(|e| format!("WNACG search request failed: {e}"))?;
    if response.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(
            "WNACG search was blocked with 403 Forbidden. Try pasting a WNACG album URL or aid, or search with a shorter title."
                .to_string(),
        );
    }
    let html = response
        .error_for_status()
        .map_err(|e| format!("WNACG search returned error status: {e}"))?
        .text()
        .await
        .map_err(|e| format!("WNACG search response failed: {e}"))?;

    let hits = parse_wnacg_search_hits(&html, limit);
    let mut candidates = Vec::new();
    for hit in hits {
        match detail_wnacg_hit(client, hit, provider, "title").await {
            Ok(candidate) => candidates.push(candidate),
            Err(error) => {
                candidates.push(MetadataCandidate {
                    provider_id: provider.id.clone(),
                    provider_name: provider.display_name.clone(),
                    provider_parser_version: provider.parser_version.clone(),
                    id: "wnacg-detail-error".to_string(),
                    title: format!("WNACG detail failed: {error}"),
                    source_url: search_url.clone(),
                    thumbnail_url: None,
                    image_count: None,
                    created_at: None,
                    raw_tags: Vec::new(),
                    tag_groups: Vec::new(),
                    suggested_tags: vec!["來源:WNACG".to_string()],
                    warnings: vec![error],
                    confidence: 0.2,
                    matched_by: "title".to_string(),
                });
            }
        }
    }
    Ok(candidates)
}

async fn detail_wnacg_hit(
    client: &reqwest::Client,
    hit: WnacgSearchHit,
    provider: &MetadataProviderInfo,
    matched_by: &str,
) -> Result<MetadataCandidate, String> {
    let html = fetch_html(client, &hit.source_url).await?;
    let document = Html::parse_document(&html);
    let title = page_title(&document)
        .and_then(|title| {
            title
                .split(" - 紳士漫畫")
                .next()
                .map(|s| s.trim().to_string())
        })
        .filter(|title| !title.is_empty())
        .unwrap_or(hit.title);
    let raw_tags = split_keywords(&meta_content(&document, "keywords").unwrap_or_default());
    let mut warnings = vec![
        "WNACG keywords mix author, category, and content tags; review before applying."
            .to_string(),
    ];
    if contains_sensitive_terms(&raw_tags) {
        warnings.push("Raw tags include sensitive terms; keep manual review enabled.".to_string());
    }

    Ok(MetadataCandidate {
        provider_id: provider.id.clone(),
        provider_name: provider.display_name.clone(),
        provider_parser_version: provider.parser_version.clone(),
        id: hit.id,
        title,
        source_url: hit.source_url,
        thumbnail_url: hit.thumbnail_url,
        image_count: hit.image_count,
        created_at: hit.created_at,
        raw_tags: raw_tags.clone(),
        tag_groups: vec![MetadataTagGroup {
            key: "raw".to_string(),
            label: "WNACG raw tags".to_string(),
            tags: raw_tags,
        }],
        suggested_tags: vec!["來源:WNACG".to_string()],
        warnings,
        confidence: if matched_by == "url" { 0.98 } else { 0.82 },
        matched_by: matched_by.to_string(),
    })
}

fn lookup_query(input: &MetadataLookupInput) -> String {
    let explicit = input.query.as_deref().unwrap_or("").trim();
    if !explicit.is_empty() {
        return explicit.to_string();
    }
    let name = input.name.trim();
    if !name.is_empty() {
        return strip_known_extension(name);
    }
    strip_known_extension(
        input
            .path
            .replace('\\', "/")
            .rsplit('/')
            .next()
            .unwrap_or(input.path.as_str()),
    )
}

fn strip_known_extension(name: &str) -> String {
    let archive_exts = [".zip", ".cbz", ".rar", ".cbr", ".7z"];
    let lower = name.to_lowercase();
    for ext in archive_exts {
        if lower.ends_with(ext) {
            return name[..name.len() - ext.len()].trim().to_string();
        }
    }
    name.trim().to_string()
}

fn parse_wnacg_search_hits(html: &str, limit: usize) -> Vec<WnacgSearchHit> {
    let document = Html::parse_document(html);
    let item_selector = Selector::parse("li.gallary_item").expect("valid WNACG item selector");
    let title_selector = Selector::parse(".title a").expect("valid WNACG title selector");
    let image_selector = Selector::parse(".pic_box img").expect("valid WNACG image selector");
    let info_selector = Selector::parse(".info_col").expect("valid WNACG info selector");

    document
        .select(&item_selector)
        .take(limit)
        .filter_map(|item| {
            let title_link = item.select(&title_selector).next()?;
            let href = title_link.value().attr("href")?;
            let id = extract_wnacg_aid(href)?;
            let title = title_link
                .value()
                .attr("title")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| title_link.text().collect::<String>().trim().to_string());
            let thumbnail_url = item
                .select(&image_selector)
                .next()
                .and_then(|image| image.value().attr("src"))
                .map(|url| normalize_site_url(WNACG_BASE_URL, url));
            let info_text = item
                .select(&info_selector)
                .next()
                .map(|info| info.text().collect::<String>())
                .unwrap_or_default();
            let (image_count, created_at) = parse_wnacg_info(&info_text);

            Some(WnacgSearchHit {
                id,
                title,
                source_url: normalize_site_url(WNACG_BASE_URL, href),
                thumbnail_url,
                image_count,
                created_at,
            })
        })
        .collect()
}

fn parse_wnacg_info(text: &str) -> (Option<i64>, Option<String>) {
    let image_count = Regex::new(r"(\d+)\s*張(?:圖片|照片)")
        .ok()
        .and_then(|re| re.captures(text))
        .and_then(|captures| captures.get(1))
        .and_then(|m| m.as_str().parse::<i64>().ok());
    let created_at = Regex::new(r"創建於\s*([0-9-]+)")
        .ok()
        .and_then(|re| re.captures(text))
        .and_then(|captures| captures.get(1))
        .map(|m| m.as_str().to_string());
    (image_count, created_at)
}

fn extract_wnacg_aid(text: &str) -> Option<String> {
    Regex::new(r"(?:aid-|aid=)(\d+)")
        .ok()?
        .captures(text)
        .and_then(|captures| captures.get(1))
        .map(|m| m.as_str().to_string())
}

fn normalize_site_url(base_url: &str, url: &str) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        return url.to_string();
    }
    if url.starts_with("//") {
        return format!("https:{url}");
    }
    if url.starts_with('/') {
        return format!("{base_url}{url}");
    }
    format!("{base_url}/{url}")
}

fn page_title(document: &Html) -> Option<String> {
    let selector = Selector::parse("title").ok()?;
    document
        .select(&selector)
        .next()
        .map(|title| title.text().collect::<String>().trim().to_string())
}

fn meta_content(document: &Html, name: &str) -> Option<String> {
    let selector = Selector::parse(&format!(r#"meta[name="{name}"]"#)).ok()?;
    document
        .select(&selector)
        .next()
        .and_then(|meta| meta.value().attr("content"))
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(str::to_string)
}

fn split_keywords(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for part in content.split(',') {
        let tag = part.trim();
        if !tag.is_empty() && !tags.iter().any(|existing| existing == tag) {
            tags.push(tag.to_string());
        }
    }
    tags
}

fn normalized_tag_set(tags: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for tag in tags {
        let tag = tag.trim().to_lowercase();
        if !tag.is_empty() && !normalized.iter().any(|existing| existing == &tag) {
            normalized.push(tag);
        }
    }
    normalized
}

fn filter_existing_suggestions(candidates: &mut [MetadataCandidate], existing_tags: &[String]) {
    if existing_tags.is_empty() {
        return;
    }
    for candidate in candidates {
        candidate.suggested_tags.retain(|tag| {
            !existing_tags
                .iter()
                .any(|existing| existing == &tag.to_lowercase())
        });
    }
}

fn contains_sensitive_terms(tags: &[String]) -> bool {
    let terms = [
        "蘿莉",
        "幼女",
        "loli",
        "未成年",
        "pedo",
        "小学生",
        "小學",
        "ぷに",
    ];
    tags.iter().any(|tag| {
        let lower = tag.to_lowercase();
        terms
            .iter()
            .any(|term| lower.contains(&term.to_lowercase()))
    })
}

async fn lookup_hitomi(
    client: &reqwest::Client,
    input: &MetadataLookupInput,
    provider: &MetadataProviderInfo,
) -> Result<Vec<MetadataCandidate>, String> {
    let query = lookup_query(input);
    let Some(id) = extract_hitomi_id(&query) else {
        return Ok(Vec::new());
    };

    let gallery_js_url = format!("{HITOMI_CDN_BASE_URL}/galleries/{id}.js");
    let js = client
        .get(&gallery_js_url)
        .send()
        .await
        .map_err(|e| format!("Hitomi gallery request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Hitomi gallery returned error status: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Hitomi gallery response failed: {e}"))?;
    let gallery = parse_hitomi_gallery_json(&js)?;
    Ok(vec![hitomi_candidate_from_value(provider, &id, &gallery)])
}

fn extract_hitomi_id(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.chars().all(|c| c.is_ascii_digit()) && trimmed.len() >= 4 {
        return Some(trimmed.to_string());
    }
    Regex::new(r"hitomi\.la/(?:reader/)?(?:galleries/)?[^?#\s]*?(\d+)(?:\.html)?(?:[#?].*)?$")
        .ok()?
        .captures(trimmed)
        .and_then(|captures| captures.get(1))
        .map(|m| m.as_str().to_string())
}

fn parse_hitomi_gallery_json(js: &str) -> Result<Value, String> {
    let re = Regex::new(r"(?s)galleryinfo\s*=\s*(\{.*\})\s*;?\s*$").map_err(|e| e.to_string())?;
    let json = re
        .captures(js)
        .and_then(|captures| captures.get(1))
        .map(|m| m.as_str())
        .ok_or_else(|| "Hitomi gallery metadata did not contain galleryinfo JSON.".to_string())?;
    serde_json::from_str::<Value>(json)
        .map_err(|e| format!("Hitomi gallery JSON parse failed: {e}"))
}

fn hitomi_candidate_from_value(
    provider: &MetadataProviderInfo,
    id: &str,
    gallery: &Value,
) -> MetadataCandidate {
    let title = gallery
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Untitled Hitomi gallery")
        .to_string();
    let artists = named_values(gallery, "artists", &["artist", "name"]);
    let groups = named_values(gallery, "groups", &["group", "name"]);
    let series = named_values(gallery, "series", &["series", "name"]);
    let characters = named_values(gallery, "characters", &["character", "name"]);
    let tags = named_values(gallery, "tags", &["tag", "name"]);
    let language = gallery
        .get("language")
        .and_then(Value::as_str)
        .map(|value| vec![value.to_string()])
        .unwrap_or_default();
    let image_count = gallery
        .get("files")
        .and_then(Value::as_array)
        .map(|files| files.len() as i64);

    let mut raw_tags = Vec::new();
    extend_unique(&mut raw_tags, &tags);
    extend_unique(&mut raw_tags, &artists);
    extend_unique(&mut raw_tags, &groups);
    extend_unique(&mut raw_tags, &series);
    extend_unique(&mut raw_tags, &characters);
    extend_unique(&mut raw_tags, &language);

    let mut tag_groups = Vec::new();
    push_group(&mut tag_groups, "artist", "Artists", artists.clone());
    push_group(&mut tag_groups, "group", "Groups", groups.clone());
    push_group(&mut tag_groups, "series", "Series", series.clone());
    push_group(
        &mut tag_groups,
        "character",
        "Characters",
        characters.clone(),
    );
    push_group(&mut tag_groups, "language", "Language", language.clone());
    push_group(&mut tag_groups, "tag", "Tags", tags.clone());

    let mut suggested_tags = vec!["來源:Hitomi".to_string()];
    suggested_tags.extend(artists.iter().map(|tag| format!("作者:{tag}")));
    suggested_tags.extend(groups.iter().map(|tag| format!("社團:{tag}")));
    suggested_tags.extend(series.iter().map(|tag| format!("系列:{tag}")));
    suggested_tags.extend(characters.iter().map(|tag| format!("角色:{tag}")));
    suggested_tags.extend(language.iter().map(|tag| format!("語言:{tag}")));

    MetadataCandidate {
        provider_id: provider.id.clone(),
        provider_name: provider.display_name.clone(),
        provider_parser_version: provider.parser_version.clone(),
        id: id.to_string(),
        title,
        source_url: format!("{HITOMI_BASE_URL}/galleries/{id}.html"),
        thumbnail_url: None,
        image_count,
        created_at: None,
        raw_tags,
        tag_groups,
        suggested_tags,
        warnings: vec![
            "Hitomi lookup uses gallery metadata by URL/ID; search index support is separate."
                .to_string(),
        ],
        confidence: 0.95,
        matched_by: "url".to_string(),
    }
}

fn named_values(gallery: &Value, key: &str, field_names: &[&str]) -> Vec<String> {
    let Some(values) = gallery.get(key).and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut output = Vec::new();
    for value in values {
        let next = if let Some(s) = value.as_str() {
            Some(s.to_string())
        } else {
            field_names
                .iter()
                .find_map(|field| value.get(*field).and_then(Value::as_str))
                .map(str::to_string)
        };
        if let Some(tag) = next {
            let tag = tag.trim();
            if !tag.is_empty() && !output.iter().any(|existing| existing == tag) {
                output.push(tag.to_string());
            }
        }
    }
    output
}

fn extend_unique(target: &mut Vec<String>, values: &[String]) {
    for value in values {
        if !target.iter().any(|existing| existing == value) {
            target.push(value.clone());
        }
    }
}

fn push_group(groups: &mut Vec<MetadataTagGroup>, key: &str, label: &str, tags: Vec<String>) {
    if tags.is_empty() {
        return;
    }
    groups.push(MetadataTagGroup {
        key: key.to_string(),
        label: label.to_string(),
        tags,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_keywords_trims_and_dedupes() {
        assert_eq!(
            split_keywords(" 鈴音れな, 巨乳, 巨乳, 同人誌 "),
            vec!["鈴音れな", "巨乳", "同人誌"]
        );
    }

    #[test]
    fn extracts_wnacg_album_id() {
        assert_eq!(
            extract_wnacg_aid("/photos-index-aid-365835.html"),
            Some("365835".to_string())
        );
    }

    #[test]
    fn strips_archive_extension_from_query() {
        assert_eq!(strip_known_extension("Book Name.cbz"), "Book Name");
    }

    #[test]
    fn parses_wnacg_list_info() {
        assert_eq!(
            parse_wnacg_info("22張圖片， 創建於2026-06-18"),
            (Some(22), Some("2026-06-18".to_string()))
        );
    }

    #[test]
    fn filters_existing_suggested_tags() {
        let mut candidates = vec![MetadataCandidate {
            provider_id: "test".to_string(),
            provider_name: "Test".to_string(),
            provider_parser_version: "test".to_string(),
            id: "1".to_string(),
            title: "Demo".to_string(),
            source_url: "https://example.com".to_string(),
            thumbnail_url: None,
            image_count: None,
            created_at: None,
            raw_tags: Vec::new(),
            tag_groups: Vec::new(),
            suggested_tags: vec!["Keep".to_string(), "Existing".to_string()],
            warnings: Vec::new(),
            confidence: 1.0,
            matched_by: "test".to_string(),
        }];
        filter_existing_suggestions(
            &mut candidates,
            &normalized_tag_set(&["existing".to_string()]),
        );
        assert_eq!(candidates[0].suggested_tags, vec!["Keep"]);
    }

    #[test]
    fn extracts_hitomi_gallery_id() {
        assert_eq!(
            extract_hitomi_id("https://hitomi.la/galleries/1234567.html"),
            Some("1234567".to_string())
        );
        assert_eq!(
            extract_hitomi_id("https://hitomi.la/doujinshi/sample-title-7654321.html#1"),
            Some("7654321".to_string())
        );
    }

    #[test]
    fn parses_hitomi_gallery_json_assignment() {
        let parsed = parse_hitomi_gallery_json(
            r#"var galleryinfo = {"title":"Demo","tags":[{"tag":"sample"}]};"#,
        )
        .expect("gallery json should parse");
        assert_eq!(parsed["title"], "Demo");
    }
}
