use crate::bridge::BridgeProcess;
use crate::session::{
    AppSettings, FileEntry, ModelInfo, ProviderConfig, SavedSession, SessionMeta,
};
use serde::Serialize;
use std::sync::Arc;
use tauri::Manager;

type BridgeRef = Arc<BridgeProcess>;

/// Helper to get the bridge process from managed state
async fn get_bridge(app: tauri::AppHandle) -> Result<BridgeRef, String> {
    app.try_state::<BridgeRef>()
        .map(|b| b.inner().clone())
        .ok_or_else(|| "Bridge not initialized".to_string())
}

/// Validate session ID to prevent path traversal attacks
fn validate_session_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 {
        return Err("Invalid session ID".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Session ID contains invalid characters".to_string());
    }
    Ok(())
}

/// Validate a file path to prevent traversal attacks
fn validate_path(path: &str) -> Result<(), String> {
    if path.contains("..") {
        return Err("Path must not contain '..'".to_string());
    }
    if !path.starts_with('/') && !path.starts_with('\\') && !path.contains(':') {
        return Err("Path must be absolute".to_string());
    }
    Ok(())
}

// ── Session Persistence Commands ───────────────────────────────────

/// Get the sessions directory, creating it if needed
fn sessions_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot get app data dir: {e}"))?;
    let sessions = dir.join("sessions");
    std::fs::create_dir_all(&sessions).map_err(|e| format!("Cannot create sessions dir: {e}"))?;
    Ok(sessions)
}

/// List all saved sessions (metadata only, no messages)
#[tauri::command]
pub async fn list_sessions(app: tauri::AppHandle) -> Result<Vec<SessionMeta>, String> {
    let dir = sessions_dir(&app)?;
    let mut metas = Vec::new();

    let entries = std::fs::read_dir(&dir).map_err(|e| format!("Cannot read sessions dir: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let session: SavedSession = match serde_json::from_str(&content) {
            Ok(s) => s,
            Err(_) => continue,
        };
        metas.push(SessionMeta {
            id: session.id,
            name: session.name,
            cwd: session.cwd,
            model: session.model,
            message_count: session.messages.len(),
            created_at: session.created_at,
            updated_at: session.updated_at,
        });
    }

    // Sort by most recently updated first
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(metas)
}

/// Load a full saved session (including messages)
#[tauri::command]
pub async fn load_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<SavedSession, String> {
    validate_session_id(&session_id)?;
    let dir = sessions_dir(&app)?;
    let path = dir.join(format!("{session_id}.json"));
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Cannot read session: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Cannot parse session: {e}"))
}

/// Save a session to disk
#[tauri::command]
pub async fn save_session(app: tauri::AppHandle, session: SavedSession) -> Result<(), String> {
    validate_session_id(&session.id)?;
    let dir = sessions_dir(&app)?;
    let path = dir.join(format!("{}.json", session.id));
    let content = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Cannot serialize session: {e}"))?;
    std::fs::write(&path, content).map_err(|e| format!("Cannot write session file: {e}"))?;
    Ok(())
}

/// Delete a session from disk
#[tauri::command]
pub async fn delete_session(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    validate_session_id(&session_id)?;
    let dir = sessions_dir(&app)?;
    let path = dir.join(format!("{session_id}.json"));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Cannot delete session: {e}"))?;
    }
    Ok(())
}

/// Rename a session
#[tauri::command]
pub async fn rename_session(
    app: tauri::AppHandle,
    session_id: String,
    name: String,
) -> Result<(), String> {
    validate_session_id(&session_id)?;
    let dir = sessions_dir(&app)?;
    let path = dir.join(format!("{session_id}.json"));
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Cannot read session: {e}"))?;
    let mut session: SavedSession =
        serde_json::from_str(&content).map_err(|e| format!("Cannot parse session: {e}"))?;
    session.name = name;
    session.updated_at = now_millis();
    let new_content = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Cannot serialize session: {e}"))?;
    std::fs::write(&path, new_content).map_err(|e| format!("Cannot write session: {e}"))?;
    Ok(())
}

