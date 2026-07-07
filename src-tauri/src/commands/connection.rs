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

fn save_password(id: &str, password: &str) {
    if let Ok(entry) = keyring::Entry::new("easydatabase", id) {
        let _ = entry.set_password(password);
    }
}

fn get_password(id: &str) -> Option<String> {
    if let Ok(entry) = keyring::Entry::new("easydatabase", id) {
        entry.get_password().ok()
    } else {
        None
    }
}

fn delete_password(id: &str) {
    if let Ok(entry) = keyring::Entry::new("easydatabase", id) {
        let _ = entry.delete_credential();
    }
}

fn config_path() -> Result<PathBuf, AppError> {
    // Allow test override via environment variable
    let dir = if let Ok(custom_dir) = std::env::var("TOOLSQL_TEST_CONFIG_DIR") {
        PathBuf::from(custom_dir)
    } else {
        dirs::config_dir()
            .ok_or_else(|| AppError::new("Cannot determine config directory"))?
            .join("easydatabase")
    };
    fs::create_dir_all(&dir).map_err(|e| AppError::new(e.to_string()))?;
    Ok(dir.join("connections.json"))
}

// --- Persist commands ---

#[tauri::command]
pub async fn save_connection(mut config: ConnectionConfig) -> Result<ConnectionConfig, AppError> {
    let path = config_path()?;
    let mut configs: Vec<ConnectionConfig> = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        vec![]
    };

    // Extract password and store it in keyring if it's not empty and not the placeholder
    let raw_pwd = config.password.clone();
    if !raw_pwd.is_empty() && raw_pwd != "KEYCHAIN_STORED" {
        save_password(&config.id, &raw_pwd);
        config.password = "KEYCHAIN_STORED".to_string();
    }

    // Upsert by id
    if let Some(existing) = configs.iter_mut().find(|c| c.id == config.id) {
        *existing = config.clone();
    } else {
        configs.push(config.clone());
    }

    let json = serde_json::to_string_pretty(&configs).map_err(|e| AppError::new(e.to_string()))?;
    fs::write(&path, json).map_err(|e| AppError::new(e.to_string()))?;

    // Restore the password in the returned struct so the frontend has it
    if config.password == "KEYCHAIN_STORED" {
        config.password = raw_pwd;
    }
    Ok(config)
}

#[tauri::command]
pub async fn load_saved_connections() -> Result<Vec<ConnectionConfig>, AppError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
    let mut configs: Vec<ConnectionConfig> = serde_json::from_str(&raw).map_err(|e| AppError::new(e.to_string()))?;

    // Populate passwords from keyring
    for config in &mut configs {
        if config.password == "KEYCHAIN_STORED" {
            if let Some(pwd) = get_password(&config.id) {
                config.password = pwd;
            }
        }
    }
    Ok(configs)
}

#[tauri::command]
pub async fn delete_saved_connection(id: String) -> Result<(), AppError> {
    let path = config_path()?;
    delete_password(&id);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> ConnectionConfig {
        ConnectionConfig {
            id: "test-id-1".into(),
            name: "Test Connection".into(),
            db_type: "postgres".into(),
            host: "localhost".into(),
            port: 5432,
            database: "testdb".into(),
            username: "testuser".into(),
            password: "testpass".into(),
            connection_string: String::new(),
        }
    }

    fn test_config2() -> ConnectionConfig {
        ConnectionConfig {
            id: "test-id-2".into(),
            name: "Test Connection 2".into(),
            db_type: "mysql".into(),
            host: "localhost".into(),
            port: 3306,
            database: "testdb2".into(),
            username: "testuser2".into(),
            password: "testpass2".into(),
            connection_string: String::new(),
        }
    }

    #[tokio::test]
    async fn save_load_delete() {
        // Use a test-specific directory in the project
        let test_dir = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("test-connections");
        let test_path = test_dir.to_str().unwrap().to_string();

        // Clean up before test
        let _ = fs::remove_file(test_dir.join("connections.json"));

        // Set the environment variable to use the test directory
        std::env::set_var("TOOLSQL_TEST_CONFIG_DIR", &test_path);

        // Save a connection
        let config = test_config();
        let saved = save_connection(config.clone()).await.expect("save should succeed");
        assert_eq!(saved.id, "test-id-1");

        // Load saved connections - should have the one we saved
        let loaded = load_saved_connections().await.expect("load should succeed");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "test-id-1");
        assert_eq!(loaded[0].name, "Test Connection");

        // Save another connection
        let config2 = test_config2();
        save_connection(config2.clone()).await.expect("save should succeed");

        // Load again - should have two connections
        let loaded = load_saved_connections().await.expect("load should succeed");
        assert_eq!(loaded.len(), 2);

        // Delete one connection
        delete_saved_connection("test-id-1".into()).await.expect("delete should succeed");

        // Load again - should have one connection left
        let loaded = load_saved_connections().await.expect("load should succeed");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "test-id-2");

        // Delete the other connection
        delete_saved_connection("test-id-2".into()).await.expect("delete should succeed");

        // Load again - should be empty
        let loaded = load_saved_connections().await.expect("load should succeed");
        assert_eq!(loaded.len(), 0);

        // Clean up
        let _ = fs::remove_file(test_dir.join("connections.json"));
        std::env::remove_var("TOOLSQL_TEST_CONFIG_DIR");
    }
}
