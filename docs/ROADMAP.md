# Roadmap

> **Status: greenfield rewrite (BREAKING CHANGE).** This roadmap replaces the old
> AI-first plan. North star: a **DataGrip-class** database IDE for PostgreSQL, MySQL,
> and MongoDB (~99% of DataGrip's everyday functionality). AI query-gen and the MCP
> server are **secondary differentiators** layered on top — not the core.
>
> See `CLAUDE.md` for architecture, `context.md` for live session state, and
> `.claude/plans/` for per-feature implementation plans. Each phase lists a concrete
> **"Done when"** so completion is unambiguous.

Last updated: 2026-06-19

---

## Phase 0 — Foundation (rewrite the skeleton)

**Goal:** A clean structure both ends can grow on, plus a clickable UI shell.

### 0.1 UI shell — `.claude/plans/new-professional-ui-shell.plan.md`
Professional DataGrip-style layout as presentational skeletons on a design-token
system: toolbar, resizable explorer tree, tabbed workspace, object viewer
(Data / Structure / Indexes / DDL), SQL console, status bar, connection dialog.
Mock data only — no backend wiring.

**Done when:** `bun run dev` shows the full shell; you can expand the tree, open
object tabs, switch sub-tabs, and see the SQL console — with `typecheck` + `lint` clean.

### 0.2 Backend driver trait
Replace the old `DbConnection` enum with a `Driver` trait (`drivers/{postgres,mysql,mongo}.rs`)
returning a normalized result model. Thin Tauri commands call trait methods only.

**Done when:** all three engines implement `Driver`; a command file contains zero
`match engine { … }` branching.

---

## Phase 1 — Core DB IDE (the heart)

**Goal:** Replace TablePlus/DataGrip for daily browse + query work. Wire the shell to
real data.

### 1.1 Connections
Create/edit/delete/test connections for all 3 engines; persist locally; live status.
**Done when:** connect to a real Postgres/MySQL/Mongo without a terminal.

### 1.2 Explorer tree (real)
Lazy-load connection → database → schema → tables/views/collections; refresh.
**Done when:** the full schema of a real DB is navigable by mouse.

### 1.3 Data grid (read)
Browse rows with server-side pagination, sort, column resize, typed cells, NULL/JSON
rendering, cell-expand modal, configurable page size.
**Done when:** the grid shows enough to debug a data bug at a glance.

### 1.4 SQL console (execute)
CodeMirror editor, run (⌘↵), result grid, clear errors, query history, multi-tab.
**Done when:** arbitrary SQL runs and results show immediately.

### 1.5 Structure / Indexes / DDL
Real column metadata (type, nullable, PK, FK), index list, generated CREATE statement.
**Done when:** each tab reflects the live object for all 3 engines.

---

## Phase 2 — Editing & productivity

**Goal:** Mutate data safely and move fast.

- Inline cell edit → UPDATE; insert row; delete row (PK-based).
- Multi-row select + bulk delete/export.
- Export result/table to CSV / JSON.
- Filter bar (SQL `WHERE` for relational, MQL JSON for MongoDB).
- Keyboard shortcuts (new/close tab, refresh, sidebar, find-in-grid).
- In-app confirms/inputs only — never browser `alert/confirm/prompt`.

**Done when:** edit, insert, delete, filter, and export work on real tables without
writing SQL by hand.

---

## Phase 3 — Engine depth (close the DataGrip gap)

**Goal:** Each engine feels first-class, not lowest-common-denominator.

- **MongoDB:** document tree view, MQL filters, insert/replace document, aggregation
  pipeline, schema sampling.
- **MySQL / PostgreSQL:** schema switching, views, materialized views, sequences,
  EXPLAIN visualizer.
- Per-engine type fidelity in the normalized result model (BSON, arrays, JSON, bytea).

**Done when:** common per-engine workflows have no "not supported" dead ends.

---

## Phase 4 — AI differentiators (secondary)

**Goal:** AI helps without being the point.

- Natural-language → SQL/MQL with auto-injected schema context (review before run).
- Explain query; suggest indexes.
- Local/offline backend option (Ollama) — schema metadata only, never row data externally.

**Done when:** "top 10 users from this month" produces correct, runnable SQL.

---

## Phase 5 — MCP server (secondary)

**Goal:** AI agents (Claude Code, Cursor) use tool-sql as an MCP server, reusing the
same `Driver` layer.

- JSON-RPC server in the Tauri process; read-only and write tools.
- Write tools require in-app confirmation; global read-only toggle.
- Audit log of AI-run queries.

**Done when:** `list_tables` over MCP returns the active connection's tables in Claude Code.

---

## Phase 6 — Polish (ongoing, no deadline)

| Feature | Priority |
|---|---|
| ERD viewer (FK graph) | Medium |
| SSH tunnel | Medium |
| Passwords in OS keychain | Medium |
| Connection color labels (dev/staging/prod) | Low |
| Light/dark theme toggle | Low |
| CSV import | Low |
| Connection groups / folders | Low |

---

## Out of scope

Team collaboration / multi-user, enterprise RBAC, compliance audit trails,
migrations / schema-diff, cloud DB hosting, mobile.

---

## Status snapshot

| Phase | State |
|---|---|
| 0.1 UI shell | Plan written, **not yet executed** (`.claude/plans/new-professional-ui-shell.plan.md`) |
| 0.2 Driver trait | ✅ **Done** (2026-06-19) — `Driver` trait + 3 drivers + factory; `cargo check`/`test` green. AI/MCP/audit/saved/settings + Mongo doc-CRUD deferred to their phases (files on disk, uncompiled). |
| 1–6 | Not started (old code is reference-only) |

> Keep this snapshot and `context.md` in sync at the end of each session.
