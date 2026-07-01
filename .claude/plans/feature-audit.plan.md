# Plan: Feature Audit & Inventory

**Source:** Task "check feature and list it" — survey every implemented feature in tool-sql
**Complexity:** Small (read-only — no code changes)

## Goal

Traverse the live source tree, catalogue every implemented (or partially implemented) feature
organized by area, and write the inventory to `docs/FEATURES.md`.
Success: `docs/FEATURES.md` exists and accurately maps all Tauri commands, Driver trait methods,
MCP tools, and frontend capabilities back to their source files.

---

## Patterns to Mirror

| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Doc location | `docs/` (stale, but still the docs folder) | Write new docs to `docs/` |
| Feature grouping | `src-tauri/src/commands/mod.rs:1-6` | Group by domain: connection, schema, query, ai, saved_queries, settings, audit |
| Type refs | `src-tauri/src/model.rs` | Reference normalized model types by their Rust names |
| No inventions | `CLAUDE.md` | `docs/` is stale — do not re-use old content; write fresh |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/FEATURES.md` | CREATE | Deliverable: structured feature inventory |

---

## Tasks

### Task 1: Audit Backend (Rust/Tauri)

**Files:** Read `src-tauri/src/` tree — no writes
**Mirror:** new — no existing feature-audit doc exists

- [x] Step 1: Driver trait (`drivers/mod.rs:13-23`) — list all 7 methods:
  - `ping`, `list_databases`, `list_tables`, `describe_table`, `list_indexes`, `run_query`, `set_database` (MongoDB-only default impl)

- [x] Step 2: Engine implementations — note status per engine:
  - `drivers/postgres.rs` — PostgreSQL via sqlx
  - `drivers/mysql.rs` — MySQL via sqlx
  - `drivers/mongo.rs` — MongoDB 3.x (includes `set_database`)

- [x] Step 3: Commands by domain:

  **connection** (`commands/connection.rs`):
  - `save_connection` — upsert config to `connections.json`
  - `load_saved_connections` — read all saved configs
  - `delete_saved_connection` — remove by id
  - `connect` — open live session, register driver in `AppState`
  - `test_connection` — connect + ping, no state change
  - `switch_mongo_db` — change active database on MongoDB session
  - `disconnect` — remove active session
  - `list_connections` — list active sessions

  **schema** (`commands/schema.rs`):
  - `list_databases`
  - `list_tables`
  - `describe_table` → `Vec<ColumnInfo>`
  - `list_indexes` → `Vec<IndexInfo>`

  **query** (`commands/query.rs`):
  - `run_query` → `QueryResult { columns, rows, rows_affected }`

  **ai** (`commands/ai.rs`):
  - `generate_sql` — NL → SQL (strips accidental fences)
  - `explain_sql` — explain + optimization hints
  - `generate_filters` — NL → JSON `[{column, operator, value}]`
  - `complete_sql` — cursor-position autocomplete
  - `check_ollama` — health check (3 s timeout)
  - Multi-backend dispatch: `claude-api` | `openai` | `ollama`

  **saved_queries** (`commands/saved_queries.rs`):
  - `list_saved_queries`, `create_saved_query`, `delete_saved_query`, `update_saved_query`
  - Storage: `~/.config/tool-sql/saved_queries.json`

  **settings** (`commands/settings.rs`):
  - `load_settings`, `save_settings`
  - `save_to_file` — write arbitrary content to a FS path (export)
  - Fields: `claude_api_key`, `ai_backend`, `openai_api_key/base_url/model`,
    `ollama_model/url`, `mcp_port` (default 3456), `mcp_read_only` (default true),
    `ui_scale` (default 1.3)

  **audit** (`commands/audit.rs`):
  - `get_audit_log` — last N entries from `audit.jsonl` (default 200)
  - `export_audit_log` — full log as CSV string

- [x] Step 4: MCP Server (`mcp/mod.rs`, `mcp/tools.rs`, `mcp/audit.rs`):
  - JSON-RPC 2.0 over TCP (`127.0.0.1:{mcp_port}`)
  - Protocol methods: `initialize`, `tools/list`, `tools/call`, `ping`
  - Tools: `list_connections`, `list_tables`, `describe_table`, `run_query`
  - Read-only guard on `run_query` (blocks non-SELECT when `mcp_read_only = true`)
  - Audit log: appends `{timestamp, conn_id, sql}` → `~/.config/tool-sql/audit.jsonl`
  - Shared `AppState` — no separate process; spawned as background `tokio::task`

- [x] **Verify:** `cd src-tauri && cargo check` → zero errors

---

### Task 2: Audit Frontend (React/TypeScript)

**Files:** Read `src/` tree — no writes
**Mirror:** new

- [x] Step 1: Connection Management
  - `features/connection/connectionApi.ts` — typed `invoke` wrappers for all 6 connection commands
  - `features/connection/ConnectionDialogShell.tsx` — create/edit form modal
  - `features/connection/connectionStore.ts` — Zustand: `savedConnections`, `activeConnections`, `activeConnectionId`

- [x] Step 2: Schema Navigator / Explorer
  - `features/explorer/ExplorerTree.tsx` — sidebar tree (connections → tables, lazy expand)
  - Inline connect / disconnect / edit / delete with confirm-before-delete
  - `features/explorer/schemaApi.ts` — `listDatabases`, `listTables`

- [x] Step 3: Object View (per-table panel)
  - `features/object-view/ObjectView.tsx` — tabs router: Data / Structure / Indexes / DDL
  - `DataGridShell.tsx` — paginated data table, column visibility picker, cell-expand modal
  - `StructureShell.tsx` — column definitions display
  - `IndexesShell.tsx` — index listing
  - `DdlShell.tsx` — approximate `CREATE TABLE` from column metadata + clipboard copy
    _(note: DDL is client-reconstructed, not a true server-side dump)_

- [x] Step 4: SQL Console
  - `features/sql-console/SqlConsoleShell.tsx`
  - CodeMirror 6 editor — SQL syntax, one-dark/light theme switch
  - Run: Cmd/Ctrl+Enter
  - Connection selector dropdown
  - Results table with cell-expand modal
  - AI generate SQL button (Sparkles) → calls `generate_sql`
  - Save to saved queries (Bookmark)
  - Resizable split pane (drag-to-resize editor vs. results)

- [x] Step 5: AI Features (frontend API: `features/sql-console/aiApi.ts`)
  - `generateSql` — NL → SQL
  - `explainSql` — plain-language explanation + optimization tips
  - `generateFilters` — NL → filter array (used in FilterBar)
  - `completeSql` — partial-SQL autocomplete
  - `checkOllama` — health check

- [x] Step 6: Saved Queries Panel
  - `features/saved-queries/SavedQueriesPanel.tsx`
  - List, load into editor, run directly, rename inline, delete

- [x] Step 7: Command Palette
  - `features/command-palette/CommandPalette.tsx` — Cmd/Ctrl+K
  - Static actions: New Connection, Open Settings, Toggle Theme
  - Dynamic: search saved connections by name → quick connect

- [x] Step 8: Settings Panel
  - `features/settings/SettingsShell.tsx`
  - Sections: Appearance (theme), AI Backend, MCP, Zoom
  - Quick presets for OpenAI-compatible (OpenAI, DeepSeek, Groq, LM Studio, etc.)

- [x] Step 9: Stores (Zustand)
  - `connectionStore` — saved + active connections
  - `workspaceStore` — open objects + active object + subView (data/structure/indexes/ddl)
  - `savedQueriesStore` — saved query list
  - `settingsStore` — app settings + OpenAI presets
  - `themeStore` — light / dark / system pref
  - `layoutStore` — sidebar width
  - `viewStore` — main panel view mode

- [x] Step 10: Shared UI
  - `Button`, `IconButton`, `Input`, `Select`, `Tabs`, `Spinner`, `EmptyState`
  - `CellDetailModal` — full-value expand overlay
  - `ResizableSplit` — pointer-drag split pane
  - `Kbd` — keyboard shortcut badge
  - `useTheme` — CSS-variable theming hook

- [x] **Verify:** `bun run typecheck` → zero errors

---

### Task 3: Write `docs/FEATURES.md`

**Files:** Create `docs/FEATURES.md`
**Mirror:** new — `docs/` folder exists but old content is stale per `CLAUDE.md`

- [ ] Step 1: Write the file following the structure in the Deliverable section below.
- [ ] Verify: file is non-empty and renders correctly in a markdown viewer.

---

## Deliverable: `docs/FEATURES.md` structure

```markdown
# tool-sql — Implemented Features

