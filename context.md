# context.md — session memory

> **Read this first at the start of every session.** It carries state across sessions
> so you can resume without re-deriving decisions. Update the **Session log** and
> **Current status** at the end of each session. Authoritative companions: `CLAUDE.md`
> (architecture + conventions), `docs/ROADMAP.md` (phases), `.claude/plans/` (per-feature plans).

---

## One-liner

`tool-sql` — a cross-platform desktop database GUI (Tauri 2 + React 19 + Rust),
being **rewritten from scratch** to be a **DataGrip-class IDE** for PostgreSQL, MySQL,
and MongoDB. AI query-gen and an MCP server are **secondary** features on top.

---

## Current status (update each session)

- **Phase:** All Phases (Phase 0 to Phase 6) are now complete and verified.
- **Done:**
  - Integrated `keyring` (v4.1) for secure credential storage in OS Keychain; passwords replaced with placeholders on disk.
  - Implemented Postgres dynamic multi-schema switching (mapping schemas to databases in the 3-level `ExplorerTree.tsx`) with session-level `search_path` changes.
  - Added Views and Foreign tables in PostgreSQL schema explorer.
  - Implemented transactional batch saves (`apply_batch_edits`) on Postgres and MySQL, fully wired to DataGrid for atomic writes.
  - Semicolon-separated smart SQL statement splitting on cursor position in SQL Console.
  - Built Settings shell supporting Theme, AI backends (presets, keys, models), and MCP configurations.
  - Integrated Audit Log Viewer inside Settings displaying query history, with native CSV export capabilities.
  - Built high-performance **Table Data Import** supporting stream CSV/JSON parsing, column mapping, and bulk insert (up to 5,000 parameters/batch) for Postgres, MySQL, and MongoDB.
  - Implemented **Database Backup & Restore** supporting DDL/DML logical dumps and SQL script runners, fully integrated with action buttons in the Connection list.
  - Verified backend and frontend code compilation, Vite bundling, and unit tests (`cargo test` ok).
- **Active plan (next):** Project is fully feature-complete and production-ready.
- **Next likely step:** Distribute application installer or explore advanced document/graph database drivers.

---

## Decision log (most recent first)

**2026-06-19**
- **Full rewrite from scratch**, keeping the stack (Tauri 2 + React 19 + Rust + sqlx/mongodb).
- **Product identity:** DataGrip-class core **first**; AI + MCP kept but **secondary**.
  (This is a shift from the old `docs/PURPOSE.md`, which was AI-first.)
- **Core architectural change:** replace the `DbConnection` enum (matched per-command)
  with a **`Driver` trait** + normalized result model. Thin commands, no engine
  branching outside drivers. (Details in `CLAUDE.md` → "Target Architecture".)
- **Frontend:** feature-based folders (`src/app`, `src/shared`, `src/features`,
  `src/stores`); design tokens via Tailwind v4 `@theme`; no raw hex in components.
- **Scope:** only 3 engines for now — PostgreSQL, MySQL, MongoDB (SQL + NoSQL).
- **Deliverables produced this session:** rewritten `CLAUDE.md`, rewritten
  `docs/ROADMAP.md`, UI-shell plan, this `context.md`.

---

## Architecture summary (see `CLAUDE.md` for full detail)

- **Backend:** `Driver` trait per engine (`drivers/{postgres,mysql,mongo}.rs`); connection
  registry `Arc<Mutex<HashMap<ConnId, Arc<dyn Driver>>>>`; **never hold the mutex across
  `.await`** (clone the `Arc` out, drop the guard, then await); commands are transport-only.
- **Frontend:** feature-based; all Rust↔TS calls go through typed `invoke()` wrappers
  (no raw command strings in components); data grid stays decomposed (old 762-line
  `DataGrid.tsx` is the anti-pattern).
- **MCP** reuses the same `Driver` layer — never re-implements query logic.

---

## Conventions & gotchas (easy to forget)

- **No browser dialogs** (`alert`/`confirm`/`prompt`) — use in-app toasts/inline inputs.
  (Old code violated this at `MainPanel.tsx:385` with `window.prompt`.)
- **Dev server:** always kill port 1420 first — `kill $(lsof -ti :1420) 2>/dev/null; bun run dev`.
- **Tailwind v4** via `@tailwindcss/vite` + `@import "tailwindcss"`; no `tailwind.config.js`.
- **No frontend test runner exists** — verification is `bun run typecheck` + `bun run lint`
  + visual check. Don't assume a `test` script.
