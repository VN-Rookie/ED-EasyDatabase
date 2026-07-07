# TODO — Implementation Plan

> **Source of truth cho việc gì cần làm tiếp theo.**
> Update file này sau mỗi session. Khi item xong, đánh dấu ✅ và ghi ngày.

---

## Trạng thái thực tế (2026-06-04)

### ✅ Đã xong

| Feature | File(s) |
|---------|---------|
| Rust: connect/disconnect (Postgres, MySQL, MongoDB) + timeout fix | `commands/connection.rs`, `db/mod.rs` |
| Rust: save/load/delete connections → `~/.config/tool-sql/connections.json` | `commands/connection.rs` |
| Rust: test_connection | `commands/connection.rs` |
| Rust: list_tables, list_databases, describe_table, switch_mongo_db | `commands/schema.rs`, `connection.rs` |
| Rust: run_query (PG + MySQL + MongoDB SELECT parse) | `commands/query.rs` |
| Frontend: ConnectionForm (tạo/sửa/test) | `ConnectionForm.tsx` |
| Frontend: ConnectionList — Pencil mở edit form đầy đủ | `ConnectionList.tsx` |
| Frontend: SchemaTree — databases → collections/tables (2-level, MongoDB) | `SchemaTree.tsx` |
| Frontend: DataGrid — sort, resize, copy, inline edit, insert/delete, CSV/JSON export | `DataGrid.tsx` |
| Frontend: FilterBar — SQL operators + AI natural language | `FilterBar.tsx` |
| Frontend: SqlEditor — CodeMirror, multi-tab, history, saved queries, EXPLAIN visualizer | `SqlEditor.tsx` |
| Frontend: Structure tab (columns, type, nullable, PK) | `MainPanel.tsx` |
| Frontend: AI — generate, explain, complete_sql, filter (Claude/OpenAI/Ollama/DeepSeek) | `AiQueryBox.tsx` |
| MCP Server (JSON-RPC 2.0 TCP), write protection, audit log | `mcp/`, `commands/audit.rs` |
| Settings panel (AI keys, MCP port, audit log viewer) | `SettingsPanel.tsx` |

---

## Phân tích so với MongoDB Compass

### Gap hiện tại so với Compass

| Gap | Impact | Trạng thái |
|-----|--------|-----------|
| **Document/JSON view** — nested objects dạng cây mở rộng | 🔴 Critical MongoDB | ❌ Flat table, nested hiện `{...}` cắt ngắn |
| **Cell expand** — click xem full value (JSON/text dài) | 🔴 Blocks real use | ❌ Cắt 120 chars, không xem được full |
| **MongoDB filter syntax** `{ field: { $gt: 5 } }` | 🔴 MongoDB-specific | ❌ FilterBar dùng SQL operators → fail MongoDB |
| **Insert document (MongoDB)** | 🔴 CRUD incomplete | ❌ Insert form dùng flat SQL columns |
| **Breadcrumb** `Connection › DB › Collection` | 🟡 Context | ❌ Chỉ có badge tên table nhỏ |
| **Configurable page size** (25/50/100/200) | 🟡 Workflow | ❌ Hard-coded 50 |
| **Multi-row select + bulk delete** | 🟡 Productivity | ❌ Không có |
| **Index viewer** | 🟡 Power users | ❌ Không có |
| **Column visibility toggle** | 🟡 Data management | ❌ Không có |
| **Right-click context menu** | 🟡 Polish | ❌ Không có |
| **Row height** (compact/default/comfortable) | 🟢 Preference | ❌ Hard-coded |
| **Find in grid** (Ctrl+F) | 🟢 Discovery | ❌ Không có |
| **Keyboard shortcuts** (Cmd+T/W/R/\) | 🟢 Power users | ⚠️ Chỉ có Cmd+Enter |
| **Connection color labels** dev/staging/prod | 🟢 Organization | ❌ Không có |
| **Cell value auto-detect** URL/date/number | 🟢 Readability | ❌ Text thuần |
| **Aggregation pipeline** (MongoDB) | 🟢 Advanced | ❌ Không có |
| **Schema analysis** field presence & type dist. | 🟢 Insight | ❌ Không có |