/// Get the most recently used session ID (for auto-restore on startup)
#[tauri::command]
pub async fn get_last_session_id(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let sessions = list_sessions(app).await?;
    Ok(sessions.first().map(|s| s.id.clone()))
}

// ── Bridge Commands ────────────────────────────────────────────────

/// Check if the bridge sidecar is running and ready
#[tauri::command]
pub async fn is_bridge_ready(app: tauri::AppHandle) -> Result<bool, String> {
    let bridge = get_bridge(app).await?;
    Ok(bridge.is_ready())
}

/// Combined bridge status (ready + any error)
#[derive(Serialize)]
pub struct BridgeStatus {
    pub ready: bool,
    pub error: Option<String>,
}

/// Check bridge status (ready + any error)
#[tauri::command]
pub async fn bridge_status(app: tauri::AppHandle) -> Result<BridgeStatus, String> {
    let bridge = get_bridge(app).await?;
    Ok(BridgeStatus {
        ready: bridge.is_ready(),
        error: bridge.get_error().await,
    })
}

/// Send a prompt to the agent
#[tauri::command]
pub async fn send_prompt(
    app: tauri::AppHandle,
    message: String,
    images: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let mut cmd = serde_json::json!({
        "type": "prompt",
        "id": uuid(),
        "message": message,
    });
    if let Some(imgs) = images {
        cmd["images"] = serde_json::Value::Array(imgs);
    }
    bridge.send_command(&cmd).await
}

/// Abort current agent operation
#[tauri::command]
pub async fn abort_agent(app: tauri::AppHandle) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "abort",
        "id": uuid(),
    });
    bridge.send_command(&cmd).await
}

/// Switch the model
#[tauri::command]
pub async fn set_model(
    app: tauri::AppHandle,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "set_model",
        "id": uuid(),
        "provider": provider,
        "modelId": model_id,
    });
    bridge.send_command(&cmd).await
}

/// Get available models
#[tauri::command]
pub async fn get_models(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "get_models",
        "id": uuid(),
    });
    bridge.send_command(&cmd).await?;
    // Response comes async via events — return empty for now
    Ok(serde_json::json!({ "models": [] }))
}

/// Get current session state
#[tauri::command]
pub async fn get_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "get_state",
        "id": uuid(),
    });
    bridge.send_command(&cmd).await?;
    Ok(serde_json::json!({
        "streaming": false,
        "sessionId": "",
        "messageCount": 0,
    }))
}

/// Get message history
#[tauri::command]
pub async fn get_messages(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "get_messages",
        "id": uuid(),
    });
    bridge.send_command(&cmd).await?;
    Ok(serde_json::json!({ "messages": [] }))
}

/// Create a new session
#[tauri::command]
pub async fn new_session(app: tauri::AppHandle) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "new_session",
        "id": uuid(),
    });
    bridge.send_command(&cmd).await
}

/// Initialize a session with a working directory and optional session ID for resume
#[tauri::command]
pub async fn init_session(
    app: tauri::AppHandle,
    cwd: String,
    session_id: Option<String>,
) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let mut cmd = serde_json::json!({
        "type": "init",
        "id": uuid(),
        "cwd": cwd,
    });
    if let Some(sid) = session_id {
        cmd["sessionId"] = serde_json::Value::String(sid);
    }
    bridge.send_command(&cmd).await
}

/// Open a folder picker dialog
#[tauri::command]
pub async fn pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

/// Steer the agent during streaming
#[tauri::command]
pub async fn steer(app: tauri::AppHandle, message: String) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "steer",
        "id": uuid(),
        "message": message,
    });
    bridge.send_command(&cmd).await
}

