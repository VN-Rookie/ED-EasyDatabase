use serde_json::{json, Value};

use crate::state::AppState;
use crate::model::ConnectionMeta;
use super::audit;

// ── Tool definitions (returned to MCP client on tools/list) ──────────────────

pub fn tool_definitions() -> Value {
    json!([
        {
            "name": "list_connections",
            "description": "List all active database connections open in easydatabase.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "list_tables",
            "description": "List all tables in a PostgreSQL database connection.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "conn_id": { "type": "string", "description": "Connection ID from list_connections" }
                },
                "required": ["conn_id"]
            }
        },
        {
            "name": "describe_table",
            "description": "Get column names, types, nullable flags, and primary key info for a table.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "conn_id": { "type": "string", "description": "Connection ID" },
                    "table":   { "type": "string", "description": "Table name" }
                },
                "required": ["conn_id", "table"]
            }
        },
        {
            "name": "run_query",
            "description": "Execute a SQL query and return results as JSON. \
                            Read-only mode (default) only allows SELECT/WITH/EXPLAIN.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "conn_id": { "type": "string", "description": "Connection ID" },
                    "sql":     { "type": "string", "description": "SQL query to execute" }
                },
                "required": ["conn_id", "sql"]
            }
        }
    ])
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────

pub async fn call_tool(name: &str, args: Value, state: &AppState) -> Result<Value, String> {
    let result = match name {
        "list_connections" => tool_list_connections(state).await,
        "list_tables"      => tool_list_tables(args, state).await,
        "describe_table"   => tool_describe_table(args, state).await,
        "run_query"        => tool_run_query(args, state).await,
        other              => Err(format!("Unknown tool: {other}")),
    };

    // Wrap in MCP content envelope
    match result {
        Ok(text) => Ok(json!({
            "content": [{ "type": "text", "text": text }],
            "isError": false
        })),
        Err(msg) => Ok(json!({
            "content": [{ "type": "text", "text": msg }],
            "isError": true
        })),
    }
}

// ── Tool implementations ──────────────────────────────────────────────────────

async fn tool_list_connections(state: &AppState) -> Result<String, String> {
    let conns = state.connections.lock().map_err(|e| e.to_string())?;
    let list: Vec<ConnectionMeta> = conns.values().map(|e| e.meta.clone()).collect();
    Ok(serde_json::to_string_pretty(&list).unwrap_or_default())
}

async fn tool_list_tables(args: Value, state: &AppState) -> Result<String, String> {
    let conn_id = args["conn_id"].as_str().ok_or("Missing conn_id")?;
    let driver = state.driver(conn_id).map_err(|e| e.0.clone())?;

    let tables = driver.list_tables().await.map_err(|e| e.0.clone())?;
    let names: Vec<&str> = tables.iter().map(|t| t.name.as_str()).collect();
    Ok(serde_json::to_string(&names).unwrap_or_default())
}

async fn tool_describe_table(args: Value, state: &AppState) -> Result<String, String> {
    let conn_id = args["conn_id"].as_str().ok_or("Missing conn_id")?;
    let table   = args["table"].as_str().ok_or("Missing table")?;
    let driver = state.driver(conn_id).map_err(|e| e.0.clone())?;

    let columns = driver.describe_table(table).await.map_err(|e| e.0.clone())?;
    let cols: Vec<Value> = columns.into_iter().map(|c| json!({
        "name":     c.name,
        "type":     c.data_type,
        "nullable": c.nullable,
        "is_pk":    c.is_pk,
    })).collect();

    Ok(serde_json::to_string_pretty(&cols).unwrap_or_default())
}

async fn tool_run_query(args: Value, state: &AppState) -> Result<String, String> {
    let conn_id = args["conn_id"].as_str().ok_or("Missing conn_id")?;
    let sql     = args["sql"].as_str().ok_or("Missing sql")?;

    // P3-B: enforce read-only at the tool boundary — reject writes unless the
    // user has explicitly disabled mcp_read_only in settings.
    let settings = crate::commands::settings::load_settings().await.map_err(|e| e.0.clone())?;
    if settings.mcp_read_only && !crate::drivers::is_select(sql) {
        return Err(
            "Write queries are disabled in MCP read-only mode. \
             Enable write access in Settings to run this query.".into(),
        );
    }

    let driver = state.driver(conn_id).map_err(|e| e.0.clone())?;
    let result = driver.run_query(sql).await.map_err(|e| e.0.clone())?;

    // P3-C: audit log (fire-and-forget — never delay the tool response)
    let sql_owned = sql.to_string();
    let conn_id_owned = conn_id.to_string();
    tokio::spawn(async move {
        let _ = audit::append(&conn_id_owned, &sql_owned).await;
    });

    Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
}