---

## Sprint A — MongoDB Usability ✅ HOÀN THÀNH (2026-06-04)

> Tất cả 4 items đã implement, TypeScript + Rust check clean.

### A1 — Cell Expand Modal ✅
**Tại sao:** Cell bị cắt ngắn 120 chars → không đọc được JSON lớn, text dài, ObjectId chains.  
**Mô tả:** Nút `⤢` xuất hiện khi hover cell bị truncate → click mở modal overlay:
- Full value với JSON pretty-print (auto-detect nếu parseable JSON)
- Nút Copy
- Close bằng Escape hoặc click outside
- Hoạt động cho mọi DB (Postgres, MySQL, MongoDB)

**Files:** `DataGrid.tsx` (+modal component inline)  
**Effort:** ~2h

---

### A2 — Document View (MongoDB) ✅
**Tại sao:** MongoDB documents có nested objects/arrays — flat table không thể đọc được.  
**Mô tả:** Tab mới "Document" chỉ hiện khi active connection là MongoDB:
- Mỗi document = 1 card, hiện dạng expandable JSON tree
- Field name + BSON type badge (`String`, `ObjectId`, `Date`, `Array`, `Object`, `Number`, `Bool`)
- Nested object/array có chevron `▸` để collapse/expand
- Pagination giống Data tab (50/page)
- Click document → mở full JSON trong side panel
- Edit/delete button trên từng document card

**Files:** `MainPanel.tsx`, tạo mới `DocumentView.tsx`  
**Effort:** ~1 ngày

---

### A3 — MongoDB Filter Bar (MQL syntax) ✅
**Tại sao:** FilterBar hiện tại tạo SQL WHERE → không chạy được với MongoDB.  
**Mô tả:** Khi active connection là MongoDB:
- FilterBar hiện 1 input nhận MongoDB Query Language: `{ status: "active", age: { $gt: 18 } }`
- Validate JSON trước khi apply (hiện error nếu invalid JSON)
- Pass filter object vào `find()` thay vì WHERE clause
- Vẫn giữ AI natural language input → parse ra MQL thay vì SQL
- Giữ nguyên SQL FilterBar cho Postgres/MySQL

**Files:** `FilterBar.tsx`, `useSchema.ts`, `commands/query.rs`  
**Effort:** ~4h

---

### A4 — Insert Document (MongoDB) ✅
**Tại sao:** Insert form hiện tại dùng column list → không phù hợp MongoDB flexible schema.  
**Mô tả:** Khi MongoDB, replace insert form bằng:
- JSON textarea editor (CodeMirror hoặc plain textarea với monospace font)
- Default value: `{ "_id": { "$oid": "..." }, "field": "value" }`
- Validate JSON trước khi submit
- Backend: `insert_one(doc)` command mới trong `query.rs`

**Files:** `DataGrid.tsx`, `MainPanel.tsx`, tạo command `insert_document` trong `query.rs`  
**Effort:** ~3h

---

## Sprint B — Core UX ✅ HOÀN THÀNH (2026-06-04)

### B1 — Breadcrumb Header
**Mô tả:** Thanh mỏng trên top của MainPanel content area:
```
🔌 my-local-pg  ›  users        (Postgres)
🔌 atlas-prod   ›  mydb  ›  orders    (MongoDB)
```
Click connection name → focus sidebar. Hiện ping latency nhỏ (optional).

**Files:** `MainPanel.tsx`  
**Effort:** ~1h

---

### B2 — Configurable Page Size
**Mô tả:** Dropdown `25 | 50 | 100 | 200` trong pagination bar (thay vì hard-coded 50).  
Persist choice trong `viewStore` per-connection.

**Files:** `MainPanel.tsx`, `viewStore.ts`, `useSchema.ts` (update PAGE_SIZE)  
**Effort:** ~1h

---

