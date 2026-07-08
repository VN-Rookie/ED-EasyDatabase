use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

use crate::error::AppError;
use super::settings::{load_settings, Settings};

// ── API response structs ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
}

#[derive(Deserialize)]
struct ClaudeContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    message: OllamaMessage,
}

#[derive(Deserialize)]
struct OllamaMessage {
    content: String,
}

// ── Shared HTTP client with timeout ──────────────────────────────────────────

fn ai_client(timeout_secs: u64) -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::new(e.to_string()))
}

// ── Core AI call helpers ──────────────────────────────────────────────────────

async fn call_claude(
    settings: &Settings,
    system: &str,
    user_prompt: &str,
) -> Result<String, AppError> {
    if settings.claude_api_key.is_empty() {
        return Err(AppError::new(
            "Claude API key is not configured. Open Settings (⚙) to add it.",
        ));
    }

    let client = ai_client(60)?;
    let body = json!({
        "model": "claude-sonnet-4-5",
        "max_tokens": 1024,
        "system": system,
        "messages": [{"role": "user", "content": user_prompt}]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &settings.claude_api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::new(format!("Request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::new(format!("Claude API error {status}: {text}")));
    }

    let parsed: ClaudeResponse = resp
        .json()
        .await
        .map_err(|e| AppError::new(format!("Failed to parse Claude response: {e}")))?;

    Ok(parsed
        .content
        .into_iter()
        .filter(|c| c.content_type == "text")
        .filter_map(|c| c.text)
        .collect::<Vec<_>>()
        .join("")
        .trim()
        .to_string())
}

async fn call_ollama(
    settings: &Settings,
    system: &str,
    user_prompt: &str,
) -> Result<String, AppError> {
    let url = format!("{}/api/chat", settings.ollama_url.trim_end_matches('/'));
    let client = ai_client(120)?; // local model may be slower
    let body = json!({
        "model": settings.ollama_model,
        "stream": false,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt}
        ]
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::new(format!("Ollama request failed: {e}. Is Ollama running?")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::new(format!("Ollama error {status}: {text}")));
    }

    let parsed: OllamaResponse = resp
        .json()
        .await
        .map_err(|e| AppError::new(format!("Failed to parse Ollama response: {e}")))?;

    Ok(parsed.message.content.trim().to_string())
}

/// OpenAI-compatible chat completions (OpenAI, DeepSeek, LM Studio, etc.).
async fn call_openai(
    settings: &Settings,
    system: &str,
    user_prompt: &str,
) -> Result<String, AppError> {
    if settings.openai_api_key.is_empty() {
        return Err(AppError::new(
            "OpenAI API key is not configured. Open Settings (⚙) to add it.",
        ));
    }

    let base = settings.openai_base_url.trim_end_matches('/');
    let url = format!("{base}/chat/completions");
    let client = ai_client(60)?;

    let body = json!({
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user_prompt}
        ]
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", settings.openai_api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::new(format!("OpenAI request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::new(format!("OpenAI API error {status}: {text}")));
    }

    // Parse OpenAI / OpenAI-compatible response
    let parsed: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::new(format!("Failed to parse response: {e}")))?;

    parsed["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.trim().to_string())
        .ok_or_else(|| AppError::new("Unexpected response format from OpenAI-compatible API"))
}

/// Dispatch to the configured backend.
async fn call_ai(settings: &Settings, system: &str, user_prompt: &str) -> Result<String, AppError> {
    match settings.ai_backend.as_str() {
        "openai" => call_openai(settings, system, user_prompt).await,
        "ollama" => call_ollama(settings, system, user_prompt).await,
        _        => call_claude(settings, system, user_prompt).await,
    }
}

// ── System prompts ────────────────────────────────────────────────────────────

fn sql_generation_prompt(schema_context: &str) -> String {
    format!(
        "You are a SQL expert assistant for a PostgreSQL database tool.\n\
         The database schema is:\n\n\
         {schema_context}\n\n\
         Rules:\n\
         - Output ONLY the SQL query, nothing else.\n\
         - Do NOT wrap it in markdown fences or backticks.\n\
         - Do NOT add any explanation before or after the SQL.\n\
         - Use double-quoted identifiers for table and column names.\n\
         - End the query with a semicolon."
    )
}

