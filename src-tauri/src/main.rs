// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod db;
mod commands;
mod scanner;
mod zip_utils;

use tauri::{Manager, Emitter};
use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("comic-cache", |_app_handle, request| {
            let app_data_dir = _app_handle.app_handle().path().app_data_dir().expect("failed to get app data dir");
            let cache_dir = app_data_dir.join("comic_cache");
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
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_data_dir = app_handle.path().app_data_dir().expect("failed to get app data dir");

            let pool = tauri::async_runtime::block_on(async {
                db::init_db(&app_data_dir).await.expect("failed to init db")
            });

            app.manage(pool);

            let menu = Menu::with_items(app, &[
                &Submenu::with_items(app, "標籤", true, &[
                    &MenuItem::with_id(app, "new-tag", "新增標籤", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                ])?,
            ])?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                match event.id().as_ref() {
                    "new-tag" => { let _ = app.emit("menu-new-tag", ()); }
                    _ => {}
                }
            });

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
            commands::preview_tag_scan,
            commands::apply_tag_scan,
            // Sources
            commands::get_sources,
            commands::add_source,
            commands::remove_source,
            // Folders (WorkspacePanel backward compat)
            commands::get_folders,
            commands::create_folder,
            commands::update_folder,
            commands::delete_folder,
            commands::trash_item,
            commands::untrack_item,
            commands::add_tag_to_folder,
            commands::remove_tag_from_folder,
            // Item types
            commands::get_item_types,
            commands::create_item_type,
            commands::update_item_type,
            commands::delete_item_type,
            // Duplicate detection
            commands::get_duplicate_groups,
            commands::compute_fingerprints,
            // File system
            commands::open_file,
            commands::list_subdirs,
            commands::list_dir_files,
            commands::get_image_base64_by_path,
            commands::get_zip_cover_by_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
