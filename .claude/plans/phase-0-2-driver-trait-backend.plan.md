# Plan: Phase 0.2 — Driver-trait backend foundation

**Source:** `docs/ROADMAP.md` Phase 0.2 + `CLAUDE.md` "Target Architecture". User: "make a clear plan for the first phase."
**Complexity:** Large

## Goal
Replace the `DbConnection` enum (matched per-command) with a `Driver` trait: one impl per engine (`drivers/{postgres,mysql,mongo}.rs`) returning a normalized model, a single `connect()` factory that is the only place matching on engine, and thin Tauri commands that just fetch a driver and call a trait method. **Done when:** all three engines implement `Driver`, `commands/{connection,schema,query}.rs` contain zero `match engine {…}` branching, and `cargo check` + `cargo test` pass.

## Scope boundary (read before executing)
- **In scope:** `Driver` trait + 3 driver impls + factory; normalized model types; new `AppState` registry of `Arc<dyn Driver>`; rewrite of the **read/connect foundation** commands only: `connection.rs`, `schema.rs`, `query.rs` (`run_query` + connect/test/disconnect/list/switch-db); `lib.rs` + `commands/mod.rs` plumbing.
- **Deferred to their roadmap phases (REMOVED from compilation in this plan, files kept on disk as reference):**
  - `commands/ai.rs` → Phase 4 · `mcp/` → Phase 5 · `commands/audit.rs` → Phase 5
  - `commands/saved_queries.rs`, `commands/settings.rs` → re-add when the new frontend needs them (Phase 1+)
  - MongoDB document-CRUD + `query_collection` in `query.rs` (`insert_document`, `update_document`, `delete_document`, `replace_document`, `query_collection`) → Phase 2/3 (will become `Driver` methods then)
- These deferrals mean the compiled backend temporarily exposes **only** connect/schema/query. That is intentional for a foundation phase and matches the roadmap ordering. **Flagged for approval at the gate.**
- Old enum-based bodies are **ported, not redesigned**: SQL strings and row→JSON conversion move verbatim into the drivers.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Error type | `src-tauri/src/error.rs:1-22` | `AppError(String)`, `Serialize`, `AppError::new`, `From<sqlx::Error>` / `From<mongodb::error::Error>` |
| Lock-then-clone-before-await | `commands/query.rs:36-49`, `schema.rs:38-51` | Lock mutex, clone the handle out, drop guard, then `.await`. Keep this exact discipline. |
| Connect helpers | `src-tauri/src/db/mod.rs:1-18` | Reuse `db::connect_postgres/mysql/mongo` inside the factory — do not reinvent connection logic |
| PG row→JSON | `commands/query.rs:63-86` | Port the `try_get` type-ladder verbatim into `PostgresDriver::run_query` |
| MySQL row→JSON | `commands/query.rs:101-118` | Port verbatim into `MysqlDriver::run_query` |
| Mongo docs→result | `commands/query.rs:174-247` (`parse_mongo_select` + `run_mongo_query` + `docs_to_query_result`) | Port verbatim into `MongoDriver::run_query` |
| Schema SQL (PG/MySQL/Mongo) | `commands/schema.rs:55-278` | Port the exact `list_databases`/`list_tables`/`describe_table`/`list_indexes` bodies into each driver |
| Result/DTO shapes | `query.rs:11-16`, `schema.rs:9-28` | Keep `QueryResult`, `TableInfo`, `ColumnInfo`, `IndexInfo` field names identical so the (future) frontend types are stable |
| Connection commands | `commands/connection.rs:47-216` | Persist commands (`save/load/delete`) unchanged; only `connect`/`test_connection`/`switch_mongo_db` change to use the factory/driver |
| Object-safe async trait | `CLAUDE.md` "Target Architecture" (says "async_trait or boxed futures") | Use the `async-trait` crate |

