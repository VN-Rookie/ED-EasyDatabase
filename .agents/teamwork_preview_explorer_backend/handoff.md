# Handoff Report: Rust Backend Code Review and Security Audit

This report presents a comprehensive review and security audit of the backend Rust codebase (`src-tauri/src/`) for `tool-sql`.

---

## 1. Observation

### Observation A: SQL Injection in DML Operations
In both PostgreSQL and MySQL drivers, queries for single row CRUD operations (`insert_row`, `update_row`, `delete_row`) and batch operations (`apply_batch_edits`) are constructed using string interpolation rather than parameterized queries.

*   **File**: `src-tauri/src/drivers/postgres.rs`
    *   **Lines 202-205**:
        ```rust
        let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, column_list, value_list);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
        ```
    *   **Lines 231-234**:
        ```rust
        let sql = format!("UPDATE {} SET {} WHERE {} = {}", table, set_list, pk_column, pk_literal);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
        ```
    *   **Lines 250-253**:
        ```rust
        let sql = format!("DELETE FROM {} WHERE {} = {}", table, pk_column, pk_literal);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
        ```
*   **File**: `src-tauri/src/drivers/mysql.rs`
    *   **Lines 154-157**:
        ```rust
        let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, column_list, value_list);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
        ```
    *   **Lines 183-186**:
        ```rust
        let sql = format!("UPDATE {} SET {} WHERE {} = {}", table, set_list, pk_column, pk_literal);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
        ```
    *   **Lines 202-205**:
        ```rust
        let sql = format!("DELETE FROM {} WHERE {} = {}", table, pk_column, pk_literal);

        let result = sqlx::query(&sql)
            .execute(&self.pool)
        ```

### Observation B: Shared Driver State and Non-deterministic Schema Mutation
The `PostgresDriver` and `MongoDriver` maintain active schema/database state in a `RwLock` inside the driver struct. This driver struct is wrapped in a shared `Arc` and accessed concurrently across requests.
*   **File**: `src-tauri/src/drivers/postgres.rs`
    *   **Lines 9-12**:
        ```rust
        pub struct PostgresDriver {
            pub pool: sqlx::PgPool,
            pub schema: std::sync::RwLock<String>,
        }
        ```
    *   **Lines 21-27**:
        ```rust
        async fn set_database(&self, schema: &str) -> Result<(), AppError> {
            *self.schema.write().unwrap() = schema.to_string();
            let quoted = format!("\"{}\"", schema.replace('"', "\"\""));
            sqlx::query(&format!("SET search_path TO {}, public", quoted))
                .execute(&self.pool)
                .await?;
            Ok(())
        }
        ```
*   **File**: `src-tauri/src/drivers/mongo.rs`
    *   **Lines 11-14**:
        ```rust
        pub struct MongoDriver {
            client: mongodb::Client,
            db: RwLock<String>,
        }
        ```
    *   **Lines 376-379**:
        ```rust
        async fn set_database(&self, db: &str) -> Result<(), AppError> {
            *self.db.write().unwrap() = db.to_string();
            Ok(())
        }
        ```

### Observation C: Plaintext Storage of AI API Keys in Settings
API keys for Claude and OpenAI are stored in plaintext JSON inside the user's config directory.
*   **File**: `src-tauri/src/commands/settings.rs`
    *   **Lines 15-32**:
        ```rust
        #[derive(Serialize, Deserialize, Clone)]
        pub struct Settings {
            // ── Claude API ────────────────────────────────────────────
            #[serde(default)]
            pub claude_api_key: String,
            ...
            // ── OpenAI-compatible (OpenAI, DeepSeek, LM Studio, etc.) ─
            #[serde(default)]
            pub openai_api_key: String,
            ...
        ```
    *   **Lines 90-93**:
        ```rust
        pub async fn save_settings(settings: Settings) -> Result<Settings, AppError> {
            let path = settings_path()?;
            let json = serde_json::to_string_pretty(&settings).map_err(|e| AppError::new(e.to_string()))?;
            fs::write(&path, json).map_err(|e| AppError::new(e.to_string()))?;
            Ok(settings)
        }
        ```

