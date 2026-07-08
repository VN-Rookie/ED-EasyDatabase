use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::error::AppError;

fn settings_path() -> Result<PathBuf, AppError> {
    let dir = dirs::config_dir()
        .ok_or_else(|| AppError::new("Cannot determine config directory"))?
        .join("easydatabase");
    fs::create_dir_all(&dir).map_err(|e| AppError::new(e.to_string()))?;
    Ok(dir.join("settings.json"))
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Settings {
    // ── Claude API ────────────────────────────────────────────
    #[serde(default)]
    pub claude_api_key: String,
    /// "claude-api" | "openai" | "ollama"
    #[serde(default = "default_backend")]
    pub ai_backend: String,

    // ── OpenAI-compatible (OpenAI, DeepSeek, LM Studio, etc.) ─
    #[serde(default)]
    pub openai_api_key: String,
    /// Base URL (without trailing slash). Defaults to OpenAI.
    #[serde(default = "default_openai_base_url")]
    pub openai_base_url: String,
    #[serde(default = "default_openai_model")]
    pub openai_model: String,

    // ── Ollama ────────────────────────────────────────────────
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,

    // ── MCP ───────────────────────────────────────────────────
    #[serde(default = "default_mcp_port")]
    pub mcp_port: u16,
    #[serde(default = "default_mcp_read_only")]
    pub mcp_read_only: bool,

    // ── UI ────────────────────────────────────────────────────
    /// Zoom scale applied to entire app (0.85 / 1.0 / 1.15 / 1.3)
    #[serde(default = "default_ui_scale")]
    pub ui_scale: f32,
    #[serde(default = "default_system_font_size")]
    pub system_font_size: f32,
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: f32,
    #[serde(default = "default_system_font_family")]
    pub system_font_family: String,
    #[serde(default = "default_editor_font_family")]
    pub editor_font_family: String,
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_backend() -> String { "openai".into() }
fn default_openai_base_url() -> String { "https://api.openai.com/v1".into() }
fn default_openai_model() -> String { "gpt-4o".into() }
fn default_ollama_model() -> String { "llama3.1".into() }
fn default_ollama_url() -> String { "http://localhost:11434".into() }
fn default_mcp_port() -> u16 { 3456 }
fn default_mcp_read_only() -> bool { true }
fn default_ui_scale() -> f32 { 1.3 }
fn default_system_font_size() -> f32 { 12.0 }
fn default_editor_font_size() -> f32 { 14.0 }
fn default_system_font_family() -> String { "".into() }
fn default_editor_font_family() -> String { "".into() }
fn default_language() -> String { "en".into() }

impl Default for Settings {
    fn default() -> Self {
        Self {
            claude_api_key: String::new(),
            ai_backend: default_backend(),
            openai_api_key: String::new(),
            openai_base_url: default_openai_base_url(),
            openai_model: default_openai_model(),
            ollama_model: default_ollama_model(),
            ollama_url: default_ollama_url(),
            mcp_port: default_mcp_port(),
            mcp_read_only: default_mcp_read_only(),
            ui_scale: default_ui_scale(),
            system_font_size: default_system_font_size(),
            editor_font_size: default_editor_font_size(),
            system_font_family: default_system_font_family(),
            editor_font_family: default_editor_font_family(),
            language: default_language(),
        }
    }
}

#[tauri::command]
pub async fn load_settings() -> Result<Settings, AppError> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
    // Unknown fields ignored; missing fields use defaults
    serde_json::from_str(&raw).map_err(|e| AppError::new(e.to_string()))
}

#[tauri::command]
pub async fn save_settings(settings: Settings) -> Result<Settings, AppError> {
    let path = settings_path()?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| AppError::new(e.to_string()))?;
    fs::write(&path, json).map_err(|e| AppError::new(e.to_string()))?;
    Ok(settings)
}

/// Write text content to a path chosen by the user via the native save dialog.
#[tauri::command]
pub async fn save_to_file(path: String, content: String) -> Result<(), AppError> {
    fs::write(&path, content).map_err(|e| AppError::new(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_serialization() {
        let default_settings = Settings::default();
        assert_eq!(default_settings.language, "en");

        let json = serde_json::to_string(&default_settings).unwrap();
        let deserialized: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.language, "en");

        let custom_json = r#"{"language": "vi", "mcp_port": 5000}"#;
        let deserialized_custom: Settings = serde_json::from_str(custom_json).unwrap();
        assert_eq!(deserialized_custom.language, "vi");
        assert_eq!(deserialized_custom.mcp_port, 5000);
        assert_eq!(deserialized_custom.ai_backend, "openai"); // should fallback to default
    }
}
