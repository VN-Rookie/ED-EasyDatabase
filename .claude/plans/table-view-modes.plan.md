# Plan: Table, Tree, and Text View Modes

**Source:** User Request
**Complexity:** Medium

## Goal
Implement three distinct data view modes (**Table**, **Tree**, and **Text**) for both relational databases and MongoDB. In MongoDB, nested object/array values will be detected and rendered as collapsible elements in Tree view and as formatted object pills/modal in Table view, allowing inline editing.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| State Management | `src/stores/workspaceStore.ts:16` | Zustand store with custom state mapping and setters |
| Frontend View | `src/features/object-view/ObjectView.tsx:12` | Tabbed view selection rendering subviews conditionally |
| API Invocation | `src/features/object-view/objectApi.ts:17` | Tauri-backed Rust-command wrappers using generic inputs |
| Driver Trait | `src-tauri/src/drivers/mod.rs:14` | Polymorphic trait-based driver operations |
| MongoDB Driver | `src-tauri/src/drivers/mongo.rs:371` | Driver implementation handling MQL/SQL queries and coercion |

## Files to Change
| File | Action | Why |
|---|---|---|
| `src-tauri/src/drivers/mongo.rs` | MODIFY | Convert BSON Document/Array types to JSON Value instead of raw string representation, and implement `apply_batch_edits` sequentially. |
| `src/stores/workspaceStore.ts` | MODIFY | Add view mode selector store state (`dataViewModes`) to persist selections per open collection/table. |
| `src/lib/i18n/mapping.ts` | MODIFY | Add translations for view mode labels and selections in English and Vietnamese. |
| `src/features/object-view/DataGridCell.tsx` | MODIFY | Render object/array values as styled pills instead of plain text, and try parsing JSON inputs during inline edits. |
| `src/features/object-view/DataGridShell.tsx` | MODIFY | Add support for MongoDB custom query construction for filters, paging, and sorting. |
| `src/features/object-view/DocumentView.tsx` | MODIFY | Generalize metadata and row queries to support relational databases (SQL) as well as MongoDB. |
| `src/features/object-view/TextView.tsx` | CREATE | Render the current page of records/documents in a beautiful, read-only JSON CodeMirror view. |
| `src/features/object-view/DataViewShell.tsx` | CREATE | Container component that wraps the data tab, showing the Table/Tree/Text selector and rendering the active mode. |
| `src/features/object-view/ObjectView.tsx` | MODIFY | Route the `"data"` subview through `DataViewShell` instead of toggling between `DocumentView` and `DataGridShell` directly. |

## Tasks

### Task 1: Update Rust MongoDB Driver BSON conversion & Batch Edits
**Files:** Modify `src-tauri/src/drivers/mongo.rs`
**Mirror:** `json_to_bson` recursive mapping in `mongo.rs`
- [ ] Define `bson_to_json` function to properly map all nested BSON elements to JSON `serde_json::Value` (specifically `Bson::Array` and `Bson::Document` to `Value::Array` and `Value::Object` instead of calling `.to_string()`).
- [ ] Update `docs_to_result` in `mongo.rs` to parse driver results using `bson_to_json`.
- [ ] Implement `apply_batch_edits` for MongoDB driver to sequentially process updates, inserts, and deletes in a loop.
- [ ] Verify: Run `cargo check` and `cargo test` in `src-tauri` directory.

### Task 2: Extend Zustand Workspace Store & Translations
**Files:** Modify `src/stores/workspaceStore.ts`, `src/lib/i18n/mapping.ts`
**Mirror:** `pendingFilters` mapping pattern in `workspaceStore.ts`
- [ ] Add `dataViewModes: Map<string, "table" | "tree" | "text">` state to `WorkspaceState`.
- [ ] Add `setDataViewMode(objectId, mode)` action to update the view mode.
- [ ] Add English and Vietnamese translations for view modes (`viewModeLabel`, `viewModeTable`, `viewModeTree`, `viewModeText`).
- [ ] Verify: Run typescript check `bun run typecheck`.

### Task 3: Improve Object Detection and JSON Editing in DataGridCell
**Files:** Modify `src/features/object-view/DataGridCell.tsx`
**Mirror:** Inline editing state in `DataGridCell.tsx`
- [ ] Update `renderDisplayValue()`: if `currentValue` is an object, display a stylized pill `Object(N)` or `Array(N)` (using tailwind `bg-sky-950/30 px-1 rounded border border-sky-900/30 text-sky-400/80`) with the expand button.
- [ ] Update `handleSave()`: parse the user input using `JSON.parse` if it starts with `{` or `[`, and try parsing booleans/numbers before saving.
- [ ] Verify: Double-click an object cell, edit it, and verify that it parses JSON correctly.

### Task 4: Add MongoDB filter & paging support to DataGridShell
**Files:** Modify `src/features/object-view/DataGridShell.tsx`
**Mirror:** SQL query generation in `DataGridShell.tsx`
- [ ] Update `fetchPage` logic: if `isMongo` is true, format the query string as a valid MQL expression `db.<collection>.find({filter}).sort({sortColumn: sortDir}).limit(pageSize).skip(skip)` instead of SQL select.
- [ ] Verify: Switching MongoDB view to Table Mode can successfully fetch, sort, page, and filter using MQL.

### Task 5: Generalize DocumentView (Tree Mode) for SQL Databases
**Files:** Modify `src/features/object-view/DocumentView.tsx`
**Mirror:** MQL query generation in `DocumentView.tsx`
- [ ] Update `fetchPage` inside `DocumentView`: if it's a relational database, construct an SQL select query `SELECT * FROM <table> WHERE <filter> LIMIT <pageSize> OFFSET <skip>` instead of MQL.
- [ ] Update insert/edit/delete handlers inside `DocumentView`: if SQL database, use `insertRow`, `updateRow`, and `deleteRow` from `editApi.ts`.
- [ ] Verify: Tree view works correctly for SQL databases.

### Task 6: Create TextView & DataViewShell Wrapper Components
**Files:** Create `src/features/object-view/TextView.tsx`, `src/features/object-view/DataViewShell.tsx` · Modify `src/features/object-view/ObjectView.tsx`
**Mirror:** `SqlConsoleShell.tsx` (using CodeMirror) and `ObjectView.tsx` tab switching structure
- [ ] Create `TextView.tsx` using `@uiw/react-codemirror` and `oneDark` theme to render current page rows formatted as structured JSON.
- [ ] Create `DataViewShell.tsx` to display the "Table / Tree / Text" toolbar switcher and render the matching component.
- [ ] Update `ObjectView.tsx` to render `DataViewShell` for the `"data"` subview.
- [ ] Verify: Switch between Table, Tree, and Text views in the UI.

## Validation
```bash
# Verify Rust build
cd src-tauri && cargo check && cargo test
# Verify React typescript and bundle
cd .. && bun run typecheck && bun run build
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Parsing malformed JSON input in table cell edits | Low | Wrap parsing in try/catch; fallback to saving as raw string if it is not valid JSON. |
| MongoDB driver BSON conversion errors | Low | Ensure `bson_to_json` recursively handles all BSON variants. |

## Acceptance Criteria
- [ ] View Mode selector (Table, Tree, Text) appears on the data tab for both SQL and MongoDB.
- [ ] Table View renders a grid; MongoDB collection grid renders nested objects/arrays as formatted pills.
- [ ] Tree View shows card/tree layout; relational tables render columns as tree fields.
- [ ] Text View prints the current dataset as colorized JSON in CodeMirror.
- [ ] Saving cell edits parses JSON objects/arrays correctly.
- [ ] All linters and typecheckers pass successfully.