fn sql_explain_prompt(schema_context: &str) -> String {
    format!(
        "You are a PostgreSQL expert. The database schema is:\n\n\
         {schema_context}\n\n\
         Explain the given SQL query in plain language, then list any optimization \
         suggestions or index hints. Be concise and practical. \
         Use plain text — no markdown headers or code fences."
    )
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Generate SQL from a natural-language prompt.
/// schema_context: compact string of table/column metadata. Never include row data.
#[tauri::command]
pub async fn generate_sql(prompt: String, schema_context: String) -> Result<String, AppError> {
    let settings = load_settings().await?;
    let system = sql_generation_prompt(&schema_context);
    let raw = call_ai(&settings, &system, &prompt).await?;

    // Strip accidental markdown fences (model may add them despite the prompt)
    Ok(raw
        .trim_start_matches("```sql")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string())
}

/// Explain a SQL query in plain language and suggest optimizations.
#[tauri::command]
pub async fn explain_sql(sql: String, schema_context: String) -> Result<String, AppError> {
    let settings = load_settings().await?;
    let system = sql_explain_prompt(&schema_context);
    let user_prompt = format!("Explain this SQL query:\n\n{sql}");
    call_ai(&settings, &system, &user_prompt).await
}

/// Generate filter conditions from natural language.
/// columns_json: JSON array of column info [{name, data_type}]
/// Returns: JSON array of [{column, operator, value}]
#[tauri::command]
pub async fn generate_filters(prompt: String, columns_json: String) -> Result<String, AppError> {
    let settings = load_settings().await?;

    let system = format!(
        "You are a database filter generator.\n\
         Available columns (JSON): {columns_json}\n\n\
         Generate filter conditions from natural language. \
         Return ONLY a JSON array with objects like:\n\
         [{{\"column\": \"email\", \"operator\": \"LIKE\", \"value\": \"%gmail%\"}}]\n\n\
         Available operators: =, !=, >, >=, <, <=, LIKE, ILIKE, IS NULL, IS NOT NULL\n\
         Rules:\n\
         - Return ONLY the JSON array, no explanation, no markdown.\n\
         - Use column names exactly as provided.\n\
         - For IS NULL / IS NOT NULL, set value to \"\".\n\
         - For LIKE patterns, add % wildcards where appropriate.\n\
         - Output [] if no filters can be inferred."
    );

    let raw = call_ai(&settings, &system, &prompt).await?;
    // Strip markdown fences
    let clean = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    // Validate it parses as JSON array before returning
    serde_json::from_str::<serde_json::Value>(clean)
        .map_err(|_| AppError::new("AI returned invalid JSON for filters"))?;
    Ok(clean.to_string())
}

/// Complete a partial SQL query (for in-editor autocomplete via Ctrl+Space).
/// Returns only the completion — not a repetition of `partial_sql`.
#[tauri::command]
pub async fn complete_sql(partial_sql: String, schema_context: String) -> Result<String, AppError> {
    let settings = load_settings().await?;
    let system = format!(
        "You are a SQL autocomplete engine for PostgreSQL.\n\
         Database schema:\n{schema_context}\n\n\
         Rules:\n\
         - Output ONLY the completion that should be inserted at the cursor.\n\
         - Do NOT repeat any text that the user has already typed.\n\
         - Do NOT add explanations, markdown fences, or backticks.\n\
         - Keep it concise — typically a clause, column list, or condition.\n\
         - End SELECT queries with a semicolon."
    );
    let raw = call_ai(&settings, &system, &partial_sql).await?;
    Ok(raw
        .trim_start_matches("```sql")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string())
}

fn sql_fix_prompt(schema_context: &str) -> String {
    format!(
        "You are a SQL expert database assistant.\n\
         The database schema is:\n\n\
         {schema_context}\n\n\
         A user ran a SQL query and got an error.\n\
         Your task is to fix the query so that it executes correctly.\n\n\
         Rules:\n\
         - Output ONLY the corrected SQL query, nothing else.\n\
         - Do NOT wrap it in markdown fences or backticks.\n\
         - Do NOT add any explanations."
    )
}

#[tauri::command]
pub async fn fix_sql_error(
    sql: String,
    error: String,
    schema_context: String,
) -> Result<String, AppError> {
    let settings = load_settings().await?;
    let system = sql_fix_prompt(&schema_context);
    let user_prompt = format!(
        "SQL Query:\n{sql}\n\nError Message:\n{error}\n\nPlease fix the SQL query."
    );
    let raw = call_ai(&settings, &system, &user_prompt).await?;
    Ok(raw
        .trim_start_matches("```sql")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string())
}

/// Check if Ollama is reachable at the configured URL.
#[tauri::command]
pub async fn check_ollama() -> Result<bool, AppError> {
    let settings = load_settings().await?;
    let url = format!("{}/api/tags", settings.ollama_url.trim_end_matches('/'));
    let client = ai_client(3)?;
    Ok(client
        .get(&url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false))
}
