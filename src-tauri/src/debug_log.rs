use chrono::Local;
use serde_json::{json, Value};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct DebugState {
    enabled: AtomicBool,
    log_path: PathBuf,
    settings_path: PathBuf,
}

impl DebugState {
    pub fn new(log_path: PathBuf, settings_path: PathBuf, initial_enabled: bool) -> Self {
        Self {
            enabled: AtomicBool::new(initial_enabled),
            log_path,
            settings_path,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        self.persist();
    }

    pub fn log_path(&self) -> &Path {
        &self.log_path
    }

    pub fn log_info(&self, operation: &str, payload: Value) {
        self.write_entry("info", operation, payload);
    }

    pub fn log_warn(&self, operation: &str, payload: Value) {
        self.write_entry("warn", operation, payload);
    }

    pub fn log_error(&self, operation: &str, payload: Value) {
        self.write_entry("error", operation, payload);
    }

    fn write_entry(&self, level: &str, operation: &str, payload: Value) {
        if !self.is_enabled() {
            return;
        }
        let entry = json!({
            "timestamp": Local::now().to_rfc3339(),
            "level": level,
            "operation": operation,
            "payload": payload,
        });
        let line = match serde_json::to_string(&entry) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("debug_log: serialize failed: {}", e);
                return;
            }
        };
        let result = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
            .and_then(|mut f| writeln!(f, "{}", line));
        if let Err(e) = result {
            log::warn!("debug_log: write to {:?} failed: {}", self.log_path, e);
        }
    }

    fn persist(&self) {
        let body = json!({ "debug_mode": self.is_enabled() });
        let result = serde_json::to_string_pretty(&body)
            .map_err(std::io::Error::other)
            .and_then(|s| std::fs::write(&self.settings_path, s));
        if let Err(e) = result {
            log::warn!("debug_log: persist settings to {:?} failed: {}", self.settings_path, e);
        }
    }
}

pub fn load_initial_enabled(settings_path: &Path) -> bool {
    let raw = match std::fs::read_to_string(settings_path) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("debug_log: settings parse failed: {}", e);
            return false;
        }
    };
    parsed.get("debug_mode").and_then(|v| v.as_bool()).unwrap_or(false)
}
