use tauri::State;
use crate::{error::AppError, model::{DeleteDocumentInput, InsertDocumentInput, QueryResult, ReplaceDocumentInput, UpdateDocumentInput, BatchEditInput}, state::AppState};

#[tauri::command]
pub async fn run_query(conn_id: String, sql: String, state: State<'_, AppState>) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.run_query(&sql).await
}

#[tauri::command]
pub async fn apply_batch_edits(
    conn_id: String,
    input: BatchEditInput,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.apply_batch_edits(input).await
}

#[tauri::command]
pub async fn count_rows(conn_id: String, table: String, state: State<'_, AppState>) -> Result<u64, AppError> {
    state.driver(&conn_id)?.count_rows(&table).await
}

#[tauri::command]
pub async fn insert_document(
    conn_id: String,
    input: InsertDocumentInput,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.insert_document(input).await
}

#[tauri::command]
pub async fn update_documents(
    conn_id: String,
    input: UpdateDocumentInput,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.update_documents(input).await
}

#[tauri::command]
pub async fn delete_documents(
    conn_id: String,
    input: DeleteDocumentInput,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.delete_documents(input).await
}

#[tauri::command]
pub async fn replace_document(
    conn_id: String,
    input: ReplaceDocumentInput,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.replace_document(input).await
}
