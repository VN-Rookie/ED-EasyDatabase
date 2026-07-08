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
  - Nâng cấp phần **Smart Autocomplete** trong SQL Console: Tích hợp autocomplete mặc định của CodeMirror 6 (PostgreSQL dialect) kèm theo custom metadata completion source thay vì override thô sơ.
  - Tối ưu hóa **Schema Loading**: Gom truy vấn schema metadata của các bảng/cột thành duy nhất một câu lệnh SQL hiệu năng cao ở Backend (command `describe_schema`), thay vì gửi vòng lặp `describeTable` cho hàng chục bảng ở Client.
  - Tích hợp **SQL Linting**: Tích hợp linter tĩnh trực quan bằng `@codemirror/lint` để cảnh báo hiệu năng thời gian thực ngay khi gõ (SELECT *, implicit comma joins, non-sargable query).
  - Tích hợp **AI Quick Fix**: Triển khai nút "Fix with AI" trên giao diện console error giúp tự động sửa đổi mã SQL bị lỗi và cập nhật trực tiếp vào editor.
  - Triển khai **Database Refactoring**: Tích hợp module đổi tên bảng và cột an toàn, tự động quét views/functions/stored procedures phụ thuộc trong database (Postgres & MySQL), tự động sửa đổi định nghĩa của chúng, hiển thị Refactor Preview Modal cho phép xem trước/sửa đổi DDL và thực thi đồng bộ trong 1 Transaction duy nhất.
  - Các cải tiến khác trước đó: keyring integration, transactional batch saves, data import, database backup/restore.
- **Active plan (next):** Hoàn thiện phân phối ứng dụng desktop hoặc tối ưu hóa hiệu năng các drivers cho DB lớn.
- **Next likely step:** Tạo bundle cài đặt và phân phối ứng dụng Tauri.

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

### 2026-07-08 (latest)
- **Triển khai Database Refactoring** (`implement-database-refactoring.plan.md`):
  - Bổ sung cấu trúc `DependencyInfo` và `RefactorPreview` trong Rust backend model.
  - Triển khai phương thức `get_refactor_preview` trên driver để quét views phụ thuộc và routines (procedures/functions) phụ thuộc (bọc lệnh re-create DDL và ALTER rename trong single Transaction).
  - Viết component `RefactorModal.tsx` cung cấp form đổi tên, preview dependency và cho phép edit/review SQL script trước khi chạy.
  - Tích hợp tính năng Refactoring đổi tên bảng (ở sidebar `ExplorerTree.tsx` dropdown) và đổi tên cột (ở `StructureShell.tsx` khi xem cấu trúc cột).
- **Triển khai SQL Linter & AI Quick Fix** (`implement-linter-and-ai-quick-fix.plan.md`):
  - Cài đặt và tích hợp gói `@codemirror/lint` để tạo SQL Linter tĩnh trên editor (cảnh báo `SELECT *`, Comma implicit joins, và non-sargable query).
  - Triển khai Tauri command `fix_sql_error` ở Rust backend để gọi AI (Claude/OpenAI/Ollama) sửa câu lệnh SQL lỗi dựa trên context schema và thông báo lỗi.
  - Tích hợp nút "Fix with AI" vào vùng hiển thị lỗi thực thi SQL của console frontend để tự động sửa và apply câu lệnh đúng trực tiếp vào editor.
- **Nâng cấp Autocomplete & Tối ưu hóa Schema loading** (`upgrade-autocomplete-schema-loader.plan.md`):
  - Định nghĩa struct `TableSchemaInfo` và implement phương thức `describe_schema` trên trait `Driver` cho tất cả các driver (Postgres, MySQL, Mongo, Redis).
  - Triển khai query gộp thông tin bảng/cột từ các bảng hệ thống `information_schema` đối với Postgres và MySQL chỉ trong 1 request.
  - Tạo tauri command và frontend API `describeSchema` để tải gộp metadata thay vì dùng vòng lặp `describeTable`.
  - Tích hợp autocomplete mặc định của CodeMirror 6 (PostgreSQL dialect) kèm theo custom metadata completion source thay vì override thô sơ.
  - Kiểm tra thành công: `cargo test` OK (13 tests pass), `bun run typecheck` và `bun run build` của Vite biên dịch hoàn hảo.

### 2026-07-07
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
