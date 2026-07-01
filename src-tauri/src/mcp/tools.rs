use serde_json::{json, Value};
use sqlx::{Column, Row};

use crate::state::{AppState, DbConnection};
use crate::commands::settings::load_settings;
use super::audit;

// ── Tool definitions (returned to MCP client on tools/list) ──────────────────

pub fn tool_definitions() -> Value {
    json!([
        {
            "name": "list_connections",
            "description": "List all active database connections open in tool-sql.",
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
    let list: Vec<Value> = conns.values().map(|e| json!({
        "id":      e.id,
        "name":    e.name,
        "db_type": e.db_type,
    })).collect();
    Ok(serde_json::to_string_pretty(&list).unwrap_or_default())
}

async fn tool_list_tables(args: Value, state: &AppState) -> Result<String, String> {
    let conn_id = args["conn_id"].as_str().ok_or("Missing conn_id")?;
    let pool = pg_pool(conn_id, state)?;

    let rows = sqlx::query_as::<_, (String,)>(
        "SELECT table_name FROM information_schema.tables \
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE' \
         ORDER BY table_name",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let names: Vec<&str> = rows.iter().map(|(n,)| n.as_str()).collect();
    Ok(serde_json::to_string(&names).unwrap_or_default())
}

async fn tool_describe_table(args: Value, state: &AppState) -> Result<String, String> {
    let conn_id = args["conn_id"].as_str().ok_or("Missing conn_id")?;
    let table   = args["table"].as_str().ok_or("Missing table")?;
    let pool = pg_pool(conn_id, state)?;

    let rows = sqlx::query_as::<_, (String, String, String, bool)>(
        "SELECT c.column_name, c.data_type, c.is_nullable, \
         (pk.column_name IS NOT NULL) AS is_pk \
         FROM information_schema.columns c \
         LEFT JOIN ( \
             SELECT kcu.column_name \
             FROM information_schema.table_constraints tc \
             JOIN information_schema.key_column_usage kcu \
                 ON tc.constraint_name = kcu.constraint_name \
                 AND tc.table_schema  = kcu.table_schema \
                 AND tc.table_name    = kcu.table_name \
             WHERE tc.constraint_type = 'PRIMARY KEY' \
                 AND tc.table_schema  = 'public' \
                 AND tc.table_name    = $1 \
         ) pk ON c.column_name = pk.column_name \
         WHERE c.table_schema = 'public' AND c.table_name = $1 \
         ORDER BY c.ordinal_position",
    )
    .bind(table)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let cols: Vec<Value> = rows.into_iter().map(|(name, data_type, nullable, is_pk)| json!({
        "name":     name,
        "type":     data_type,
        "nullable": nullable == "YES",
        "is_pk":    is_pk,
    })).collect();

    Ok(serde_json::to_string_pretty(&cols).unwrap_or_default())
}

async fn tool_run_query(args: Value, state: &AppState) -> Result<String, String> {
    let conn_id = args["conn_id"].as_str().ok_or("Missing conn_id")?;
    let sql     = args["sql"].as_str().ok_or("Missing sql")?;

    let settings = load_settings().await.map_err(|e| e.0.clone())?;
    let pool = pg_pool(conn_id, state)?;

    // P3-B: enforce read-only at the database level, not via keyword matching.
    // SET TRANSACTION READ ONLY makes Postgres reject all writes (including writable CTEs).
    let text = if settings.mcp_read_only {
        execute_read_only_query(sql, &pool).await?
    } else {
        execute_query(sql, &pool).await?
    };

    // P3-C: audit log (fire-and-forget — never delay the tool response)
    let sql_owned = sql.to_string();
    let conn_id_owned = conn_id.to_string();
    tokio::spawn(async move {
        let _ = audit::append(&conn_id_owned, &sql_owned).await;
    });

    Ok(text)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn pg_pool(conn_id: &str, state: &AppState) -> Result<sqlx::PgPool, String> {
    let conns = state.connections.lock().map_err(|e| e.to_string())?;
    let entry = conns.get(conn_id).ok_or_else(|| format!("Connection '{conn_id}' not found. Call list_connections first."))?;
    match &entry.conn {
        DbConnection::Postgres(p) => Ok(p.clone()),
        _ => Err("Only PostgreSQL connections support SQL queries via MCP.".into()),
    }
}

/// Execute inside a Postgres READ ONLY transaction (always rolled back).
/// Postgres itself enforces the constraint — prevents writable CTEs and any DML.
async fn execute_read_only_query(sql: &str, pool: &sqlx::PgPool) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("SET TRANSACTION READ ONLY")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Cannot set read-only transaction: {e}"))?;

    let rows = sqlx::query(sql)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string());

    let _ = tx.rollback().await; // always rollback

    format_rows(rows?)
}

/// Execute with full write access (only called when mcp_read_only = false).
async fn execute_query(sql: &str, pool: &sqlx::PgPool) -> Result<String, String> {
    let upper = sql.trim().to_uppercase();
    let is_select = upper.starts_with("SELECT")
        || upper.starts_with("WITH")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("SHOW")
        || upper.starts_with("TABLE");

    if !is_select {
        let res = sqlx::query(sql).execute(pool).await.map_err(|e| e.to_string())?;
        return Ok(format!("{} row(s) affected", res.rows_affected()));
    }
    let rows = sqlx::query(sql).fetch_all(pool).await.map_err(|e| e.to_string())?;
    format_rows(rows)
}

fn format_rows(rows: Vec<sqlx::postgres::PgRow>) -> Result<String, String> {
    if rows.is_empty() {
        return Ok("[]".into());
    }
    let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
    let data: Vec<serde_json::Map<String, Value>> = rows.iter().map(|row| {
        let mut map = serde_json::Map::new();
        for col in row.columns() {
            let i = col.ordinal();
            let val: Value = row.try_get::<Option<bool>, _>(i).map(|v| v.map_or(Value::Null, Value::Bool))
                .or_else(|_| row.try_get::<Option<i64>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                .or_else(|_| row.try_get::<Option<i32>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                .or_else(|_| row.try_get::<Option<i16>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                .or_else(|_| row.try_get::<Option<f64>, _>(i).map(|v| v.map_or(Value::Null, |n| json!(n))))
                .or_else(|_| row.try_get::<Option<String>, _>(i).map(|v| v.map_or(Value::Null, Value::String)))
                .unwrap_or(Value::Null);
            map.insert(col.name().to_string(), val);
        }
        map
    }).collect();

    let count = data.len(); // compute before json! moves data
    Ok(serde_json::to_string_pretty(&json!({
        "columns": columns,
        "rows":    data,
        "count":   count,
    })).unwrap_or_default())
}