_Auto-audited from source. See CLAUDE.md for canonical architecture._

## 1. Database Engine Support
## 2. Driver Trait (backend contract)
## 3. Connection Management
## 4. Schema Navigation
## 5. Query Execution
## 6. Object Viewer (Data / Structure / Indexes / DDL)
## 7. SQL Console
## 8. AI Features
## 9. Saved Queries
## 10. MCP Server
## 11. Audit Log
## 12. Settings
## 13. UI Shell & Shared Components
## 14. Known Gaps / Partial Implementations
```

---

## Validation

```bash
bun run typecheck          # zero TS errors
cd src-tauri && cargo check  # zero Rust errors
# verify file was created
ls -lh docs/FEATURES.md
```

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing a feature added after this audit | Low | Cross-check `lib.rs` command registrations against the doc |
| DDL described as "true dump" when it is client-reconstructed | Medium | DdlShell has a comment on line 20 — call this out explicitly as a gap |
| Old `docs/` content re-included | Low | Start fresh; do not copy-paste from old docs |

---

## Acceptance ("done" criteria for /execute)

- [ ] `docs/FEATURES.md` created and covers all 14 sections
- [ ] Every Tauri command is listed under its domain
- [ ] Driver trait methods enumerated
- [ ] MCP tools listed with their read-only constraint noted
- [ ] "Known Gaps" section includes: DDL client-reconstruction, no frontend test runner, no schema diff, no team features
- [ ] `bun run typecheck` passes
- [ ] `cargo check` passes
- [ ] No code was written or modified (audit only)
