use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// Global application state managed by Tauri
#[derive(Default)]
pub struct AppState {
    pub session: Mutex<Option<SessionInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub cwd: String,
    pub session_id: String,
    pub current_model: Option<String>,
    pub streaming: bool,
    pub message_count: usize,
}
