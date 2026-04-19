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
            // 在 Tauri v2 中，protocol 閉包會傳入 UriSchemeContext
            // 我們需要透過 .app_handle() 才能獲取 AppHandle
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

            // 建立選單
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
            // 原有指令
            commands::scan_directory,
            commands::get_comics,
            commands::get_comic,
            commands::get_tags,
            commands::rename_comic,
            commands::get_comic_images,
            commands::get_cover_base64,
            commands::create_tag,
            commands::delete_tag,
            commands::add_tag_to_comic,
            commands::remove_tag_from_comic,
            commands::set_comic_cover,
            // MISSION 2：Workspace 來源管理
            commands::get_sources,
            commands::add_source,
            commands::remove_source,
            commands::sync_sources,
            // MISSION 2：增量掃描
            commands::incremental_scan,
            // MISSION 3：開啟本地檔案
            commands::open_file,
            // MISSION 4：進階標籤管理
            commands::rename_tag,
            commands::merge_tags,
            commands::search_tags,
            // 目錄樹
            commands::list_subdirs,
            // 資料夾知識庫
            commands::get_folders,
            commands::create_folder,
            commands::update_folder,
            commands::delete_folder,
            commands::add_tag_to_folder,
            commands::remove_tag_from_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
