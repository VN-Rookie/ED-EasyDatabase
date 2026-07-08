//! MCP (Model Context Protocol) server — JSON-RPC 2.0 over TCP.
//!
//! Listens on `127.0.0.1:{port}` (default 3456) and shares AppState
//! with the Tauri frontend process — no extra IPC or separate binary needed.
//!
//! Configure in Claude Code (~/.claude/claude_desktop_config.json):
//!   { "mcpServers": { "tool-sql": { "command": "nc", "args": ["localhost", "3456"] } } }

pub mod audit;
mod tools;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

use crate::state::AppState;

// ── JSON-RPC 2.0 types ────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct RpcResponse {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Serialize)]
struct RpcError {
    code: i32,
    message: String,
}

impl RpcResponse {
    fn ok(id: Value, result: Value) -> Self {
        Self { jsonrpc: "2.0", id, result: Some(result), error: None }
    }
    fn err(id: Value, code: i32, msg: impl Into<String>) -> Self {
        Self { jsonrpc: "2.0", id, result: None, error: Some(RpcError { code, message: msg.into() }) }
    }
}

// ── Server entry point ────────────────────────────────────────────────────────

pub async fn serve(state: AppState, port: u16) {
    let addr = format!("127.0.0.1:{port}");
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => { eprintln!("[MCP] Listening on {addr}"); l }
        Err(e) => { eprintln!("[MCP] Failed to bind {addr}: {e}"); return; }
    };

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                eprintln!("[MCP] Client connected: {peer}");
                let state = state.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, state).await {
                        eprintln!("[MCP] Connection error: {e}");
                    }
                });
            }
            Err(e) => eprintln!("[MCP] Accept error: {e}"),
        }
    }
}

// ── Per-connection handler ────────────────────────────────────────────────────

async fn handle_connection(
    stream: tokio::net::TcpStream,
    state: AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    while let Some(line) = lines.next_line().await? {
        let line = line.trim().to_string();
        if line.is_empty() { continue; }

        let response_str = match serde_json::from_str::<RpcRequest>(&line) {
            Err(e) => {
                let resp = RpcResponse::err(Value::Null, -32700, format!("Parse error: {e}"));
                serde_json::to_string(&resp)?
            }
            Ok(req) => {
                // Notifications have no id — no response required
                if req.id.is_none() { continue; }

                let id = req.id.clone().unwrap_or(Value::Null);
                let resp = match dispatch(req, &state).await {
                    Ok(result) => RpcResponse::ok(id, result),
                    Err((code, msg)) => RpcResponse::err(id, code, msg),
                };
                serde_json::to_string(&resp)?
            }
        };

        writer.write_all(response_str.as_bytes()).await?;
        writer.write_all(b"\n").await?;
        writer.flush().await?;
    }

    eprintln!("[MCP] Client disconnected");
    Ok(())
}

// ── JSON-RPC dispatcher ───────────────────────────────────────────────────────

async fn dispatch(req: RpcRequest, state: &AppState) -> Result<Value, (i32, String)> {
    match req.method.as_str() {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "easydatabase", "version": "0.1.0" }
        })),

        "tools/list" => Ok(json!({ "tools": tools::tool_definitions() })),

        "tools/call" => {
            let name = req.params["name"]
                .as_str()
                .ok_or_else(|| (-32602i32, "Missing 'name' in params".to_string()))?
                .to_string();
            let args = req.params.get("arguments").cloned().unwrap_or(json!({}));
            tools::call_tool(&name, args, state)
                .await
                .map_err(|e| (-32603i32, e))
        }

        "ping" => Ok(json!({})),

        // -32601 = Method not found (JSON-RPC 2.0 §5.1)
        m => Err((-32601, format!("Method not found: {m}"))),
    }
}