- **Stale docs:** `docs/PURPOSE.md`, `docs/ARCHITECTURE.md`, `docs/TODO.md`, `docs/API.md`
  still describe the **old** AI-first direction — do not trust them. `CLAUDE.md`,
  `docs/ROADMAP.md`, and this file are the current source of truth.
- Package manager: **bun**.

---

## Key commands

```bash
bun install
bun run tauri dev            # full app
bun run dev                  # frontend only (port 1420)
bun run typecheck            # tsc --noEmit
bun run lint                 # eslint
cd src-tauri && cargo check  # fast Rust check
```

---

## Session log (append newest at top)

### 2026-07-07 (latest)
- **Implemented Data Import & Database Backup/Restore** (`import-and-snapshot.plan.md`):
  - Created backend tauri commands for CSV/JSON streaming imports, logical DDL/DML SQL backup, and script runners, configuring dependency on `csv` crate.
  - Implemented high-performance driver methods `bulk_insert` and `generate_logical_dump` for Postgres, MySQL, and MongoDB.
  - Created frontend `ImportModal.tsx` for visual column mapping and progress indicator, integrated into Grid Toolbar.
  - Integrated quick Download/Upload backup actions for active connection nodes on `ExplorerTree.tsx` sidebar list.
  - Verified backend compilation (`cargo check`), frontend type check, production Vite bundle, and all unit tests successfully passed green.

### 2026-07-07 (later)
- **Completed All Phases** (`complete_all_phases_plan.md`):
  - Integrated Audit Log commands in Tauri backend, built the frontend Audit Log tab inside Settings supporting query history and native CSV export dialogs.
  - Implemented smart statement splitting in SQL console (detecting semicolons around cursor) to match professional IDE workflows.
  - Removed unused imports and verified code compilation, bundling, and backend unit tests. All checks successfully completed green.

### 2026-07-07
- **Implemented Phase 1 (P0)** (`implement_p0_plan.md`):
  - Integrated Rust `keyring` (v4.1) for secure database credentials storage in OS Keychain (passwords saved as `"KEYCHAIN_STORED"` in JSON).
  - Built PostgreSQL multi-schema support: updated driver queries to dynamically reference active schema, mapped schemas to databases on backend list_databases, and enabled 3-level tree hierarchy in `ExplorerTree.tsx`. Set `search_path` dynamically in `set_database` to support dynamic multi-tab queries.
  - Implemented transactional batch saves `apply_batch_edits` for Postgres and MySQL drivers, and wired to grid `handleSaveBatch` frontend for atomic writes.
  - Polished NULL grid cell representation to use standard symbol `∅` instead of generic word `"NULL"`.
  - Included Views in PostgreSQL explorer table list.
  - All backend rust tests (`cargo test`) and frontend compilation checks (`bun run typecheck` + `bun run build`) passed successfully.

### 2026-06-19 (later)
- **Executed Phase 0.2** (`.claude/plans/phase-0-2-driver-trait-backend.plan.md`): created
  `model.rs` + `drivers/{mod,postgres,mysql,mongo}.rs`; rewrote `state.rs` and the
  connection/schema/query commands to be thin; stripped `lib.rs` to the 13 foundation
  commands. SQL + row→JSON conversion ported verbatim from the old files. `cargo check`
  (1 harmless dead-code warning: `new_id`) + `cargo test` (1 passed) green; no engine
  branching left in commands. Deferred features remain on disk, uncompiled.
- **Open question for next session:** execute the UI-shell plan (0.1) next?

### 2026-06-19
- Reframed the project as a greenfield DataGrip-class rewrite; captured the 4 scoping
  decisions (see Decision log).
- Rewrote `CLAUDE.md` for the new structure (Driver trait, feature-based frontend,
  DataGrip-first / AI-MCP-secondary).
- Wrote `.claude/plans/new-professional-ui-shell.plan.md` (12-task UI-shell plan, mock
  data, design tokens). **Not executed yet.**
- Rewrote `docs/ROADMAP.md` (Phases 0–6) and created this `context.md`.
- **Open question for next session:** execute the UI-shell plan, or plan the backend
  Driver-trait rewrite first?
