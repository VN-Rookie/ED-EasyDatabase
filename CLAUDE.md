# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ This is a from-scratch rewrite (BREAKING CHANGE)

`tool-sql` is being **rebuilt from scratch**. The existing `src/` and `src-tauri/src/`
trees are the **previous attempt** — treat them as *reference only*, not as the
architecture to extend. The old design (a `DbConnection` enum that every command
`match`es on per operation) does not scale to the feature set we now want, so it is
being replaced. When you implement something, build it against the **target
architecture below**, not the old enum-based code.

`docs/` (PURPOSE.md, ROADMAP.md, ARCHITECTURE.md, TODO.md, API.md) describes the *old*
AI-first direction and is **stale**. Until those are rewritten, **CLAUDE.md is
authoritative** for direction and structure, and the live code is authoritative for
detail. Do not trust `docs/` for the new design.

## What we're building

A cross-platform desktop database GUI with **DataGrip / DataGrip-class capability** —
a fast, complete power-user IDE for relational and document databases (PostgreSQL,
MySQL, MongoDB). This is the **primary** goal: a tool that is genuinely good enough to
replace TablePlus/DataGrip for day-to-day work.

**AI query generation and the MCP server are secondary differentiators.** They layer
on top of a solid core — they are not the core. Do not let AI/MCP work block or
complicate the fundamentals (connection management, schema navigation, a fast data
grid, a real SQL editor, safe data editing). Build the IDE first; AI sits on top of
the same primitives.

Target users: individual developers, not enterprise DBAs. Out of scope: team
collaboration, RBAC, audit-for-compliance, cloud hosting, migrations/schema-diff.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri 2.x |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 + lucide-react |
| State | Zustand 5 |
| Editor | CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-sql`) + `sql-formatter` |
| Backend | Rust (Tauri commands) |
| PostgreSQL + MySQL | sqlx 0.8 (`runtime-tokio`, `tls-rustls`, `uuid`, `chrono`, `bigdecimal`) |
| MongoDB | mongodb 3.x |
| HTTP (AI providers) | reqwest 0.12 (rustls) |
| MCP Server | Rust JSON-RPC server inside the Tauri process |

Keep this stack. Breaking changes are to **structure and abstractions**, not the
stack itself.

## Target Architecture

The whole rewrite hinges on one decision: **a `Driver` trait, not an enum.**

### Driver abstraction (the central change)

Each engine implements a single async trait — the rest of the backend depends only on
that trait, never on a concrete engine. This replaces the old
`match db_connection { Postgres => …, Mysql => …, Mongo => … }` block that was
duplicated in every command.

```
trait Driver (async, object-safe via async_trait or returning boxed futures):
    ping()                          -> health/latency
    list_databases()               -> Vec<DatabaseInfo>
    list_schemas(db)               -> Vec<SchemaInfo>      // Postgres-style; flat for others
    list_tables(db, schema)        -> Vec<TableInfo>       // tables AND mongo collections
    describe_table(ref)            -> TableStructure        // columns, types, nullable, PK, FKs
    list_indexes(ref)              -> Vec<IndexInfo>
    run_query(sql/params)          -> ResultSet             // SELECT-like
    execute(sql/params)            -> ExecResult            // INSERT/UPDATE/DELETE/DDL, rows affected
    edit ops (insert/update/delete row)                    // built on PK; engine renders the statement
