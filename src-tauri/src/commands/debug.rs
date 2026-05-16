use crate::debug_log::DebugState;
use std::fs::OpenOptions;
use std::process::Command;
use tauri::State;

#[tauri::command]
pub fn get_debug_mode(debug_state: State<'_, DebugState>) -> bool {
    debug_state.is_enabled()
}

#[tauri::command]
pub fn set_debug_mode(enabled: bool, debug_state: State<'_, DebugState>) {
    debug_state.set_enabled(enabled);
}

#[tauri::command]
pub fn get_debug_log_path(debug_state: State<'_, DebugState>) -> String {
    debug_state.log_path().to_string_lossy().to_string()
}

#[tauri::command]
pub fn open_debug_log(debug_state: State<'_, DebugState>) -> Result<(), String> {
    let path = debug_state.log_path();
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("無法建立或開啟 debug.log: {}", e))?;

    // Windows: 用預設關聯程式開啟（通常是記事本或使用者設定的編輯器）
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", path.to_string_lossy().as_ref()])
            .spawn()
            .map_err(|e| format!("開啟檔案失敗: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("開啟檔案失敗: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("開啟檔案失敗: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_debug_log(debug_state: State<'_, DebugState>) -> Result<(), String> {
    let path = debug_state.log_path();
    // 用 truncate 把檔案清空但保留檔案本身
    OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|e| format!("無法清空 debug.log: {}", e))?;
    Ok(())
}
