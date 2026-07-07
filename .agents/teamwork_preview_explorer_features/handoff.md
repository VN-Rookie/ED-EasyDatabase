# Codebase Review: Feature Gaps & Polish (tool-sql)

This report details the assessment of the following core features in `tool-sql`:
1. Postgres multi-schema support.
2. Batch edits.
3. Data import.
4. Database snapshot.
5. SQL console statement splitting.

---

## 1. Observation

Direct observations of implementation files, lines, and mechanisms:

### Postgres Multi-Schema Support
* **Backend Switch Hook**: `switch_mongo_db` in `src-tauri/src/commands/connection.rs` (lines 135–138) delegates to the driver's `set_database` method:
  ```rust
  #[tauri::command]
  pub async fn switch_mongo_db(conn_id: String, db_name: String, state: State<'_, AppState>) -> Result<(), AppError> {
      let driver = state.driver(&conn_id)?;
      driver.set_database(&db_name).await
  }
  ```
* **Postgres Schema Change**: In `src-tauri/src/drivers/postgres.rs` (lines 21–28), `set_database` updates the RwLock `schema` and issues a `SET search_path` query:
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
* **Frontend Schema Selection**: In `src/hooks/useSchema.ts` (lines 46–48), the frontend updates its client state but invokes no backend operation:
  ```typescript
  const selectSchema = async (schemaName: string) => {
    useSchemaStore.getState().setSelectedSchema(schemaName);
  };
  ```
* **Data Retrieval Queries**: In `src/hooks/useSchema.ts` (lines 163–165), queries to fetch grid data are not schema-qualified:
  ```typescript
  const orderClause = sortCol ? ` ORDER BY "${sortCol}" ${sortDir.toUpperCase()}` : "";
  const sql = `SELECT * FROM "${table}"${whereClause}${orderClause} LIMIT ${pageSize} OFFSET ${page * pageSize}`;
  ```

### Batch Edits
* **Update Query Creation**: In `src/features/object-view/DataGridShell.tsx` (lines 763–774), updates are generated as separate items in an array per changed cell:
  ```typescript
  Array.from(dirtyCells.values()).forEach((edit) => {
    const row = result.rows[edit.rowIndex];
    if (!row || !primaryKey) return;
    const pkValue = row[primaryKey];
    updates.push({
      table: object.table,
      pk_column: primaryKey,
      pk_value: pkValue,
      values: { [edit.column]: edit.newValue },
    });
  });
  ```
* **Backend Update SQL**: In `src-tauri/src/drivers/postgres.rs` (lines 270–279) and `src-tauri/src/drivers/mysql.rs` (lines 221–230), the drivers loop through each update object and run a separate database statement:
  ```rust
  for upd in input.updates {
      let set_clauses: Vec<String> = upd.values.keys()
          .filter_map(|col| upd.values.get(col).map(|v| format!("\"{}\" = {}", col.replace('"', "\"\""), json_to_sql_literal(v))))
          .collect();
      let set_list = set_clauses.join(", ");
      let pk_literal = json_to_sql_literal(&upd.pk_value);
      let sql = format!("UPDATE {} SET {} WHERE \"{}\" = {}", table_quoted, set_list, upd.pk_column.replace('"', "\"\""), pk_literal);
      let r = sqlx::query(&sql).execute(&mut *tx).await?;
      total_affected += r.rows_affected();
  }
  ```
* **Primary Key Verification in Loop**: In `src/features/object-view/DataGridShell.tsx` (lines 766 and 778), if there's no primary key, the update/delete steps return early.
* **SQL Escaping Helpers**: In `src-tauri/src/drivers/mysql.rs` (lines 395–397), single quotes are replaced by doubling them:
  ```rust
  fn escape_sql_string(s: &str) -> String {
      s.replace('\'', "''")
  }
  ```

### Data Import
* **In-Memory JSON Read**: In `src-tauri/src/commands/backup_import.rs` (lines 83–84), the JSON data command reads the whole file as a string:
  ```rust
  let raw = fs::read_to_string(&file_path).map_err(|e| AppError::new(e.to_string()))?;
  let json_val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| AppError::new(e.to_string()))?;
  ```
* **Data Import Chunking**: In `src-tauri/src/commands/backup_import.rs` (lines 62–65 and 114–117), chunks are bulk-inserted in batches of 1000.
* **CSV Type Parsing**: In `src-tauri/src/commands/backup_import.rs` (lines 40–54), CSV values are parsed sequentially using standard type matching:
  ```rust
  if raw_str.is_empty() || raw_str.to_uppercase() == "NULL" {
      val = serde_json::Value::Null;
  } else if let Ok(i) = raw_str.parse::<i64>() {
      val = serde_json::Value::Number(i.into());
  } else if let Ok(f) = raw_str.parse::<f64>() {
      // ...
  } else if let Ok(b) = raw_str.parse::<bool>() {
      val = serde_json::Value::Bool(b);
  }
  ```