### Observation D: Ignored Keyring Error Handling
Error responses from OS Keyring credential writes and deletions are discarded.
*   **File**: `src-tauri/src/commands/connection.rs`
    *   **Lines 13-17**:
        ```rust
        fn save_password(id: &str, password: &str) {
            if let Ok(entry) = keyring::Entry::new("tool-sql", id) {
                let _ = entry.set_password(password);
            }
        }
        ```
    *   **Lines 27-31**:
        ```rust
        fn delete_password(id: &str) {
            if let Ok(entry) = keyring::Entry::new("tool-sql", id) {
                let _ = entry.delete_credential();
            }
        }
        ```

### Observation E: Unregistered Command and Silenced Errors
*   **File**: `src-tauri/src/commands/ai.rs` defines a `generate_filters` command (lines 249-279) but **File**: `src-tauri/src/lib.rs` (lines 28-72) does not register it in the Tauri invoke handler.
*   **File**: `src-tauri/src/commands/backup_import.rs` (lines 172-180) runs database restore queries but ignores errors:
    ```rust
    if c == ';' && !inside_string {
        let sql = statement.trim();
        if !sql.is_empty() {
            // Execute statement
            let _ = driver.run_query(sql).await;
        }
        statement.clear();
    }
    ```

---

## 2. Logic Chain

### Logic Chain A: SQL Injection Risk
1. In `postgres.rs` and `mysql.rs`'s CRUD functions, raw input is formatted into query strings (Observation A).
2. If column names, table names, or primary key column names contain malicious SQL fragments (e.g. injected through client-supplied metadata or schema edits), they are concatenated directly into the query template.
3. This bypasses SQL engine parameterization and represents a significant SQL injection vulnerability, potentially allowing arbitrary database commands to run when executing edits.

### Logic Chain B: Thread-Safety and State Corruption
1. The driver is held in `ConnectionHandle` inside `AppState` as a single `Arc<dyn Driver>` (see `state.rs`). This Arc is cloned and shared by all commands concurrently.
2. If a user has multiple tabs or query panels open, or if multiple queries are running concurrently (e.g. from the UI and MCP server), calls to `set_database` will concurrently write to the shared `RwLock<String>` (Observation B).
3. In `PostgresDriver`, `set_database` attempts to run `SET search_path TO ...` on the connection pool `self.pool`. However, `sqlx::PgPool` is a pool of connections. Setting search path on the pool runs it on a single connection checkout, which is immediately returned to the pool. Subsequent queries checked out of the pool may run on a connection without the updated search path.
4. Concurrently, other threads will read `self.schema` (which may have been overwritten by a race condition) and construct their queries using the incorrect schema name, causing queries to run against the wrong schema or database.

### Logic Chain C: Keyring Security Gaps
1. Keyring integration is used to isolate database passwords (stored under `KEYCHAIN_STORED` in the local configuration).
2. However, settings JSON includes API keys for OpenAI and Claude, which are saved in plain text (Observation C).
3. A local attacker or malicious process scanning the user home directory can easily read `~/.config/tool-sql/settings.json` and steal these API keys.
4. Additionally, because keyring write errors are ignored (Observation D), if the OS keychain is unavailable (e.g., in a container or headless server), `save_password` will fail silently, writing `KEYCHAIN_STORED` into the config file while the password itself is lost.

---

## 3. Caveats
*   The actual behavior of the keyring library on specific Linux distributions (e.g., lack of dbus or gnome-keyring) was not dynamically tested, as this is a read-only investigation.
*   We assume standard Tauri IPC calling patterns from the frontend where schema and table information might be user-controlled.

---

## 4. Conclusion

1.  **Architecture Adherence**: The codebase conforms cleanly to the target `Driver` trait architecture, keeping Tauri command logic thin. However, `generate_filters` in `commands/ai.rs` is dead code because it is not registered in `lib.rs`.
2.  **Error Handling**: Key errors are caught but keyring failures and restore database execution errors are silently discarded, leading to potential data loss or incomplete migrations.
3.  **Thread Safety**: Mutual exclusion of the connection map is correctly handled, but dynamic schema and database mutations inside the driver structs (`PostgresDriver::schema` and `MongoDriver::db`) introduce data races and pool connection contamination.
4.  **Security**: Vulnerable to local API key leakage via plain-text settings and SQL injection inside dynamic DML statement construction.

