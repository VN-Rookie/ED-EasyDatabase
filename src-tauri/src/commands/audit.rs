use crate::error::AppError;
use crate::mcp::audit::{read_recent, export_csv, AuditEntry};

/// Return the most recent audit log entries (newest first, default 200).
#[tauri::command]
pub async fn get_audit_log(limit: Option<usize>) -> Result<Vec<AuditEntry>, AppError> {
    read_recent(limit.unwrap_or(200)).await
}

/// Return the full audit log as a CSV string for file download.
#[tauri::command]
pub async fn export_audit_log() -> Result<String, AppError> {
    export_csv()
}
