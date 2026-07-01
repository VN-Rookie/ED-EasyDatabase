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

- **Direction:** greenfield rewrite (BREAKING CHANGE). Old `src/` and `src-tauri/src/`
  are **reference only** — do not extend them.
- **Phase:** 0 (Foundation). **0.2 backend done; 0.1 UI shell not yet executed.**
- **Done:** Phase 0.2 — backend rewritten onto the `Driver` trait (`src-tauri/src/drivers/`
  + `model.rs`; new `AppState` registry of `Arc<dyn Driver>`; thin connection/schema/query
  commands). `cargo check` + `cargo test` green. AI/MCP/audit/saved/settings + Mongo
  doc-CRUD are **deferred** — files remain on disk but are not compiled (not declared as
  modules, not in `generate_handler!`). Backend currently exposes 13 commands:
  connect/test/disconnect/list/switch_mongo_db, save/load/delete connections,
  list_databases/list_tables/describe_table/list_indexes, run_query.
- **Active plan (next):** `.claude/plans/new-professional-ui-shell.plan.md` — UI shell,
  mock data. **Written, not yet executed.** Also `.claude/plans/phase-0-2-driver-trait-backend.plan.md`
  (now complete).
- **Next likely step:** execute the UI-shell plan (0.1), then Phase 1 wires the shell to
  the new `Driver`-backed commands. When re-adding a deferred feature, convert it to a
  `Driver` method / new command rather than restoring the old enum code.

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