---

## 5. Concrete Improvements

### Improvement 1: Parameterize DML Queries in Drivers
*   **Target File**: `src-tauri/src/drivers/postgres.rs` (lines 186-308) and `src-tauri/src/drivers/mysql.rs` (lines 138-259).
*   **Proposal**: Instead of raw string interpolation for query values, dynamically build query placeholders (`$1`, `$2`, etc. for Postgres, and `?` for MySQL) and bind the variables dynamically, matching the pattern used in `bulk_insert`.
*   **Before (Postgres example)**:
    ```rust
    let columns: Vec<String> = values.keys().cloned().collect();
    let values_list: Vec<String> = columns.iter()
        .filter_map(|col| values.get(col).map(|v| json_to_sql_literal(v)))
        .collect();
    let column_list = columns.join(", ");
    let value_list = values_list.join(", ");
    let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, column_list, value_list);
    let result = sqlx::query(&sql).execute(&self.pool).await?;
    ```
*   **After (Postgres parameterized example)**:
    ```rust
    let columns: Vec<String> = values.keys().cloned().collect();
    let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("${}", i)).collect();
    // Quote identifiers to protect column and table names
    let column_list = columns.iter().map(|c| format!("\"{}\"", c.replace('"', "\"\""))).collect::<Vec<_>>().join(", ");
    let value_list = placeholders.join(", ");
    let table_quoted = format!("\"{}\"", table.replace('"', "\"\""));
    let sql = format!("INSERT INTO {} ({}) VALUES ({})", table_quoted, column_list, value_list);

    let mut query = sqlx::query(&sql);
    for col in &columns {
        if let Some(val) = values.get(col) {
            query = match val {
                serde_json::Value::Null => query.bind(None::<String>),
                serde_json::Value::Bool(b) => query.bind(*b),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() { query.bind(i) }
                    else if let Some(f) = n.as_f64() { query.bind(f) }
                    else { query.bind(n.to_string()) }
                }
                serde_json::Value::String(s) => query.bind(s.clone()),
                other => query.bind(other.to_string()),
            };
        }
    }
    let result = query.execute(&self.pool).await?;
    ```

### Improvement 2: Secure AI API Keys with Keyring
*   **Target File**: `src-tauri/src/commands/settings.rs` (lines 15-49) and `src-tauri/src/commands/ai.rs`.
*   **Proposal**: Update settings load and save commands to treat AI API keys as secrets. Substitute key values with `"KEYCHAIN_STORED"` when saving to `settings.json`, and store the actual keys in the keyring under the service name `"tool-sql-ai"`.
*   **Proposed Implementation**:
    ```rust
    // In commands/settings.rs
    pub async fn save_settings(mut settings: Settings) -> Result<Settings, AppError> {
        let raw_claude = settings.claude_api_key.clone();
        if !raw_claude.is_empty() && raw_claude != "KEYCHAIN_STORED" {
            save_keyring_secret("claude_api_key", &raw_claude)?;
            settings.claude_api_key = "KEYCHAIN_STORED".to_string();
        }
        // Save logic continues...
    }
    ```

### Improvement 3: Eliminate Dynamic Schema State in Driver
*   **Target File**: `src-tauri/src/drivers/mod.rs` (Driver Trait definitions)
*   **Proposal**: Pass the target schema/database explicitly as an optional parameter to driver methods (like `list_tables`, `describe_table`, `count_rows`, etc.) rather than setting search path or mutating a shared driver field. Alternatively, create dedicated connection sessions per request.

---

## 6. Verification Method

### Testing and Verification Command
To verify that the backend builds and test suites pass, run:
```bash
cd src-tauri && cargo test
```

### Invalidation Conditions
If dynamic testing shows that using connection pool scopes for `SET search_path` does not result in query routing conflicts under load, verify whether SQLx connection checkout returns connection states cleanly reset by default. However, standard SQLx pools do *not* automatically reset session parameters unless explicitly configured in options, validating this thread-safety finding.
