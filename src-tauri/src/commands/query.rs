use tauri::State;
use crate::{error::AppError, model::QueryResult, state::AppState};

#[tauri::command]
pub async fn run_query(conn_id: String, sql: String, state: State<'_, AppState>) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.run_query(&sql).await
}
