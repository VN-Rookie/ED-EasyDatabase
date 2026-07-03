use tauri::State;
use crate::{error::AppError, model::{DeleteRowInput, InsertRowInput, QueryResult, UpdateRowInput}, state::AppState};

#[tauri::command]
pub async fn insert_row(
    conn_id: String,
    input: InsertRowInput,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.insert_row(input).await
}

#[tauri::command]
pub async fn update_row(
    conn_id: String,
    input: UpdateRowInput,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.update_row(input).await
}

#[tauri::command]
pub async fn delete_row(
    conn_id: String,
    input: DeleteRowInput,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.delete_row(input).await
}
