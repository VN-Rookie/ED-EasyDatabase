use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Serialize, Deserialize, Clone)]
pub struct SavedQuery {
    pub id: String,
    pub name: String,
    pub sql: String,
    pub created_at: String,
}

fn path() -> Result<PathBuf, AppError> {
    let dir = dirs::config_dir()
        .ok_or_else(|| AppError::new("Cannot determine config directory"))?
        .join("tool-sql");
    fs::create_dir_all(&dir).map_err(|e| AppError::new(e.to_string()))?;
    Ok(dir.join("saved_queries.json"))
}

fn load_all() -> Result<Vec<SavedQuery>, AppError> {
    let p = path()?;
    if !p.exists() { return Ok(vec![]); }
    let raw = fs::read_to_string(&p).map_err(|e| AppError::new(e.to_string()))?;
    serde_json::from_str(&raw).map_err(|e| AppError::new(e.to_string()))
}

fn save_all(queries: &[SavedQuery]) -> Result<(), AppError> {
    let json = serde_json::to_string_pretty(queries).map_err(|e| AppError::new(e.to_string()))?;
    fs::write(path()?, json).map_err(|e| AppError::new(e.to_string()))
}

#[tauri::command]
pub async fn list_saved_queries() -> Result<Vec<SavedQuery>, AppError> {
    load_all()
}

#[tauri::command]
pub async fn create_saved_query(name: String, sql: String) -> Result<SavedQuery, AppError> {
    let mut queries = load_all()?;
    let q = SavedQuery {
        id: Uuid::new_v4().to_string(),
        name,
        sql,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    queries.push(q.clone());
    save_all(&queries)?;
    Ok(q)
}

#[tauri::command]
pub async fn delete_saved_query(id: String) -> Result<(), AppError> {
    let mut queries = load_all()?;
    queries.retain(|q| q.id != id);
    save_all(&queries)
}

#[tauri::command]
pub async fn update_saved_query(id: String, name: String, sql: String) -> Result<SavedQuery, AppError> {
    let mut queries = load_all()?;
    let q = queries.iter_mut().find(|q| q.id == id)
        .ok_or_else(|| AppError::new("Saved query not found"))?;
    q.name = name;
    q.sql = sql;
    let updated = q.clone();
    save_all(&queries)?;
    Ok(updated)
}
