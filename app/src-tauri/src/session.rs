use serde::{Deserialize, Serialize};

/// Lightweight metadata for a session (used in the sidebar list)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub model: Option<ModelInfo>,
    pub message_count: usize,
    pub created_at: u64,
    pub updated_at: u64,
}

/// Full saved session including messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedSession {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub model: Option<ModelInfo>,
    pub messages: Vec<serde_json::Value>,
    pub created_at: u64,
    pub updated_at: u64,
}

/// Model info persisted with sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub provider: String,
    pub id: String,
    pub name: String,
}

// ── File Browser Types ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

// ── Settings Types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomToolConfig {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameters: serde_json::Value,
    #[serde(default = "default_handler")]
    pub handler: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub command: Option<String>,
}

fn default_handler() -> String {
    "fetch".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
    #[serde(default)]
    pub default_provider: String,
    pub shell_path: Option<String>,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default)]
    pub custom_tools: Vec<CustomToolConfig>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub setup_completed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            providers: Vec::new(),
            default_provider: String::new(),
            shell_path: None,
            font_size: default_font_size(),
            custom_tools: Vec::new(),
            system_prompt: None,
            setup_completed: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub name: String,
    pub api_url: String,
    pub api_key: String,
    pub models: Vec<String>,
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_font_size() -> u32 {
    14
}
