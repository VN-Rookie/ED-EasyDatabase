//! Audit log for MCP-executed queries.
//! Appends one JSON line per query to ~/.config/tool-sql/audit.jsonl
//! Format: {"timestamp":"<RFC3339>","conn_id":"<id>","sql":"<sql>"}

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use crate::error::AppError;

#[derive(Serialize, Deserialize, Clone)]
pub struct AuditEntry {
    pub timestamp: String,
    pub conn_id: String,
    pub sql: String,
}

fn audit_path() -> Result<PathBuf, AppError> {
    let dir = dirs::config_dir()
        .ok_or_else(|| AppError::new("Cannot determine config directory"))?
        .join("easydatabase");
    fs::create_dir_all(&dir).map_err(|e| AppError::new(e.to_string()))?;
    Ok(dir.join("audit.jsonl"))
}

/// Append one entry (called from a spawned task — uses spawn_blocking for file I/O).
pub async fn append(conn_id: &str, sql: &str) -> Result<(), AppError> {
    let path = audit_path()?;
    let entry = AuditEntry {
        timestamp: now_rfc3339(),
        conn_id: conn_id.to_string(),
        sql: sql.to_string(),
    };
    let line = serde_json::to_string(&entry).map_err(|e| AppError::new(e.to_string()))?;

    tokio::task::spawn_blocking(move || {
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| AppError::new(e.to_string()))?;
        writeln!(f, "{}", line).map_err(|e| AppError::new(e.to_string()))
    })
    .await
    .map_err(|e| AppError::new(e.to_string()))?
}

/// Read the most-recent `limit` entries (newest first).
pub async fn read_recent(limit: usize) -> Result<Vec<AuditEntry>, AppError> {
    let path = audit_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    tokio::task::spawn_blocking(move || {
        let content = fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
        let all: Vec<AuditEntry> = content
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect();
        let start = all.len().saturating_sub(limit);
        // Reverse the slice so newest (last-written) entries come first
        Ok(all[start..].iter().rev().cloned().collect())
    })
    .await
    .map_err(|e| AppError::new(e.to_string()))?
}

/// Return all entries as a RFC 4180-compliant CSV string.
pub fn export_csv() -> Result<String, AppError> {
    let path = audit_path()?;
    if !path.exists() {
        return Ok("timestamp,conn_id,sql\n".into());
    }
    let content = fs::read_to_string(&path).map_err(|e| AppError::new(e.to_string()))?;
    let mut out = "\"timestamp\",\"conn_id\",\"sql\"\n".to_string();
    for line in content.lines().filter(|l| !l.trim().is_empty()) {
        if let Ok(e) = serde_json::from_str::<AuditEntry>(line) {
            out.push_str(&csv_field(&e.timestamp));
            out.push(',');
            out.push_str(&csv_field(&e.conn_id));
            out.push(',');
            out.push_str(&csv_field(&e.sql));
            out.push('\n');
        }
    }
    Ok(out)
}

/// Quote a CSV field per RFC 4180: wrap in double-quotes, escape internal double-quotes,
/// and replace embedded newlines with a space (preserves column count).
fn csv_field(s: &str) -> String {
    let inner = s.replace('"', "\"\"").replace('\n', " ").replace('\r', "");
    format!("\"{inner}\"")
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}