### B3 — Multi-row Select + Bulk Operations
**Mô tả:**
- Checkbox ở cột đầu tiên của DataGrid
- Header checkbox = select all visible rows
- Shift+click = range select
- Khi có selection, hiện toolbar phía trên grid:
  - `Delete N rows` (với confirm)
  - `Export selected (CSV/JSON)`
  - `Copy N rows as JSON`
- Requires PK để generate DELETE WHERE pk IN (...)

**Files:** `DataGrid.tsx`, `MainPanel.tsx`  
**Effort:** ~4h

---

### B4 — Index Viewer Tab
**Mô tả:** Tab "Indexes" (sau Structure):
- Postgres: `SELECT indexname, indexdef, tablename FROM pg_indexes WHERE tablename = $1`
- MongoDB: `db.collection.listIndexes()` → command mới `list_indexes` trong Rust
- Hiện bảng: Index name, Columns/Keys, Type (BTREE/HASH/text), Unique, Size (optional)
- Nút "Create index" (advanced, có thể defer)

**Files:** `MainPanel.tsx`, tạo `IndexView.tsx`, `commands/schema.rs`  
**Effort:** ~4h

---

### B5 — Column Visibility Toggle
**Mô tả:** Icon button trong DataGrid toolbar → dropdown checklist tất cả columns.  
Uncheck → ẩn column khỏi grid (không fetch lại, chỉ hide render).  
Persist per-table trong `viewStore`.

**Files:** `DataGrid.tsx`, `viewStore.ts`  
**Effort:** ~2h

---

### B6 — Right-click Context Menu
**Mô tả:** Context menu khi right-click trên row:
```
📋 Copy cell value
📋 Copy row as JSON
📋 Copy row as SQL INSERT
─────────────────────
🗑  Delete row
```
Replace `window.confirm` bằng inline toast/confirm bar (không dùng browser dialog).

**Files:** `DataGrid.tsx`, tạo `ContextMenu.tsx`  
**Effort:** ~3h

---

## Sprint C — Polish 🟢 (sau B)

| # | Feature | Mô tả ngắn | Effort |
|---|---------|-----------|--------|
| C1 | **Row height toggle** | Compact(24)/Default(32)/Comfortable(44)px. 3 icon buttons trong DataGrid toolbar. Persist settings. | ~1h |
| C2 | **Find in grid (Ctrl+F)** | Search bar trong Data tab. Highlight matching cells trong loaded rows. | ~2h |
| C3 | **Keyboard shortcuts** | Cmd+T (new tab), Cmd+W (close tab), Cmd+\ (sidebar), Cmd+R (refresh), Escape (close modal). Hiện trong `?` help overlay. | ~2h |
| C4 | **Connection color labels** | Dropdown màu (🟢🟡🔴🔵🟣) khi tạo/edit connection. Chấm màu trong sidebar. Dùng cho dev/staging/prod. | ~2h |
| C5 | **Cell value auto-detect** | URL → link, email → mailto:, số lớn → 1,234,567, ISO date → "2024-01-01 · 3 days ago". | ~2h |
| C6 | **Aggregation pipeline (MongoDB)** | Toggle "Aggregation" mode trong Query tab khi MongoDB. Input JSON array `[{$match},{$group}]`. Backend: `aggregate()`. | ~1d |
| C7 | **Schema analysis tab** | Sample 1000 docs → field presence %, top 5 values, type distribution. Bar charts đơn giản (CSS, không cần chart lib). | ~1d |
| C8 | **Export all pages** | "Export all" → fetch all pages → merge → download. Progress indicator. | ~2h |
| C9 | **Delete confirmation inline** | Thay `window.confirm` bằng inline confirm bar ngay trong row (slide down). Countdown 3s auto-cancel. | ~1h |

---

## Backlog dài hạn

