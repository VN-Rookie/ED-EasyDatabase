The plan file already exists from the previous session and my fresh audit confirms its accuracy. Let me now produce the required structured output.

---

## Plan: Check Feature & List It

**Plan file:** `.claude/plans/feature-audit.plan.md`

---

### Subtasks

1. **Audit Rust/Tauri backend** — Read all files under `src-tauri/src/commands/`, `src-tauri/src/drivers/`, and `src-tauri/src/mcp/` to enumerate every Tauri command, Driver trait method, and MCP tool. Group by domain: `connection`, `schema`, `query`, `ai`, `saved_queries`, `settings`, `audit`, `mcp`.

2. **Audit React/TypeScript frontend** — Read all files under `src/features/`, `src/stores/`, `src/app/`, and `src/shared/` to enumerate every feature component, Zustand store slice, and typed `invoke()` wrapper.

3. **Write `docs/FEATURES.md`** — Produce the single authoritative feature-inventory document covering 14 sections (DB Engine Support, Driver Trait, Connection Management, Schema Nav, Query Execution, Object Viewer, SQL Console, AI Features, Saved Queries, MCP Server, Audit Log, Settings, UI Shell, Known Gaps). No source code is written or modified.

---

### Acceptance criteria

- `docs/FEATURES.md` is created and contains all 14 sections enumerated in the plan
- Every Tauri command is listed under its domain (connection / schema / query / ai / saved_queries / settings / audit)
- All 7 Driver trait methods (`ping`, `list_databases`, `list_tables`, `describe_table`, `list_indexes`, `run_query`, `set_database`) are listed with engine support matrix (PostgreSQL ✓ / MySQL ✓ / MongoDB ✓)
- All 4 MCP tools are listed with the read-only constraint noted for `run_query`
- "Known Gaps" section includes: DDL client-reconstruction (not a real server-side dump), no frontend test runner, no schema diff, no team/collaboration features
- Zero source files modified — this is a documentation-only task
- `bun run typecheck` passes (unchanged TS)
- `cd src-tauri && cargo check` passes (unchanged Rust)

---

### Skill selection

- **build:** `execute`
- **qa_review:** `karpathy-guidelines`
- **qa_fix:** `execute`

---

**Plan saved to:** `.claude/plans/feature-audit.plan.md`

To execute: `/execute .claude/plans/feature-audit.plan.md`

---

SELECTED_SKILLS: execute, karpathy-guidelines

GOTCHAS: `docs/` directory is stale per CLAUDE.md — start FEATURES.md fresh, do not copy old doc content; DDL in DdlShell is client-reconstructed from column metadata, not a server-side SHOW CREATE TABLE — label it as such in the inventory

PATTERNS: feature inventory documents live in `docs/`; backend features are grouped by domain matching `commands/mod.rs` module names; all frontend `invoke()` calls have typed wrappers in `features/<domain>/<domain>Api.ts`