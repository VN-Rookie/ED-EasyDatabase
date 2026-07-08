use tauri::State;
use crate::{error::AppError, model::{ColumnInfo, ForeignKeyInfo, IndexInfo, SchemaInfo, TableInfo, TableSchemaInfo, RefactorPreview, QueryResult}, state::AppState};

#[tauri::command]
pub async fn list_databases(conn_id: String, state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    state.driver(&conn_id)?.list_databases().await
}
#[tauri::command]
pub async fn list_schemas(conn_id: String, state: State<'_, AppState>) -> Result<Vec<SchemaInfo>, AppError> {
    state.driver(&conn_id)?.list_schemas().await
}
#[tauri::command]
pub async fn list_tables(conn_id: String, state: State<'_, AppState>) -> Result<Vec<TableInfo>, AppError> {
    state.driver(&conn_id)?.list_tables().await
}
#[tauri::command]
pub async fn describe_table(conn_id: String, table: String, state: State<'_, AppState>) -> Result<Vec<ColumnInfo>, AppError> {
    state.driver(&conn_id)?.describe_table(&table).await
}
#[tauri::command]
pub async fn describe_schema(conn_id: String, state: State<'_, AppState>) -> Result<Vec<TableSchemaInfo>, AppError> {
    state.driver(&conn_id)?.describe_schema().await
}
#[tauri::command]
pub async fn list_indexes(conn_id: String, table: String, state: State<'_, AppState>) -> Result<Vec<IndexInfo>, AppError> {
    state.driver(&conn_id)?.list_indexes(&table).await
}
#[tauri::command]
pub async fn list_foreign_keys(conn_id: String, table: String, state: State<'_, AppState>) -> Result<Vec<ForeignKeyInfo>, AppError> {
    state.driver(&conn_id)?.list_foreign_keys(&table).await
}

fn er_layout_path(conn_id: &str) -> Result<std::path::PathBuf, AppError> {
    let dir = dirs::config_dir()
        .ok_or_else(|| AppError::new("Cannot determine config directory"))?
        .join("easydatabase")
        .join("diagrams");
    std::fs::create_dir_all(&dir).map_err(|e| AppError::new(e.to_string()))?;
    Ok(dir.join(format!("conn_{conn_id}.json")))
}

#[tauri::command]
pub async fn load_er_layout(conn_id: String) -> Result<Option<String>, AppError> {
    let path = er_layout_path(&conn_id)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
    Ok(Some(content))
}

#[tauri::command]
pub async fn save_er_layout(conn_id: String, layout_json: String) -> Result<(), AppError> {
    let path = er_layout_path(&conn_id)?;
    std::fs::write(&path, layout_json).map_err(|e| AppError::new(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn get_refactor_preview(
    conn_id: String,
    table: String,
    column: Option<String>,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<RefactorPreview, AppError> {
    state.driver(&conn_id)?.get_refactor_preview(&table, column.as_deref(), &new_name).await
}

#[tauri::command]
pub async fn execute_refactor(
    conn_id: String,
    ddl: String,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.run_query(&ddl).await
}