/// Update bridge config (system prompt, custom tools, default model)
#[tauri::command]
pub async fn update_bridge_config(
    app: tauri::AppHandle,
    config: serde_json::Value,
) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "set_config",
        "id": uuid(),
        "config": config,
    });
    bridge.send_command(&cmd).await
}

/// Queue a follow-up message
#[tauri::command]
pub async fn follow_up(app: tauri::AppHandle, message: String) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let cmd = serde_json::json!({
        "type": "follow_up",
        "id": uuid(),
        "message": message,
    });
    bridge.send_command(&cmd).await
}

/// Compact the session
#[tauri::command]
pub async fn compact(
    app: tauri::AppHandle,
    custom_instructions: Option<String>,
) -> Result<(), String> {
    let bridge = get_bridge(app).await?;
    let mut cmd = serde_json::json!({
        "type": "compact",
        "id": uuid(),
    });
    if let Some(instructions) = custom_instructions {
        cmd["customInstructions"] = serde_json::Value::String(instructions);
    }
    bridge.send_command(&cmd).await
}

// ── File Browser Commands ─────────────────────────────────────────

/// Directories to skip when listing files
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    ".next",
    "__pycache__",
    ".cache",
    ".turbo",
    "build",
    ".venv",
    "venv",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".DS_Store",
    ".idea",
    ".vscode",
];

/// List files in a directory (one level deep)
#[tauri::command]
pub async fn list_files(dir: String, _depth: Option<usize>) -> Result<Vec<FileEntry>, String> {
    validate_path(&dir)?;
    let path = std::path::Path::new(&dir);
    if !path.is_dir() {
        return Err(format!("Not a directory: {dir}"));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| format!("Cannot read dir: {e}"))?;

    for entry in read_dir.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/dirs (starting with .) except special ones
        if file_name.starts_with('.') && file_name != ".env" && file_name != ".env.local" {
            continue;
        }

        let file_path = entry.path();
        let is_dir = file_path.is_dir();

        // Skip known heavy/irrelevant directories
        if is_dir && SKIP_DIRS.contains(&file_name.as_str()) {
            continue;
        }

        entries.push(FileEntry {
            name: file_name,
            path: file_path.to_string_lossy().to_string(),
            is_dir,
            children: None, // Lazy loaded on expand
        });
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

// ── Settings Commands ──────────────────────────────────────────────

/// Get the settings file path
fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot get app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create app data dir: {e}"))?;
    Ok(dir.join("settings.json"))
}

/// Load app settings from disk
#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Cannot read settings: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Cannot parse settings: {e}"))
}

/// Save app settings to disk
#[tauri::command]
pub async fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Cannot serialize settings: {e}"))?;
    std::fs::write(&path, content).map_err(|e| format!("Cannot write settings: {e}"))?;
    Ok(())
}

/// Test API connection result
#[derive(serde::Serialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub status: Option<u16>,
    pub message: String,
}

/// Test API connection by making a simple request
#[tauri::command]
pub async fn test_api_connection(api_url: String, api_key: String) -> Result<ConnectionTestResult, String> {
    // Reject non-HTTPS URLs to prevent key leakage
    if !api_url.starts_with("https://") {
        return Err("API URL must use https://".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&api_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("x-api-key", &api_key) // Anthropic uses this header
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;

    match response {
        Ok(resp) => {
            let status = resp.status().as_u16();
            Ok(ConnectionTestResult {
                success: true,
                status: Some(status),
                message: format!("HTTP {} — server reachable", status),
            })
        }
        Err(e) => Ok(ConnectionTestResult {
            success: false,
            status: None,
            message: format!("Cannot reach {}: {}", api_url, e),
        }),
    }
}

// ── Helpers ────────────────────────────────────────────────────────

/// Generate a unique ID with counter to avoid collisions within same millisecond
fn uuid() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let c = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{now:x}-{c:x}")
}

/// Current timestamp in milliseconds
fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
