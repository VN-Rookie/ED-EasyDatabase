use std::fs;
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

use crate::{
    drivers,
    error::AppError,
    model::{ConnectionConfig, ConnectionMeta},
    state::{AppState, ConnectionHandle},
};

fn config_path() -> Result<PathBuf, AppError> {
    let dir = dirs::config_dir()
        .ok_or_else(|| AppError::new("Cannot determine config directory"))?
        .join("tool-sql");
    fs::create_dir_all(&dir).map_err(|e| AppError::new(e.to_string()))?;
    Ok(dir.join("connections.json"))
}

// --- Persist commands ---

#[tauri::command]
pub async fn save_connection(config: ConnectionConfig) -> Result<ConnectionConfig, AppError> {
    let path = config_path()?;
    let mut configs: Vec<ConnectionConfig> = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        vec![]
    };

    // Upsert by id
    if let Some(existing) = configs.iter_mut().find(|c| c.id == config.id) {
        *existing = config.clone();
    } else {
        configs.push(config.clone());
    }

    let json = serde_json::to_string_pretty(&configs).map_err(|e| AppError::new(e.to_string()))?;
    fs::write(&path, json).map_err(|e| AppError::new(e.to_string()))?;
    Ok(config)
}

#[tauri::command]
pub async fn load_saved_connections() -> Result<Vec<ConnectionConfig>, AppError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
    serde_json::from_str(&raw).map_err(|e| AppError::new(e.to_string()))
}

#[tauri::command]
pub async fn delete_saved_connection(id: String) -> Result<(), AppError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
    let mut configs: Vec<ConnectionConfig> =
        serde_json::from_str(&raw).map_err(|e| AppError::new(e.to_string()))?;
    configs.retain(|c| c.id != id);
    let json = serde_json::to_string_pretty(&configs).map_err(|e| AppError::new(e.to_string()))?;
    fs::write(&path, json).map_err(|e| AppError::new(e.to_string()))
}

// --- Session commands ---

#[tauri::command]
pub async fn connect(config: ConnectionConfig, state: State<'_, AppState>) -> Result<ConnectionMeta, AppError> {
    let driver = drivers::connect(&config).await?;
    let meta = ConnectionMeta { id: config.id.clone(), name: config.name.clone(), db_type: config.db_type.clone() };
    state.connections.lock().unwrap().insert(config.id.clone(), ConnectionHandle { meta: meta.clone(), driver });
    Ok(meta)
}

#[tauri::command]
pub async fn test_connection(config: ConnectionConfig) -> Result<bool, AppError> {
    let driver = drivers::connect(&config).await?;
    driver.ping().await?;
    Ok(true)
}

#[tauri::command]
pub async fn switch_mongo_db(conn_id: String, db_name: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let driver = state.driver(&conn_id)?;
    driver.set_database(&db_name).await
}

#[tauri::command]
pub async fn disconnect(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.connections.lock().unwrap().remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn list_connections(state: State<'_, AppState>) -> Result<Vec<ConnectionMeta>, AppError> {
    let conns = state.connections.lock().unwrap();
    Ok(conns.values().map(|h| h.meta.clone()).collect())
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}
