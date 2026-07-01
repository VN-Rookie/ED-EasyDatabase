# Plan: Schema Navigation + Real Object View + Connection Edit/Delete

**Source:** User request — fix "kết nối được nhưng không thấy table" and "không có option sửa/xoá kết nối". Implements Phase 2 + Phase 1 F16/F17 from `docs/FEATURE-CHECKLIST.md`.
**Complexity:** Large (but each task is bite-sized; no backend changes)

## Goal
Make the explorer show **real tables/collections** under a connected connection, open one into a tab whose **Structure / Indexes / Data / DDL** are populated from the real backend, and let the user **edit** and **delete** saved connections. Success: connect → expand → see real tables → click → see real columns/indexes/rows; and edit/delete a saved connection from the tree.

## ⚠️ Grounding facts (verified this session)
- Backend commands already registered (`src-tauri/src/lib.rs:18-30`): `list_databases`, `list_tables`, `describe_table`, `list_indexes`, `run_query`, plus all connection commands incl. `delete_saved_connection` and `save_connection` (upsert by id).
- Command arg keys use **camelCase from JS** (Tauri auto-converts to snake_case) — confirmed by old `src/lib/schemaContext.ts:22`: `invoke("describe_table", { connId, table })`.
- Rust return shapes (`src-tauri/src/model.rs`): `TableInfo{name}`, `ColumnInfo{name,data_type,nullable,is_pk}`, `IndexInfo{name,columns,is_unique,index_type}`, `QueryResult{columns,rows,rows_affected}`.
- The **connection's saved id IS the `conn_id`** used by schema/query commands (connect keys state by `config.id`).
- `list_tables` (Postgres) returns BASE TABLE only (no views); `describe_table`/`list_indexes` are **parameterized** (`$1`) — no identifier quoting needed.
- `run_query` builds a raw SQL string per call. **Postgres/MySQL accept SQL; MongoDB's `run_query` does not accept `SELECT`.** → Data tab is **relational-only** this slice; Mongo Data tab shows a placeholder (its document browser is a later slice). Tree listing + Structure/Indexes still work for all engines.

## Scope boundary
- **In scope:** boundary types for schema/query; typed invoke wrappers; `OpenObject` gains `connId`+`table`; explorer lists real tables on expand; ObjectView shells (Structure, Indexes, Data, DDL) fetch real data; connection Edit + Delete.
- **Out of scope (later):** pagination/sorting/filtering in grid, inline cell editing, SQL-console execution, Mongo document viewer, DB/schema sub-levels in tree, views in tree, saved-query/AI/MCP. Note them; don't build them.
- **No `src-tauri` changes.** Reuse existing commands only.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern |
|---|---|---|
| Boundary types | `src/shared/types.ts` (current) + `src-tauri/src/model.rs` | snake_case fields, `interface` per shape |
| invoke wrappers | `src/features/connection/connectionApi.ts` | `invoke<T>("cmd", { camelCaseArgs })` one module per feature |
| Schema invoke args | `src/lib/schemaContext.ts:22` (old, reference) | `{ connId, table }` camelCase keys |
| Store slice | `src/features/connection/connectionStore.ts` + `src/stores/workspaceStore.ts` | Zustand `create`, immutable spread |
| Fetch + loading/error in a feature component | `src/features/explorer/ExplorerTree.tsx` (current `loadError`/`busyId` pattern) | local `useState` + `useEffect`, errors rendered inline |
| Structure table markup | `src/features/object-view/StructureShell.tsx` (current, mock) | reuse the exact table; swap mock for fetched data |
| Grid markup | `src/features/object-view/DataGridShell.tsx` (current, mock) | reuse sticky header + cell rendering; swap mock for fetched columns/rows |
| Confirm without browser dialog | CLAUDE.md "no browser dialogs"; `src/components/Toast.tsx` (provider) | inline confirm bar / two-step button, never `confirm()` |
| Edit dialog initial values | `src/components/ConnectionForm.tsx:29-31` (old) `useState(initial ?? makeNew())` | dialog accepts optional `initial` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `src/shared/types.ts` | MODIFY | Add `TableInfo`, `ColumnInfo`, `IndexInfo`, `QueryResult` |
| `src/features/explorer/schemaApi.ts` | CREATE | invoke wrappers `listDatabases`, `listTables` |
| `src/features/object-view/objectApi.ts` | CREATE | invoke wrappers `describeTable`, `listIndexes`, `runQuery` |
| `src/stores/workspaceStore.ts` | MODIFY | `OpenObject` gains `connId` + `table` |
| `src/features/explorer/ExplorerTree.tsx` | MODIFY | Lazy-load real tables on expand; open object with `connId`/`table`; add Edit/Delete affordances |
| `src/features/connection/ConnectionDialogShell.tsx` | MODIFY | Accept optional `initial` config (edit mode) |
| `src/features/object-view/StructureShell.tsx` | MODIFY | Fetch real columns |
| `src/features/object-view/IndexesShell.tsx` | MODIFY | Fetch real indexes |
| `src/features/object-view/DataGridShell.tsx` | MODIFY | Fetch real rows (relational); Mongo placeholder |
| `src/features/object-view/DdlShell.tsx` | MODIFY | Build CREATE from fetched columns (relational) |
| `src/features/object-view/ObjectView.tsx` | MODIFY | Pass `object` to each shell |

