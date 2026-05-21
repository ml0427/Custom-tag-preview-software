// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod debug_log;
mod models;
mod scanner;
mod zip_utils;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(Target::new(TargetKind::Stdout))
                .level(log::LevelFilter::Info)
                .level_for("sqlx", log::LevelFilter::Warn)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("comic-cache", |_app_handle, request| {
            let app_data_dir = _app_handle
                .app_handle()
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            let cache_dir = app_data_dir.join("thumb_cache");
            let path = request.uri().path().trim_start_matches('/');
            let file_path = cache_dir.join(path);

            let content_type = if file_path.extension().map_or(false, |e| e == "png") {
                "image/png"
            } else if file_path.extension().map_or(false, |e| e == "webp") {
                "image/webp"
            } else {
                "image/jpeg"
            };

            if let Ok(data) = std::fs::read(&file_path) {
                tauri::http::Response::builder()
                    .header("Content-Type", content_type)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(data)
                    .expect("failed to build HTTP response")
            } else {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .expect("failed to build HTTP 404 response")
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");

            let pool = tauri::async_runtime::block_on(async {
                db::init_db(&app_data_dir).await.expect("failed to init db")
            });

            app.manage(pool);
            app.manage(scanner::ScanCancelState::default());

            let log_path = app_data_dir.join("debug.log");
            let settings_path = app_data_dir.join("debug_settings.json");
            let initial_enabled = debug_log::load_initial_enabled(&settings_path);
            app.manage(debug_log::DebugState::new(
                log_path,
                settings_path,
                initial_enabled,
            ));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Items (new primary API)
            commands::get_items,
            commands::get_item,
            commands::get_item_by_path,
            commands::tag_item,
            commands::untag_item,
            commands::rename_item,
            commands::get_item_images,
            commands::set_item_cover,
            commands::get_cover_base64,
            // Scan
            commands::scan_directory,
            commands::incremental_scan,
            commands::sync_sources,
            commands::cancel_scan,
            // Tags
            commands::get_tags,
            commands::get_tag_counts,
            commands::create_tag,
            commands::delete_tag,
            commands::rename_tag,
            commands::set_tag_color,
            commands::merge_tags,
            commands::search_tags,
            // Tag rules & scan wizard
            commands::get_tag_rules,
            commands::save_tag_rules,
            commands::test_tag_rules,
            commands::preview_tag_scan,
            commands::apply_tag_scan,
            commands::apply_rules_to_item,
            // Sources
            commands::get_sources,
            commands::add_source,
            commands::remove_source,
            // Item-level mutations
            commands::set_item_category,
            commands::set_item_display_name,
            commands::set_item_note,
            commands::trash_item,
            commands::untrack_item,
            // Item types
            commands::get_item_types,
            commands::create_item_type,
            commands::update_item_type,
            commands::delete_item_type,
            // Duplicate detection
            commands::get_duplicate_groups,
            commands::compute_fingerprints,
            // File system
            commands::quick_import_item,
            commands::open_file,
            commands::list_subdirs,
            commands::list_dir_files,
            commands::get_image_base64_by_path,
            commands::get_zip_cover_by_path,
            commands::ensure_thumb_cache,
            // Debug mode
            commands::get_debug_mode,
            commands::set_debug_mode,
            commands::get_debug_log_path,
            commands::open_debug_log,
            commands::clear_debug_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