### Database Snapshot (Backup/Restore)
* **MongoDB Backup Format**: In `src-tauri/src/drivers/mongo.rs` (line 724), records are dumped in standard shell insert style:
  ```rust
  dump.push_str(&format!("db.{}.insert({});\n", table, json));
  ```
* **MongoDB Query Parsing**: In `src-tauri/src/drivers/mongo.rs` (lines 338–367), `parse_mql` only matches `"countDocuments" | "count"` and `"find" | "findOne"`. Any method name like `"insert"` falls through to the catch-all:
  ```rust
  _ => Err(unsupported()),
  ```
* **Silent Swallowing in Restore**: In `src-tauri/src/commands/backup_import.rs` (lines 175–178), query errors are swallowed:
  ```rust
  if !sql.is_empty() {
      // Execute statement
      let _ = driver.run_query(sql).await;
  }
  ```
* **Single-String Dump Aggregation**: In `src-tauri/src/drivers/postgres.rs` (lines 384–425) and `src-tauri/src/drivers/mysql.rs` (lines 332–380), the entire dump is stored in a single Rust `String`.

### SQL Console Statement Splitting
* **Split Search in Editor**: In `src/features/sql-console/SqlConsoleShell.tsx` (lines 369–385), statement boundaries are located via character search for `";"`:
  ```typescript
  // Find the semicolon before the cursor
  let from = 0;
  for (let i = cursor - 1; i >= 0; i--) {
    if (doc[i] === ";") {
      from = i + 1;
      break;
    }
  }
  // Find the semicolon after the cursor
  let to = doc.length;
  for (let i = cursor; i < doc.length; i++) {
    if (doc[i] === ";") {
      to = i;
      break;
    }
  }
  ```
* **Empty Split Fallback**: In `src/features/sql-console/SqlConsoleShell.tsx` (lines 387–390), an empty slice results in executing the entire buffer:
  ```typescript
  const statement = doc.slice(from, to).trim();
  if (statement) return statement;

  return currentQuery.trim();
  ```

---

## 2. Logic Chain

The following chains of logic derive conclusions directly from the observations:

### Postgres Multi-Schema Support
1. Selecting a schema in the `SchemaTree.tsx` calls `selectSchema` in `useSchema.ts`.
2. `selectSchema` only mutates the Zustand store `selectedSchema` state. It does *not* invoke any backend command.
3. Therefore, the connection pool (`sqlx::PgPool`) on the backend driver remains pointing to `"public"` (the initial state defined in `mod.rs:connect`).
4. Additionally, since the connection pool manages connections dynamically, executing a temporary command like `SET search_path` does not guarantee persistence for subsequent queries using different pool connections.
5. In `useSchema.ts`, table data queries (`SELECT * FROM "${table}"`) are constructed without schema prefixes.
6. Thus, queries on non-public schemas either fail to find the table or query tables in the wrong schema (i.e. `"public"`).

