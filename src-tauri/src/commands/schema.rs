use tauri::State;
use crate::{error::AppError, model::{ColumnInfo, IndexInfo, SchemaInfo, TableInfo}, state::AppState};

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
pub async fn list_indexes(conn_id: String, table: String, state: State<'_, AppState>) -> Result<Vec<IndexInfo>, AppError> {
    state.driver(&conn_id)?.list_indexes(&table).await
}