```

- `drivers/mod.rs` — the `Driver` trait + a `connect(config) -> Arc<dyn Driver>` factory.
- `drivers/postgres.rs`, `drivers/mysql.rs`, `drivers/mongo.rs` — one file per engine.
- Engine-specific behavior (MongoDB filters as MQL JSON vs SQL `WHERE`, schema vs
  flat namespace, BSON vs SQL types) lives **inside the driver**, surfaced through
  normalized return types. Callers must not branch on engine type.
- A normalized **result model** (`ResultSet` = ordered columns + typed rows, where a
  cell is a tagged value: Null / Bool / Int / Float / Text / Json / Bytes) is what
  crosses the Rust↔TS boundary. Row→JSON conversion is the driver's job and must be
  total — exotic types degrade to Text/Json, never panic.

### Connection state

`AppState` holds `Arc<Mutex<HashMap<ConnectionId, Arc<dyn Driver>>>>` (UUID keys
minted at connect time). **Never hold the mutex across `.await`**: lock, clone the
`Arc<dyn Driver>` out, drop the guard, then await on the clone. Drivers are
internally `Arc`-backed (sqlx pools, mongo client) so cloning is cheap.

### Commands stay thin

Tauri commands in `commands/` are a **transport layer only**: deserialize input,
fetch the driver from state, call one trait method, return `Result<T, AppError>`.
No SQL, no engine branching, no business logic in command bodies. Group by domain
(connection, schema, query, edit, settings, ai, audit, saved_queries) — not by engine.

### MCP server reuses the driver layer

The MCP server (`mcp/`) exposes tools (`list_connections`, `list_tables`,
`describe_table`, `run_query`, …) over JSON-RPC and calls the **same `Driver`
trait** — it must not re-implement query logic. It runs as a background task spawned
in `lib.rs::run`'s `setup`, sharing `AppState`. Write-capable tools route through the
same write-protection / confirmation path as the UI.

### Frontend

Organize by **feature**, not by file-type. A feature owns its components, its Zustand
slice, and its `invoke()` wrappers together. Shared primitives (typed `invoke`
wrapper, the cell-value renderer, design-system atoms) live in a `shared/` area.

- All Rust↔TS calls go through **typed `invoke()` wrappers** in one place per feature —
  components never call `invoke` with raw string command names.
- TypeScript types for command payloads/results mirror the Rust normalized model and
  are the single source of truth for the boundary.
- The data grid is the heart of the UI and tends to sprawl — keep it decomposed
  (grid shell, row/cell rendering, selection, editing, toolbar, cell-expand modal as
  separate files). The old `DataGrid.tsx` was 762 lines; that is the anti-pattern.

### Data flow

`UI event → feature invoke() wrapper → Tauri command → driver trait method →
engine driver → normalized ResultSet → back to UI`. No HTTP between front and back;
everything is `invoke()`. The only outbound HTTP is AI providers (reqwest, backend
side) and MongoDB/SQL wire protocols.

## Conventions

- **Immutability**: build new objects, don't mutate in place (frontend state and DTOs).
- **File size**: prefer many small, focused files. ~200–400 lines typical, 800 hard
  cap. A growing file is a signal it's doing too much — split it.
- **Errors**: `AppError(String)` implements `serde::Serialize` so `invoke` propagates
  failures to the frontend. Every command returns `Result<T, AppError>`. Never
  swallow errors; surface a clear message to the UI.
- **No engine branching outside drivers** (backend) and **no raw `invoke` strings
  outside feature wrappers** (frontend) — these are the two rules that keep the
  rewrite from rotting back into the old shape.
- **Tailwind v4** via `@tailwindcss/vite` (not PostCSS). Entry is
  `@import "tailwindcss"` in `App.css`. No `tailwind.config.js`.
- **No browser dialogs** (`alert`/`confirm`/`prompt`) — use in-app toasts/confirm bars.
- **Resizable Modals**: All modals and dialogs must support resizing by the user. Use the `resize overflow-hidden` CSS classes along with minimum constraints (`min-w-[...] min-h-[...]`) on the inner modal card. Design the modal wrapper as a `flex flex-col` container and make the body section scrollable (`flex-1 overflow-y-auto`) so the content scales correctly when resized.
- **Icon Sizing**: Keep icons prominent and readable. Close buttons should use `size={18}`. Tab/status bar icons should use `size={16}` or larger. Button icon sizes should generally be `size={15}` (small) or `size={17}` (medium). Do not use sizes smaller than 14px unless absolutely necessary.
- **Multi-language (i18n)**: Never hardcode user-facing strings in UI components. Always use the `useTranslation` hook (`src/hooks/useTranslation.ts`) and define the translations in `src/lib/i18n/mapping.ts` for both `en` (English) and `vi` (Vietnamese).
- **No hover borders on document cards**: In "Tree" view mode or record visual cards, never add `hover:border-...` styles (keeps the UI cleaner and avoids distracting/jarring border transitions).

## Development Commands

```bash
bun install                  # install deps

bun run tauri dev            # full app, hot reload (frontend + Rust)
bun run dev                  # frontend only (Vite, no Tauri shell), port 1420
bun run build                # tsc + vite build (frontend)
bun run tauri build          # production desktop build

bun run typecheck            # tsc --noEmit
bun run lint                 # eslint src --ext ts,tsx

cd src-tauri && cargo check  # fast Rust check (no full build)
cd src-tauri && cargo test   # Rust tests
cd src-tauri && cargo test <name> -- --nocapture   # single Rust test
```

There is no frontend test runner configured yet. If you add tests, wire the runner
and a `test` script before relying on it — don't assume one exists.

## Dev Server Rule

Trước khi khởi động preview server để test UI, **luôn kill background server trước**:

```bash
kill $(lsof -ti :1420) 2>/dev/null; bun run dev
```

Không để server chạy ngầm giữa các lần test — gây port conflict và preview không
reload đúng.