> **Tests:** the Rust crate currently has **no tests** (none in `src-tauri/src`). This plan adds one unit test (factory rejects unknown engine) as the first real backend test. No live-DB tests (they'd need a running server).

## Files to Change
| File | Action | Why |
|---|---|---|
| `src-tauri/Cargo.toml` | MODIFY | Add `async-trait = "0.1"` dependency |
| `src-tauri/src/model.rs` | CREATE | Normalized DTOs: `QueryResult`, `TableInfo`, `ColumnInfo`, `IndexInfo`, `ConnectionConfig`, `ConnectionMeta` (moved from command files to break the state↔command cycle) |
| `src-tauri/src/drivers/mod.rs` | CREATE | `Driver` trait + `connect()` factory (only engine `match`) + factory unit test |
| `src-tauri/src/drivers/postgres.rs` | CREATE | `PostgresDriver` impl (ports PG bodies) |
| `src-tauri/src/drivers/mysql.rs` | CREATE | `MysqlDriver` impl (ports MySQL bodies) |
| `src-tauri/src/drivers/mongo.rs` | CREATE | `MongoDriver` impl (ports Mongo bodies; holds switchable db) |
| `src-tauri/src/state.rs` | MODIFY | Registry of `Arc<dyn Driver>` + `driver(id)` accessor |
| `src-tauri/src/commands/connection.rs` | MODIFY | Use factory; persist commands unchanged; drop enum imports |
| `src-tauri/src/commands/schema.rs` | MODIFY | Thin: fetch driver, call trait method (no engine `match`) |
| `src-tauri/src/commands/query.rs` | MODIFY | Thin `run_query` only; remove Mongo doc-CRUD/`query_collection` (deferred) |
| `src-tauri/src/commands/mod.rs` | MODIFY | Declare only `connection`, `schema`, `query` |
| `src-tauri/src/lib.rs` | MODIFY | Declare `model`+`drivers`, drop `mcp`; register only foundation commands; remove MCP spawn |

---

## Tasks

> **Order matters.** Tasks 1–3 keep the old code compiling (additive). Task 7 is the **atomic cutover** (state + commands + lib together) — it is one task because state and commands are mutually dependent through the enum; splitting it would leave the crate non-compiling mid-task.

### Task 1: Add `async-trait` dependency
**Files:** Modify `src-tauri/Cargo.toml`
**Mirror:** existing `[dependencies]` block (`Cargo.toml:` deps list).
- [ ] Step 1: In `[dependencies]`, add: `async-trait = "0.1"`
- [ ] Verify: `cd src-tauri && cargo fetch` → exit 0 (resolves the crate). `cargo check` → still compiles (old code untouched).

### Task 2: Normalized model
**Files:** Create `src-tauri/src/model.rs`; Modify `src-tauri/src/lib.rs` (add `mod model;`)
**Mirror:** field names from `query.rs:11-16` and `schema.rs:9-28`; `ConnectionConfig`/`ConnectionMeta` from `connection.rs:14-35`.
- [ ] Step 1: Create `model.rs`:
```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Value>,
    pub rows_affected: Option<u64>,
}

#[derive(Serialize)]
pub struct TableInfo {
    pub name: String,
}

#[derive(Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub is_pk: bool,
}

#[derive(Serialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: String,
    pub is_unique: bool,
    pub index_type: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub connection_string: String,
}

#[derive(Serialize, Clone)]
pub struct ConnectionMeta {
    pub id: String,
    pub name: String,
    pub db_type: String,
}
```
- [ ] Step 2: In `lib.rs`, add `mod model;` near the other `mod` declarations.
- [ ] Verify: `cd src-tauri && cargo check` → exit 0 (unused-warning on new types is fine).

### Task 3: `Driver` trait, factory, and the three driver impls
**Files:** Create `drivers/mod.rs`, `drivers/postgres.rs`, `drivers/mysql.rs`, `drivers/mongo.rs`; Modify `lib.rs` (add `mod drivers;`)
**Mirror:** connect helpers `db/mod.rs:1-18`; all ported bodies per the Patterns table. **This task is additive — drivers reference only `model`, `error`, `db`, sqlx, mongodb; nothing references the drivers yet, so the crate still compiles with the old enum in place.**
- [ ] Step 1: `drivers/mod.rs` — trait + factory + test:
```rust
pub mod postgres;
pub mod mysql;
pub mod mongo;

use std::sync::Arc;
use async_trait::async_trait;

use crate::db;
use crate::error::AppError;
use crate::model::{ColumnInfo, ConnectionConfig, IndexInfo, QueryResult, TableInfo};

#[async_trait]
pub trait Driver: Send + Sync {
    async fn ping(&self) -> Result<(), AppError>;
    async fn list_databases(&self) -> Result<Vec<String>, AppError>;
    async fn list_tables(&self) -> Result<Vec<TableInfo>, AppError>;
    async fn describe_table(&self, table: &str) -> Result<Vec<ColumnInfo>, AppError>;
    async fn list_indexes(&self, table: &str) -> Result<Vec<IndexInfo>, AppError>;
    async fn run_query(&self, sql: &str) -> Result<QueryResult, AppError>;
    /// MongoDB only: switch the browsed database. Default: unsupported.
    async fn set_database(&self, _db: &str) -> Result<(), AppError> {
        Err(AppError::new("set_database is not supported for this engine"))
    }
}

/// The ONLY place that matches on engine type.
pub async fn connect(config: &ConnectionConfig) -> Result<Arc<dyn Driver>, AppError> {
    match config.db_type.as_str() {
        "postgres" => {
            let url = format!(
                "postgres://{}:{}@{}:{}/{}",
                config.username, config.password, config.host, config.port, config.database
            );
            Ok(Arc::new(postgres::PostgresDriver { pool: db::connect_postgres(&url).await? }))
        }
        "mysql" => {
            let url = format!(
                "mysql://{}:{}@{}:{}/{}",
                config.username, config.password, config.host, config.port, config.database
            );
            Ok(Arc::new(mysql::MysqlDriver { pool: db::connect_mysql(&url).await? }))
        }
        "mongodb" => {
            if config.connection_string.is_empty() {
                return Err(AppError::new("MongoDB requires a connection string"));
            }
            let client = db::connect_mongo(&config.connection_string).await?;
            let initial = if config.database.is_empty() { "test".to_string() } else { config.database.clone() };
            Ok(Arc::new(mongo::MongoDriver::new(client, initial)))
        }
        t => Err(AppError::new(format!("Unsupported db type: {t}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connect_rejects_unknown_engine() {
        let cfg = ConnectionConfig {
            id: "x".into(), name: "x".into(), db_type: "sqlite".into(),
            host: String::new(), port: 0, database: String::new(),
            username: String::new(), password: String::new(), connection_string: String::new(),
        };
        let err = connect(&cfg).await.unwrap_err();
        assert!(err.0.contains("Unsupported db type"));
    }
}
```
- [ ] Step 2: `drivers/postgres.rs` — `pub struct PostgresDriver { pub pool: sqlx::PgPool }`, `#[async_trait] impl Driver`. `ping` = `sqlx::query("SELECT 1").execute(&self.pool).await?; Ok(())`. `list_databases` → `Ok(vec![])` (per `schema.rs:61`). `list_tables`/`describe_table`/`list_indexes` → **port the PG `sqlx::query_as` blocks verbatim** from `schema.rs:83-92`, `121-146`, `210-226` (swap `&pool` for `&self.pool`). `run_query` → **port `run_pg_query` verbatim** from `query.rs:53-87` (including `is_select`, copy that helper into this file).
- [ ] Step 3: `drivers/mysql.rs` — `pub struct MysqlDriver { pub pool: sqlx::MySqlPool }`. `ping` = `SELECT 1`. `list_databases` → `Ok(vec![])`. Port MySQL blocks from `schema.rs:93-98`, `147-163`, `227-244`; `run_query` ports `run_mysql_query` from `query.rs:91-119`.
- [ ] Step 4: `drivers/mongo.rs`:
```rust
use std::sync::RwLock;
// struct holds a switchable current-db behind interior mutability
pub struct MongoDriver {
    client: mongodb::Client,
    db: RwLock<String>,
}
impl MongoDriver {
    pub fn new(client: mongodb::Client, db: String) -> Self { Self { client, db: RwLock::new(db) } }
    fn current_db(&self) -> String { self.db.read().unwrap().clone() }
}
```
Then `#[async_trait] impl Driver for MongoDriver`:
  - `ping`: `self.client.list_database_names().await.map(|_| ()).map_err(|e| AppError::new(e.to_string()))`
  - `set_database`: `*self.db.write().unwrap() = db.to_string(); Ok(())`
  - `list_databases`: port `schema.rs:62-71` (read `self.client`).
  - `list_tables`: port `schema.rs:99-108` using `self.current_db()`.
  - `describe_table`: port `schema.rs:164-197` using `self.current_db()`.
  - `list_indexes`: port `schema.rs:245-276` using `self.current_db()`.
  - `run_query`: port `parse_mongo_select` (`query.rs:133-172`), `run_mongo_query` (`query.rs:174-247`) and `docs_to_query_result` (`query.rs:251-287`) into this file; call with `&self.client` and `&self.current_db()`.
- [ ] Step 5: In `lib.rs`, add `mod drivers;`.
- [ ] Verify: `cd src-tauri && cargo check` → exit 0; `cargo test connect_rejects_unknown_engine -- --nocapture` → 1 passed. (Old enum code still compiles alongside.)

### Task 4: (folded) — covered by Task 3 driver bodies. No separate task.
### Task 5: (folded) — covered by Task 3. No separate task.
### Task 6: (folded) — covered by Task 3. No separate task.

### Task 7: Atomic cutover — state, foundation commands, lib wiring
**Files:** Modify `state.rs`, `commands/connection.rs`, `commands/schema.rs`, `commands/query.rs`, `commands/mod.rs`, `lib.rs`
**Mirror:** lock-then-clone discipline (`query.rs:36-49`); persist commands kept as-is (`connection.rs:37-91`). **Single task because state and commands are mutually dependent through the old enum — the crate compiles again only once all are switched.**
- [ ] Step 1: Rewrite `state.rs`:
```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::drivers::Driver;
use crate::error::AppError;
use crate::model::ConnectionMeta;

pub struct ConnectionHandle {
    pub meta: ConnectionMeta,
    pub driver: Arc<dyn Driver>,
}

#[derive(Clone)]
pub struct AppState {
    pub connections: Arc<Mutex<HashMap<String, ConnectionHandle>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self { connections: Arc::new(Mutex::new(HashMap::new())) }
    }
    /// Lock, clone the Arc out, drop the guard — never hold the lock across .await.
    pub fn driver(&self, conn_id: &str) -> Result<Arc<dyn Driver>, AppError> {
        let conns = self.connections.lock().unwrap();
        conns.get(conn_id).map(|h| h.driver.clone())
            .ok_or_else(|| AppError::new("Connection not found"))
    }
}
```
- [ ] Step 2: Rewrite `commands/connection.rs`: keep `config_path`, `save_connection`, `load_saved_connections`, `delete_saved_connection`, `new_id` **unchanged** but import `ConnectionConfig`/`ConnectionMeta` from `crate::model` (delete the local struct defs at `connection.rs:14-35`). Replace session commands:
```rust
use std::sync::Arc;
use tauri::State;
use crate::{drivers, error::AppError, model::{ConnectionConfig, ConnectionMeta}, state::{AppState, ConnectionHandle}};

#[tauri::command]
pub async fn connect(config: ConnectionConfig, state: State<'_, AppState>) -> Result<ConnectionMeta, AppError> {
    let driver = drivers::connect(&config).await?;
    let meta = ConnectionMeta { id: config.id.clone(), name: config.name.clone(), db_type: config.db_type.clone() };
    state.connections.lock().unwrap().insert(config.id.clone(), ConnectionHandle { meta: meta.clone(), driver });
    Ok(meta)
}

#[tauri::command]
pub async fn test_connection(config: ConnectionConfig) -> Result<bool, AppError> {
    let driver = drivers::connect(&config).await?;
    driver.ping().await?;
    Ok(true)
}

#[tauri::command]
pub async fn switch_mongo_db(conn_id: String, db_name: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let driver = state.driver(&conn_id)?;
    driver.set_database(&db_name).await
}

#[tauri::command]
pub async fn disconnect(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.connections.lock().unwrap().remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn list_connections(state: State<'_, AppState>) -> Result<Vec<ConnectionMeta>, AppError> {
    let conns = state.connections.lock().unwrap();
    Ok(conns.values().map(|h| h.meta.clone()).collect())
}
```
(keep the `Arc` import only if used; drop unused imports to satisfy the build.)
- [ ] Step 3: Rewrite `commands/schema.rs` to thin commands (delete `AnyConn`/`get_conn` and the per-engine `match` blocks; delete local DTO defs, import from `crate::model`):
```rust
use tauri::State;
use crate::{error::AppError, model::{ColumnInfo, IndexInfo, TableInfo}, state::AppState};

#[tauri::command]
pub async fn list_databases(conn_id: String, state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    state.driver(&conn_id)?.list_databases().await
}
#[tauri::command]
pub async fn list_tables(conn_id: String, state: State<'_, AppState>) -> Result<Vec<TableInfo>, AppError> {
    state.driver(&conn_id)?.list_tables().await
}
#[tauri::command]
pub async fn describe_table(conn_id: String, table: String, state: State<'_, AppState>) -> Result<Vec<ColumnInfo>, AppError> {
    state.driver(&conn_id)?.describe_table(&table).await
}
#[tauri::command]
pub async fn list_indexes(conn_id: String, table: String, state: State<'_, AppState>) -> Result<Vec<IndexInfo>, AppError> {
    state.driver(&conn_id)?.list_indexes(&table).await
}
```
- [ ] Step 4: Rewrite `commands/query.rs` to only `run_query` (delete `AnyPool`/`get_pool`, all `run_*_query`/`parse_mongo_select`/`docs_to_query_result` — now in drivers — and the deferred doc-CRUD/`query_collection` commands):
```rust
use tauri::State;
use crate::{error::AppError, model::QueryResult, state::AppState};

#[tauri::command]
pub async fn run_query(conn_id: String, sql: String, state: State<'_, AppState>) -> Result<QueryResult, AppError> {
    state.driver(&conn_id)?.run_query(&sql).await
}
```
- [ ] Step 5: Rewrite `commands/mod.rs` to declare only the foundation modules:
```rust
pub mod connection;
pub mod schema;
pub mod query;
```
- [ ] Step 6: Rewrite `lib.rs`: declarations `mod commands; mod db; mod drivers; mod error; mod model; mod state;` (remove `mod mcp;`). Remove the MCP `setup`/spawn block. Register only:
```rust
.invoke_handler(tauri::generate_handler![
    commands::connection::save_connection,
    commands::connection::load_saved_connections,
    commands::connection::delete_saved_connection,
    commands::connection::connect,
    commands::connection::test_connection,
    commands::connection::disconnect,
    commands::connection::list_connections,
    commands::connection::switch_mongo_db,
    commands::schema::list_databases,
    commands::schema::list_tables,
    commands::schema::describe_table,
    commands::schema::list_indexes,
    commands::query::run_query,
])
```
Keep the `tauri_plugin_opener`/`tauri_plugin_dialog` plugins and `AppState::new()` management.
- [ ] Verify: `cd src-tauri && cargo check` → exit 0 with **no `match … db_type`/enum dispatch remaining in `commands/`**; `cargo test` → all pass (the factory test). Confirm with `rg "DbConnection|AnyPool|AnyConn" src/commands src/state.rs` → **no matches**.

## Validation
```bash
cd src-tauri
cargo check        # exit 0 — whole crate compiles on the new trait
cargo test         # exit 0 — factory unit test passes
cargo clippy 2>/dev/null || true   # optional; not required to pass
# Architecture invariant — must print nothing:
rg -n "DbConnection|AnyPool|AnyConn|match .*db_type" src/commands src/state.rs src/lib.rs | grep -v "drivers/" || echo "OK: no engine branching in commands"
```
Manual smoke (optional, needs a live DB): `bun run tauri dev`, then from the frontend call `connect` + `list_tables` against a real Postgres — expect tables back. (Old frontend may not fully work since AI/MCP commands were deregistered; that is expected and covered by Phase 1's UI wiring.)

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| `async-trait` + `Arc<dyn Driver>` object-safety error | Low | Trait methods take `&self` and return owned types — object-safe. `async-trait` boxes futures. Test compiles in Task 3. |
| MongoDB `set_database` after connect not reflected (driver immutable in `Arc`) | Medium | `MongoDriver` holds `RwLock<String>`; every read uses `current_db()`. Verified by `switch_mongo_db` path. |
| Deregistering AI/MCP/audit/saved/settings breaks the **old** frontend | High (but intended) | Old frontend is reference-only and being replaced by the UI-shell (Phase 0.1). Deferral is explicit in scope + flagged at gate. Files stay on disk. |
| Mid-cutover non-compiling crate confuses `/execute` | Medium | Task 7 is atomic (single verify after all 6 file edits); Tasks 1–3 are additive and each green. Do them in order. |
| Ported `try_get` type-ladder loses a column type during the move | Low | Port verbatim by line range; do not edit the ladder. Diff against `query.rs` originals if a column reads NULL unexpectedly. |
| Unused-import / dead-code warnings after deletes | Medium | Remove imports the rewrites orphan (e.g. `serde_json`, `sqlx::Row` in the now-thin command files). `cargo check` surfaces them. |

## Acceptance ("done" criteria for /execute)
- [ ] All tasks complete (Tasks 4–6 folded into Task 3)
- [ ] `cargo check` and `cargo test` pass
- [ ] `Driver` trait implemented by all 3 engines; factory is the only engine `match`
- [ ] `rg "DbConnection|AnyPool|AnyConn" src/commands src/state.rs` → no matches
- [ ] Ported SQL / row-conversion bodies are byte-for-byte the originals (no behavior change)
- [ ] Deferred files remain on disk, are not declared as modules, and are not in `generate_handler!`
- [ ] No change beyond the listed scope
```