### Batch Edits
1. The frontend processes updates by appending a separate element to the `updates` array for every modified cell (e.g. if cell `A` and `B` on row `1` are dirty, two update inputs are generated).
2. The backend loops through these inputs and runs a distinct database query per cell change. This creates unnecessary overhead and query planning latency.
3. If a primary key (e.g., `id`) is edited alongside other columns in the same row, the statement updating the `id` executes first. The subsequent statements target the old primary key value, causing them to update `0` rows and silently lose those cell changes.
4. Tables lacking a primary key allow cell edits in the UI, but because of the `if (!primaryKey) return` check in `handleSaveBatch`, all updates/deletes are silently dropped without alerting the user.
5. Simple single-quote doubling (`s.replace('\'', "''")`) in MySQL is bypassed if a user input ends with a backslash `\`. The backslash escapes the first single-quote of the doubled sequence, leaving the second quote to close the string literal, introducing a critical SQL injection vulnerability.

### Data Import
1. In `import_json_data`, the file is read in full via `fs::read_to_string`. For files containing hundreds of megabytes of JSON records, this will easily consume gigabytes of heap memory and trigger an Out Of Memory (OOM) crash of the Tauri binary.
2. In `import_csv_data` and `import_json_data`, the records are bulk-inserted in batches of 1000. If batch `N` fails, the preceding batches `1..N-1` remain committed to the database. The system outputs a generic error, does not rollback, and fails to tell the user which rows were written, creating corrupted/duplicated datasets.
3. CSV column parsing tries to cast cell text dynamically.
   - Text values like `"00123"` (e.g. zip codes, padding IDs) get converted to numbers (`123`), stripping critical formatting.
   - Booleans like `"1"`, `"0"`, or `"Y"` are not parsed as boolean values, leading to cast errors in Postgres.
   - Empty CSV fields are parsed as `Value::Null`. If the destination field is a non-nullable string (`VARCHAR NOT NULL`), the insertion fails.
4. Schema Tree parameters are omitted in the schema descriptions for both import endpoints, which breaks table inspection if importing into a table inside a non-public PostgreSQL schema.

### Database Snapshot (Backup/Restore)
1. The MongoDB backup generator saves documents to a file in standard insert command format: `db.collection.insert({...})`.
2. When restoring, the file is parsed by line and each command is sent to `run_query` (MQL executor).
3. The MQL parser rejects the `.insert(...)` command as unsupported because it only handles `find` and `countDocuments`.
4. The restore endpoint swallows all query errors with `let _ = ...;`.
5. Therefore, restoring a MongoDB database backup silently skips all insert statements, imports `0` records, and reports a false success (`Ok(())`).
6. Because `DROP TABLE IF EXISTS` is never emitted during backup creation, restoring SQL backups on pre-existing tables triggers errors (which are silently swallowed), resulting in massive duplicate data entries or silent PK conflicts.
7. Generating logical dumps stores the entire database contents in a single Rust `String` variable in memory, leading to severe resource limitations or process failure on large datasets.

### SQL Console Statement Splitting
1. The statement extractor checks every semicolon `";"` position regardless of context.
2. If a query contains a semicolon inside a text string (`'John; Doe'`), double-quoted table, comment, or within a stored procedure's dollar-quoted block (`$$ BEGIN ... END; $$`), the splitter will treat it as a statement boundary.
3. This divides a single query into disjointed syntax fragments, producing syntax errors when run.
4. If the cursor is positioned on an empty line or at the end of the text editor, the extracted query is empty. The parser falls back to executing the entire text buffer, which triggers errors in MySQL (where multi-statements are blocked by default) or executes unintended DML queries located in the same file.

---

## 3. Caveats

* **Active Frontend Test Coverage**: There is currently no automated frontend test runner configured. The observations are derived from structural code path tracing and manual verification of Zustand store interactions.
* **PostgreSQL Standard Conforming Strings**: Modern PostgreSQL versions enable `standard_conforming_strings` by default, protecting it from backslash escaping. If standard conforming strings is disabled in Postgres, the SQL literal doubling vulnerability seen in MySQL would also affect PostgreSQL.

---

## 4. Conclusion

The assessment identifies critical architectural issues across the reviewed features:
1. **Broken Postgres Schemas**: Selecting schemas only mutates local state. Direct queries use un-qualified table names and fail on non-public schemas.
2. **Batch Edits Vulnerabilities & Inefficiencies**: MySQL single-quote escaping is vulnerable to SQL injection via backslash suffixing. Updates are ran in separate database roundtrips. Tables without primary keys silently discard updates.
3. **Data Import Unreliability**: JSON import parses files in-memory without streaming. Partially failed imports leave orphan, non-rollback records. Naive CSV guessing strips leading zeros and breaks on type boundaries.
4. **Broken MongoDB Backup/Restore**: MongoDB snapshots are generated with `.insert()` but restored using a reader that only supports `find` / `count`. Restoring any database swallows all errors and falsely reports success.
5. **Brittle Statement Splitting**: Character-based semicolon splitting splits SQL queries inside strings, comments, and stored procedures, triggering syntax errors.

---

## 5. Verification Method

### Test Executions
* **Rust Backend Tests**: To run unit tests, navigate to the `src-tauri` directory and execute:
  ```bash
  cd src-tauri
  cargo test
  ```
* **Postgres Live Driver Integration Verification**: To check live Postgres capabilities (using docker/local postgres), execute:
  ```bash
  TOOLSQL_TEST_PG=1 cargo test postgres_live -- --nocapture
  ```

### Key Areas to Inspect
* **Postgres schema-qualification check**: Inspect `src/hooks/useSchema.ts` (lines 160–166) to verify that queries do not inject schema names.
* **Swallowed errors during restore**: Inspect `src-tauri/src/commands/backup_import.rs` (lines 175–178) to verify the presence of `let _ = driver.run_query(sql).await`.
* **String-interpolation security**: Inspect `src-tauri/src/drivers/mysql.rs` (lines 395–397) to see the simple string replacement for quotes.
* **MQL parsing constraints**: Inspect `src-tauri/src/drivers/mongo.rs` (lines 338–368) to verify that the only allowed method targets are `countDocuments`/`count` and `find`/`findOne`.
* **SQL console splitting logic**: Inspect `src/features/sql-console/SqlConsoleShell.tsx` (lines 356–391) to observe the loop looking for `";"` without context or token scanning.

---

## 6. Detailed Recommendations

### Postgres Multi-Schema Support
* **Invoke switch command in frontend**: Modify `selectSchema` in `src/hooks/useSchema.ts` (line 46) to call the backend switch command:
  ```typescript
  const selectSchema = async (schemaName: string) => {
    const connId = useConnectionStore.getState().activeConnectionId;
    if (connId) {
      await invoke("switch_mongo_db", { connId, dbName: schemaName });
    }
    useSchemaStore.getState().setSelectedSchema(schemaName);
    if (connId) {
      await loadTables(connId);
    }
  };
  ```
* **Qualify table names**: Update `loadTableData` in `src/hooks/useSchema.ts` (line 164) to format queries with the active schema name:
  ```typescript
  const schema = useSchemaStore.getState().selectedSchema || "public";
  const sql = `SELECT * FROM "${schema}"."${table}"${whereClause}${orderClause} LIMIT ${pageSize} OFFSET ${page * pageSize}`;
  ```
* **Rename switch command**: Rename `switch_mongo_db` in `src-tauri/src/commands/connection.rs` (line 135) to a database-agnostic name like `switch_active_database_or_schema`.

### Batch Edits
* **Group updates by row**: Modify `handleSaveBatch` in `src/features/object-view/DataGridShell.tsx` (line 753) to group column changes by `rowIndex` / `pkValue` before submitting. Combine multiple column edits on the same row into a single database update statement in the backend driver's `apply_batch_edits` function.
* **Disable double-click edits for tables without PK**: Inspect if the table has a primary key before starting editing in `DataGridCell.tsx` (line 107). Throw a toast warning to the user if they try to edit a cell on a table that lacks a PK:
  ```typescript
  const handleDoubleClick = useCallback(() => {
    if (!primaryKey) {
      toast("Edits are not supported for tables without primary keys", "error");
      return;
    }
    if (!isPrimaryKey) {
      startEditing(rowIndex, column);
    }
  }, [isPrimaryKey, primaryKey, rowIndex, column, startEditing]);
  ```
* **Parameterized queries inside Drivers**: Replace raw string interpolation in `postgres.rs` (lines 270–300) and `mysql.rs` (lines 221–250) with parameterized bindings (e.g. `sqlx::query("UPDATE ... SET col = $1 WHERE id = $2").bind(val).bind(id)`).

### Data Import
* **JSON Streaming**: In `src-tauri/src/commands/backup_import.rs` (line 83), replace `fs::read_to_string` with `std::io::BufReader` and a streaming json parser (like `serde_json::Deserializer::from_reader`) to prevent loading massive JSON files completely in-memory.
* **Wrap bulk imports in a single transaction**: In `import_csv_data` and `import_json_data` (in `backup_import.rs`), check out a single database transaction at the start and commit it only after all chunks have been processed. If any chunk fails, roll back the transaction so the import is atomic.
* **Schema-aware type parsing**: Pass the column types mapping (which can be fetched using `describe_table`) to the data parser, and parse values according to the target column datatype instead of using generic string-based guessing. Do not parse leading-zero strings as numbers unless the destination column is numeric.

### Database Snapshot (Backup/Restore)
* **Fix MongoDB Restore**: Implement `MqlOp::Insert` inside `parse_mql` (in `mongo.rs` line 330) and `run_mql` (line 25) to parse and execute `.insert()` commands correctly.
* **Propagate errors on restore**: Change `restore_database_backup` in `backup_import.rs` (line 176) to bubble up errors returned by query execution:
  ```rust
  if !sql.is_empty() {
      driver.run_query(sql).await?;
  }
  ```
* **Add Drop Statements**: Add `DROP TABLE IF EXISTS "tableName";` (or equivalent) in `generate_logical_dump` before each table creation to clear existing structures and prevent duplicate rows / PK collisions.
* **Stream backups directly to file**: Modify logical dump generation to receive a file descriptor and stream table queries (using `sqlx::query(...).fetch(...)` to stream rows) directly to disk instead of constructing one large string in memory.

### SQL Console Statement Splitting
* **Use SQL token scanning for splitting**: Replace the raw character loop in `getQueryToRun` in `SqlConsoleShell.tsx` (lines 369–385) with a basic parser that tracks string delimiters (`'`, `"`), comments (`--`, `/*`), and dollar-quotes (`$$`), ignoring any semicolons found within them.
* **Prevent dangerous fallback**: Instead of falling back to running the entire buffer when `statement` is empty, return an error or do nothing if the cursor is not placed on a valid query statement.