| Feature | Why | Design note |
|---------|-----|-------------|
| **ERD viewer** | Schema visualization | `information_schema.referential_constraints` → FK graph → `@dagrejs/dagre` + SVG |
| **SSH tunnel support** | Remote DB access | `openssh` crate hoặc shell out `ssh -L` |
| **Table data import (CSV)** | Seed/populate | File picker → parse CSV → batch INSERT / `COPY FROM STDIN` |
| **Database Snapshot / Backup** | Disaster recovery | Logical dump (DDL SQL generation) or shell out to CLI tools (`pg_dump`/`mysqldump`) |
| **Password in OS keychain** | Security | ✅ Done (2026-07-07) - Integrated `keyring` crate in backend connection commands |
| **Dark/light theme toggle** | Preference | ✅ Done (2026-07-07) - Integrated custom UI theme management |
| **Multiple result windows** | Comparison | Detachable floating result panel |
| **Query cost estimation** | Pre-flight | EXPLAIN (cost) trước khi run, warning cho expensive queries |

### 🤖 AI backlog

| Feature | Design note |
|---------|-------------|
| **Chat mode** | Conversational SQL nhớ context. Multi-turn conversation trong sidebar. |
| **AI data summarization** | Selected rows → AI returns plain-English summary. |
| **Auto-complete for JOIN** | Detect FK, suggest JOIN conditions. |

---

## 🚀 Đặc tả & Kế hoạch Chi tiết cho các Tính năng Mới (Import & Snapshot)

### 1. Tính năng Nhập dữ liệu (Import Data - CSV/JSON/SQL)
*   **Mục tiêu:** Cho phép người dùng nạp dữ liệu hàng loạt từ các tệp tin CSV hoặc JSON vào bảng hiện tại trong database.
*   **Danh sách TODO:**
    - [ ] **UI:** Thêm nút "Import" trên Data Grid Toolbar.
    - [ ] **UI:** Tạo Modal Import cho phép kéo thả tệp (`.csv`, `.json`), tự động phân tích hàng tiêu đề để người dùng map cột: Cột trong tệp ↔ Cột trong Bảng đích.
    - [ ] **Backend (API):** Định nghĩa lệnh Tauri `import_csv_data(conn_id, table, file_path, column_mappings)` và `import_json_data(...)`.
    - [ ] **Backend (Core):** Sử dụng các thư viện parsing hiệu năng cao (như `csv` trong Rust), thực hiện đọc stream tệp tin theo lô (batching) để tránh overload RAM đối với tệp tin lớn.
    - [ ] **Backend (Driver):** Tận dụng tính năng Bulk Insert của SQL (`INSERT INTO table (cols) VALUES (...), (...)...`) hoặc API chèn hàng loạt của MongoDB (`insert_many`) để chèn dữ liệu với tốc độ cao nhất.

### 2. Tính năng Sao lưu cơ sở dữ liệu (Database Snapshot / Backup & Restore)
*   **Mục tiêu:** Tạo bản sao lưu (snapshot) cấu trúc schema và dữ liệu của cơ sở dữ liệu và khôi phục khi cần thiết.
*   **Danh sách TODO:**
    - [ ] **UI:** Thêm nút chuột phải "Create Database Snapshot..." trên database node trong `ExplorerTree.tsx`.
    - [ ] **UI:** Tạo Modal cấu hình Snapshot: Chọn sao lưu cấu trúc (Schema Only) hay cả dữ liệu (Schema + Data).
    - [ ] **Backend (CLI Fallback):** Tự động kiểm tra xem môi trường máy khách có cài đặt các công cụ CLI gốc hay không (`pg_dump`, `mysqldump`, `mongodump`). Nếu có, gọi tiến trình ngầm (`std::process::Command`) để xuất tệp backup tối ưu nhất.
    - [ ] **Backend (Native Driver backup):** Nếu không có CLI gốc, driver tự crawl thông tin metadata để sinh tập lệnh SQL DDL (`CREATE TABLE ...`, `CREATE INDEX ...`) và ghi vào file `.sql` (Logical SQL Dump).
    - [ ] **Backend (Restore):** Xây dựng lệnh Tauri `restore_database_snapshot(conn_id, file_path)` để đọc file SQL backup, phân tách các khối lệnh và chạy qua Driver để khôi phục cấu trúc/dữ liệu.