> `src/features/object-view/mockData.ts` stays on disk (reference), no longer imported after this plan.

---

## Tasks

### Task 1: Schema/query boundary types
**Files:** Modify `src/shared/types.ts`
**Mirror:** `src-tauri/src/model.rs` shapes.
- [ ] Step 1: Append:
```ts
export interface TableInfo {
  name: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
  is_pk: boolean;
}

export interface IndexInfo {
  name: string;
  columns: string;
  is_unique: boolean;
  index_type: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rows_affected: number | null;
}
```
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 2: Schema invoke wrappers (explorer)
**Files:** Create `src/features/explorer/schemaApi.ts`
**Mirror:** `connectionApi.ts` + arg style from `schemaContext.ts:22`.
- [ ] Step 1:
```ts
import { invoke } from "@tauri-apps/api/core";
import type { TableInfo } from "../../shared/types";

export const listDatabases = (connId: string) =>
  invoke<string[]>("list_databases", { connId });

export const listTables = (connId: string) =>
  invoke<TableInfo[]>("list_tables", { connId });
```
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 3: Object invoke wrappers (object-view)
**Files:** Create `src/features/object-view/objectApi.ts`
**Mirror:** `connectionApi.ts` + arg style from `schemaContext.ts:22`.
- [ ] Step 1:
```ts
import { invoke } from "@tauri-apps/api/core";
import type { ColumnInfo, IndexInfo, QueryResult } from "../../shared/types";

export const describeTable = (connId: string, table: string) =>
  invoke<ColumnInfo[]>("describe_table", { connId, table });

export const listIndexes = (connId: string, table: string) =>
  invoke<IndexInfo[]>("list_indexes", { connId, table });

export const runQuery = (connId: string, sql: string) =>
  invoke<QueryResult>("run_query", { connId, sql });
```
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 4: OpenObject carries connId + table
**Files:** Modify `src/stores/workspaceStore.ts`
**Mirror:** existing `OpenObject` interface.
- [ ] Step 1: Change the `OpenObject` interface to:
```ts
export interface OpenObject {
  id: string;          // unique key, e.g. "conn1:users"
  connId: string;      // active connection id (= conn_id for schema/query commands)
  table: string;       // raw table/collection name for backend calls
  label: string;       // display name
  engine: "postgres" | "mysql" | "mongodb";
}
```
- [ ] Step 2: No other change in this file (actions are unaffected — they operate on `id`).
- [ ] Verify: `bun run typecheck` → exit 0 (will FAIL until Task 5 updates the caller; that's expected — proceed to Task 5 then re-run).

### Task 5: Explorer — real tables + Edit/Delete
**Files:** Modify `src/features/explorer/ExplorerTree.tsx`
**Mirror:** current file's `busyId`/`loadError`/`connectError` pattern; `Table2` leaf icon density from the pre-connection mock tree; confirm-bar style instead of `confirm()`.
- [ ] Step 1: Add table state + lazy load. Add imports `Table2`, `Pencil`, `Trash2` from lucide-react, `listTables` from `./schemaApi`, `deleteSavedConnection` from `../connection/connectionApi`, `useWorkspaceStore` from `../../stores/workspaceStore`, and `TableInfo` type. Add state:
```tsx
const openObject = useWorkspaceStore((s) => s.openObject);
const [tables, setTables] = useState<Record<string, TableInfo[]>>({});
const [tablesBusy, setTablesBusy] = useState<string | null>(null);
const [pendingDelete, setPendingDelete] = useState<string | null>(null);
```
- [ ] Step 2: When a connected connection is expanded, fetch its tables once. Replace the existing `toggle` for connections with a handler that fetches on first open:
```tsx
const expandConn = async (id: string) => {
  toggle(id);
  if (tables[id]) return;
  setTablesBusy(id);
  try {
    const list = await listTables(id);
    setTables((prev) => ({ ...prev, [id]: list }));
  } catch (e) {
    setConnectError(String(e));
  } finally {
    setTablesBusy(null);
  }
};
```
  Wire the connected-connection row's expand button to `expandConn(conn.id)` (replacing the `toggle(conn.id)` used when active). On `handleConnect` success, also clear any stale cache: `setTables((prev) => { const n = { ...prev }; delete n[id]; return n; });`
- [ ] Step 3: Render the table leaves (replace the `"Schema browsing — next milestone"` placeholder block) for an expanded connected connection:
```tsx
{active && isOpen && (
  tablesBusy === conn.id
    ? <div className="pl-9 pr-2 py-1.5 text-[11px] text-muted flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading…</div>
    : (tables[conn.id]?.length ?? 0) === 0
      ? <div className="pl-9 pr-2 py-1.5 text-[11px] text-faint italic">No tables</div>
      : tables[conn.id]!.map((t) => {
          const objId = `${conn.id}:${t.name}`;
          return (
            <button key={objId}
              onClick={() => openObject({ id: objId, connId: conn.id, table: t.name, label: t.name, engine: conn.db_type })}
              className="w-full flex items-center gap-1.5 pl-11 pr-2 py-1.5 text-xs text-muted hover:bg-hover truncate">
              <Table2 size={12} /><span className="truncate">{t.name}</span>
            </button>
          );
        })
)}
```
- [ ] Step 4: Add Edit/Delete affordances to the connection row's hover actions (next to connect/disconnect). Edit opens the dialog in edit mode (Task 6) — this requires lifting dialog control to a parent; do it via a callback prop `onEdit?: (config: ConnectionConfig) => void` on `ExplorerTree`, passed from `AppShell` (see Step 6). Delete uses a two-step inline confirm:
```tsx
{pendingDelete === conn.id ? (
  <span className="flex items-center gap-1">
    <button onClick={() => handleDelete(conn.id)} className="text-[10px] text-danger" title="Confirm delete">Delete?</button>
    <button onClick={() => setPendingDelete(null)} className="text-[10px] text-muted" title="Cancel">✕</button>
  </span>
) : (
  <>
    {onEdit && <button onClick={() => onEdit(conn)} title="Edit" aria-label={`Edit ${conn.name}`} className="opacity-0 group-hover:opacity-100 text-muted hover:text-fg transition-opacity"><Pencil size={12} /></button>}
    <button onClick={() => setPendingDelete(conn.id)} title="Delete" aria-label={`Delete ${conn.name}`} className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-opacity"><Trash2 size={12} /></button>
  </>
)}
```
  with:
```tsx
const handleDelete = async (id: string) => {
  setPendingDelete(null);
  try {
    if (isActive(id)) { await disconnectConnection(id); removeActiveConnection(id); }
    await deleteSavedConnection(id);
    removeSavedConnection(id);
  } catch (e) { setConnectError(String(e)); }
};
```
  Add `removeSavedConnection` to the store destructure, and accept `{ onEdit }: { onEdit?: (config: ConnectionConfig) => void }` as the component prop (import `ConnectionConfig` type).
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 6: Dialog edit mode + AppShell wiring
**Files:** Modify `src/features/connection/ConnectionDialogShell.tsx`, `src/app/AppShell.tsx`
**Mirror:** `ConnectionForm.tsx:29-31` (`useState(initial ?? makeNew())`).
- [ ] Step 1: In `ConnectionDialogShell`, change props to `{ onClose, initial }: { onClose: () => void; initial?: ConnectionConfig }` and the form state to `useState<ConnectionConfig>(initial ?? makeNew())`. Change the header to `{initial ? "Edit Connection" : "New Connection"}`. (Save & Connect already upserts via `saveConnection` — works for edit because id is preserved.)
- [ ] Step 2: In `AppShell.tsx`, replace the boolean `showConnDialog` with edit-aware state:
```tsx
const [dialog, setDialog] = useState<{ open: boolean; initial?: ConnectionConfig }>({ open: false });
```
  Pass `onNewConnection={() => setDialog({ open: true })}` to Toolbar, `onEdit={(config) => setDialog({ open: true, initial: config })}` to `<ExplorerTree onEdit=… />`, and render `{dialog.open && <ConnectionDialogShell initial={dialog.initial} onClose={() => setDialog({ open: false })} />}`. Import `ConnectionConfig` from `../shared/types`.
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 7: Structure tab — real columns
**Files:** Modify `src/features/object-view/StructureShell.tsx`
**Mirror:** keep the existing table markup; swap `MOCK_COLUMNS` for fetched `ColumnInfo[]`; fetch via `describeTable`.
- [ ] Step 1: Make it take `{ object }: { object: OpenObject }`, fetch on mount, render the existing table over fetched columns (map `col.data_type`, `col.nullable`, `col.is_pk`), with loading/error/empty states:
```tsx
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { describeTable } from "./objectApi";
import type { ColumnInfo } from "../../shared/types";
import type { OpenObject } from "../../stores/workspaceStore";

export function StructureShell({ object }: { object: OpenObject }) {
  const [cols, setCols] = useState<ColumnInfo[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setCols(null); setError("");
    describeTable(object.connId, object.table).then(setCols).catch((e) => setError(String(e)));
  }, [object.connId, object.table]);

  if (error) return <div className="p-4 text-xs text-danger">{error}</div>;
  if (!cols) return <div className="p-4 text-xs text-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</div>;
  // ... existing <table> markup but iterating `cols`, using col.data_type / col.nullable / col.is_pk
}
```
  (Reuse the current Structure `<table>` markup verbatim; only the data source and the field names `data_type`/`is_pk` change.)
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 8: Indexes tab — real indexes
**Files:** Modify `src/features/object-view/IndexesShell.tsx`
**Mirror:** keep current table markup; swap `MOCK_INDEXES` for fetched `IndexInfo[]`; fields are `name`/`columns`/`is_unique`/`index_type`.
- [ ] Step 1: Same fetch pattern as Task 7 but with `listIndexes(object.connId, object.table)`; render Name / Columns / Type (`index_type`) / Unique (`is_unique`). Loading/error/empty states.
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 9: Data tab — real rows (relational) / Mongo placeholder
**Files:** Modify `src/features/object-view/DataGridShell.tsx`
**Mirror:** keep the current sticky-header grid markup and NULL rendering; data source becomes a `runQuery` result.
- [ ] Step 1: Take `{ object }`. If `object.engine === "mongodb"`, render an `EmptyState` ("Document view — next milestone"). Otherwise fetch:
```tsx
const quote = object.engine === "mysql" ? `\`${object.table}\`` : `"${object.table}"`;
const sql = `SELECT * FROM ${quote} LIMIT 200`;
```
  call `runQuery(object.connId, sql)`, then render `result.columns` as headers and `result.rows` as rows. NULL → muted italic `NULL` (reuse current markup). Loading/error states. (Type badges from `describe_table` are out of scope here — the column header shows just the name; the typed Structure tab covers types.)
- [ ] Step 2: This is the one place that branches on engine in the frontend for **presentation/identifier quoting** — consistent with the existing engine branching in `ObjectView` (Data→Documents, hide DDL). Note in a code comment that a backend `table_preview` driver method is the proper long-term home.
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 10: DDL tab — build from columns (relational)
**Files:** Modify `src/features/object-view/DdlShell.tsx`
**Mirror:** keep the `<pre>` + Copy `IconButton` markup; build the CREATE text from `describeTable`.
- [ ] Step 1: Take `{ object }`, fetch `describeTable`, build an approximate statement client-side:
```tsx
const ddl = `CREATE TABLE ${object.table} (\n` +
  cols.map((c) => `  ${c.name} ${c.data_type}${c.is_pk ? " PRIMARY KEY" : ""}${c.nullable ? "" : " NOT NULL"}`).join(",\n") +
  `\n);`;
```
  Render in the existing `<pre>`. Note via comment that this is generated from column metadata (a true server-side DDL dump is a later slice). DDL tab is already hidden for Mongo by `ObjectView`.
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 11: ObjectView passes object to shells
**Files:** Modify `src/features/object-view/ObjectView.tsx`
**Mirror:** current file; only add the `object` prop to each shell.
- [ ] Step 1: Change the renders to `<DataGridShell object={object} />`, `<StructureShell object={object} />`, `<IndexesShell object={object} />`, `<DdlShell object={object} />`. No other change.
- [ ] Verify: `bun run typecheck` → exit 0; then `bun run build` → exit 0.

---

## Validation
```bash
bun run typecheck            # exit 0
bun run build                # exit 0
# Visual — full Tauri app (invoke needs the runtime). Docker Postgres `toolsql_demo` is available.
kill $(lsof -ti :1420) 2>/dev/null; bun run tauri dev
```
**Manual acceptance (`bun run tauri dev`, against `toolsql_demo` — postgres/postgres@localhost:5432):**
1. Create/connect the demo connection → expand it → see `orders`, `users`.
2. Click `users` → Structure shows 6 real columns (id PK, email NOT NULL, full_name nullable…); Indexes shows `users_pkey`/`users_email_key`/`users_full_name_idx`; Data shows 3 rows incl. NULL; DDL shows a generated CREATE.
3. Hover a connection → **Edit** opens the dialog prefilled; **Delete** shows an inline "Delete?" confirm → removes it.
4. Open a Mongo connection's collection (if available) → Data shows "Document view — next milestone"; Structure/Indexes still attempt real data.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Mongo `run_query` rejects `SELECT` | High (known) | Data tab is relational-only; Mongo shows a placeholder. Documented limitation. |
| Identifier quoting wrong for exotic table names | Low | Simple per-engine quote covers standard names; proper fix is a backend `table_preview` (noted). |
| `OpenObject` change breaks the one caller | Expected | Task 4→5 ordered together; typecheck gates it. Old mock `mockData.ts`/`mockTree.ts` unused, left as reference. |
| `bun run dev` (browser) can't call invoke | High if mis-verified | Visual pass uses `bun run tauri dev`; typecheck/build are the static gates. |
| `list_databases` empty for Postgres | Known | Not used in this slice (tables hang directly off the connection). DB/schema sub-levels deferred. |
| Plaintext passwords in `connections.json` (F20) | Pre-existing | Out of scope here; tracked in `docs/FEATURE-CHECKLIST.md`. |

## Acceptance ("done" criteria for /execute)
- [ ] All 11 tasks complete
- [ ] `bun run typecheck` and `bun run build` exit 0
- [ ] Manual walkthrough passes under `bun run tauri dev`
- [ ] No `src-tauri` changes; no raw `invoke` strings outside the feature `*Api.ts` wrappers; no `window.alert/confirm/prompt`
- [ ] No edits to old `src/components`, `src/hooks`, `src/stores/connectionStore.ts`
- [ ] Nothing beyond scope (no pagination/sort/filter, no cell editing, no SQL-console run, no Mongo doc viewer)
