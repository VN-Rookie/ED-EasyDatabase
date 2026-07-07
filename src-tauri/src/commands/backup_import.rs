use tauri::State;
use crate::{error::AppError, state::AppState};
use std::fs;
use std::collections::HashMap;

#[tauri::command]
pub async fn import_csv_data(
    conn_id: String,
    table: String,
    file_path: String,
    mapping: HashMap<String, String>, // Target DB Column -> Source CSV Header Name
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let file = fs::File::open(&file_path).map_err(|e| AppError::new(e.to_string()))?;
    let mut rdr = csv::ReaderBuilder::new().from_reader(file);
    
    // Read headers to map names to indices
    let headers = rdr.headers().map_err(|e| AppError::new(e.to_string()))?.clone();
    let header_map: HashMap<String, usize> = headers.iter()
        .enumerate()
        .map(|(i, h)| (h.to_string(), i))
        .collect();

    let driver = state.driver(&conn_id)?;
    let dest_columns: Vec<String> = mapping.keys().cloned().collect();
    
    let mut chunk = Vec::new();
    let batch_size = 1000;

    for result in rdr.records() {
        let record = result.map_err(|e| AppError::new(e.to_string()))?;
        let mut row_values = Vec::new();
        
        for col in &dest_columns {
            let mut val = serde_json::Value::Null;
            if let Some(src_header) = mapping.get(col) {
                if let Some(&idx) = header_map.get(src_header) {
                    if let Some(raw_str) = record.get(idx) {
                        // Attempt to parse string to numeric/boolean/null, fallback to String
                        if raw_str.is_empty() || raw_str.to_uppercase() == "NULL" {
                            val = serde_json::Value::Null;
                        } else if let Ok(i) = raw_str.parse::<i64>() {
                            val = serde_json::Value::Number(i.into());
                        } else if let Ok(f) = raw_str.parse::<f64>() {
                            if let Some(num) = serde_json::Number::from_f64(f) {
                                val = serde_json::Value::Number(num);
                            } else {
                                val = serde_json::Value::String(raw_str.to_string());
                            }
                        } else if let Ok(b) = raw_str.parse::<bool>() {
                            val = serde_json::Value::Bool(b);
                        } else {
                            val = serde_json::Value::String(raw_str.to_string());
                        }
                    }
                }
            }
            row_values.push(val);
        }
        chunk.push(row_values);

        if chunk.len() >= batch_size {
            driver.bulk_insert(&table, &dest_columns, chunk.clone()).await?;
            chunk.clear();
        }
    }

    if !chunk.is_empty() {
        driver.bulk_insert(&table, &dest_columns, chunk).await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn import_json_data(
    conn_id: String,
    table: String,
    file_path: String,
    mapping: HashMap<String, String>, // Target DB Column -> Source JSON Field Name
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let raw = fs::read_to_string(&file_path).map_err(|e| AppError::new(e.to_string()))?;
    let json_val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| AppError::new(e.to_string()))?;

    // We support either an array of objects or a single object
    let items = match json_val {
        serde_json::Value::Array(arr) => arr,
        obj @ serde_json::Value::Object(_) => vec![obj],
        _ => return Err(AppError::new("JSON file must contain an array or a single object")),
    };

    let driver = state.driver(&conn_id)?;
    let dest_columns: Vec<String> = mapping.keys().cloned().collect();
    
    let mut chunk = Vec::new();
    let batch_size = 1000;

    for item in items {
        if let Some(obj) = item.as_object() {
            let mut row_values = Vec::new();
            for col in &dest_columns {
                let mut val = serde_json::Value::Null;
                if let Some(src_field) = mapping.get(col) {
                    if let Some(v) = obj.get(src_field) {
                        val = v.clone();
                    }
                }
                row_values.push(val);
            }
            chunk.push(row_values);
        }

        if chunk.len() >= batch_size {
            driver.bulk_insert(&table, &dest_columns, chunk.clone()).await?;
            chunk.clear();
        }
    }

    if !chunk.is_empty() {
        driver.bulk_insert(&table, &dest_columns, chunk).await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn create_database_backup(
    conn_id: String,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let driver = state.driver(&conn_id)?;
    
    // We can support CLI-based pg_dump / mysqldump in the future.
    // For now, generate the logical SQL dump natively.
    let dump = driver.generate_logical_dump().await?;
    fs::write(output_path, dump).map_err(|e| AppError::new(e.to_string()))?;
    Ok(())
}

use tauri::Emitter;

#[derive(Clone, serde::Serialize)]
pub struct BackupStatusPayload {
    pub id: String,
    pub status: String, // "running" | "completed" | "failed"
    pub error: Option<String>,
}

#[tauri::command]
pub fn start_database_backup(
    conn_id: String,
    output_path: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    let backup_id = uuid::Uuid::new_v4().to_string();
    let driver = state.driver(&conn_id)?;
    let app_handle_clone = app_handle.clone();
    let backup_id_clone = backup_id.clone();

    tauri::async_runtime::spawn(async move {
        // Emit running event
        let _ = app_handle_clone.emit("backup-status", BackupStatusPayload {
            id: backup_id_clone.clone(),
            status: "running".to_string(),
            error: None,
        });

        // Run backup
        match driver.generate_logical_dump().await {
            Ok(dump) => {
                match std::fs::write(&output_path, dump) {
                    Ok(_) => {
                        let _ = app_handle_clone.emit("backup-status", BackupStatusPayload {
                            id: backup_id_clone.clone(),
                            status: "completed".to_string(),
                            error: None,
                        });
                    }
                    Err(e) => {
                        let _ = app_handle_clone.emit("backup-status", BackupStatusPayload {
                            id: backup_id_clone.clone(),
                            status: "failed".to_string(),
                            error: Some(e.to_string()),
                        });
                    }
                }
            }
            Err(e) => {
                let _ = app_handle_clone.emit("backup-status", BackupStatusPayload {
                    id: backup_id_clone.clone(),
                    status: "failed".to_string(),
                    error: Some(e.0.clone()),
                });
            }
        }
    });

    Ok(backup_id)
}

#[tauri::command]
pub async fn restore_database_backup(
    conn_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let driver = state.driver(&conn_id)?;
    let content = fs::read_to_string(file_path).map_err(|e| AppError::new(e.to_string()))?;
    
    // Naive SQL statement splitting by semicolon
    // In a production environment, we should parse statements properly to handle semicolons inside string literals.
    let mut statement = String::new();
    let mut inside_string = false;
    let mut escape = false;

    for c in content.chars() {
        if inside_string {
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '\'' {
                inside_string = false;
            }
        } else if c == '\'' {
            inside_string = true;
        }

        statement.push(c);

        if c == ';' && !inside_string {
            let sql = statement.trim();
            if !sql.is_empty() {
                // Execute statement
                let _ = driver.run_query(sql).await;
            }
            statement.clear();
        }
    }

    // Run any leftover statement
    let sql = statement.trim();
    if !sql.is_empty() {
        let _ = driver.run_query(sql).await;
    }

    Ok(())
}

#[tauri::command]
pub fn get_csv_headers(file_path: String) -> Result<Vec<String>, AppError> {
    let file = fs::File::open(&file_path).map_err(|e| AppError::new(e.to_string()))?;
    let mut rdr = csv::ReaderBuilder::new().from_reader(file);
    let headers = rdr.headers().map_err(|e| AppError::new(e.to_string()))?;
    Ok(headers.iter().map(|h| h.to_string()).collect())
}

#[tauri::command]
pub fn get_json_keys(file_path: String) -> Result<Vec<String>, AppError> {
    let raw = fs::read_to_string(&file_path).map_err(|e| AppError::new(e.to_string()))?;
    let json_val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| AppError::new(e.to_string()))?;
    let first_obj = match json_val {
        serde_json::Value::Array(arr) => arr.first().cloned(),
        obj @ serde_json::Value::Object(_) => Some(obj),
        _ => None,
    };
    if let Some(serde_json::Value::Object(map)) = first_obj {
        Ok(map.keys().cloned().collect())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn get_csv_headers_from_string(content: String) -> Result<Vec<String>, AppError> {
    let mut rdr = csv::ReaderBuilder::new().from_reader(content.as_bytes());
    let headers = rdr.headers().map_err(|e| AppError::new(e.to_string()))?;
    Ok(headers.iter().map(|h| h.to_string()).collect())
}

#[tauri::command]
pub fn get_json_keys_from_string(content: String) -> Result<Vec<String>, AppError> {
    let json_val: serde_json::Value = serde_json::from_str(&content).map_err(|e| AppError::new(e.to_string()))?;
    let first_obj = match json_val {
        serde_json::Value::Array(arr) => arr.first().cloned(),
        obj @ serde_json::Value::Object(_) => Some(obj),
        _ => None,
    };
    if let Some(serde_json::Value::Object(map)) = first_obj {
        Ok(map.keys().cloned().collect())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn import_raw_csv_data(
    conn_id: String,
    table: String,
    content: String,
    mapping: HashMap<String, String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("import_{}.csv", uuid::Uuid::new_v4()));
    fs::write(&temp_file, &content).map_err(|e| AppError::new(e.to_string()))?;
    
    let res = import_csv_data(conn_id, table, temp_file.to_string_lossy().to_string(), mapping, state).await;
    let _ = fs::remove_file(temp_file);
    res
}

#[tauri::command]
pub async fn import_raw_json_data(
    conn_id: String,
    table: String,
    content: String,
    mapping: HashMap<String, String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("import_{}.json", uuid::Uuid::new_v4()));
    fs::write(&temp_file, &content).map_err(|e| AppError::new(e.to_string()))?;
    
    let res = import_json_data(conn_id, table, temp_file.to_string_lossy().to_string(), mapping, state).await;
    let _ = fs::remove_file(temp_file);
    res
}
