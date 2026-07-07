# Plan: Data Grid Pagination

**Source:** User requirement 2 — "I want a pagination in table dataview."
**Complexity:** Small

## Goal

The Data tab pages through the table with Prev/Next controls and a "1–100 of N"
indicator instead of loading a fixed 200 rows. Works for SQL and Mongo (the Mongo
driver already parses `LIMIT n OFFSET m`). Reuses `totalRows` from the count slice.

## Patterns to Mirror

| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Paged query | `src-tauri/src/drivers/mongo.rs` `parse_mongo_select` | `SELECT * FROM t LIMIT n OFFSET m` already supported both engines |
| Toolbar | `src/features/object-view/DataGridShell.tsx` toolbar row | count text left, ColumnPicker right |
| Icon buttons | `src/features/explorer/ExplorerTree.tsx` (lucide icons, size 11-12) | `ChevronLeft`/`ChevronRight` |
| Named constants | CLAUDE.md rules (no magic numbers) | `const PAGE_SIZE = 100` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/object-view/DataGridShell.tsx` | MODIFY | page state, split data fetch from meta fetch, pagination controls |

No backend changes — `LIMIT/OFFSET` works in all three drivers today.

## Tasks

### Task 1: Page state + split fetch effects

**Files:** Modify `src/features/object-view/DataGridShell.tsx`
**Mirror:** existing fetch effect in the same file.

- [ ] Step 1: In `DataGridShell`, add `const PAGE_SIZE = 100;` (module level, above
  `ColumnPicker`) and page state: `const [page, setPage] = useState(0);`
- [ ] Step 2: Split the single effect into two:
  - **Meta effect** (deps unchanged: `[isMongo, object.connId, object.table, object.engine, object.database]`):
    resets everything including `setPage(0)`, fetches `describeTable` + FK metadata +
    `countRows` + FK options exactly as today, but NOT the row data.
  - **Data effect** (deps: same + `page`): fetches rows only —

```ts
  useEffect(() => {
    setResult(null); setError("");
    const fetchPage = async () => {
      try {
        await ensureMongoDb(object);
        const data = await runQuery(
          object.connId,
          `SELECT * FROM ${object.table} LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`
        );
        setResult(data);
      } catch (e) {
        setError(String(e));
      }
    };
    fetchPage();
  }, [object.connId, object.table, object.engine, object.database, page]);
```

  The meta effect keeps its own try/catch and no longer sets `setResult`.
- [ ] Verify: `bun run typecheck` → clean.

### Task 2: Pagination controls in the toolbar

**Files:** Modify `src/features/object-view/DataGridShell.tsx` (`DataGrid` + shell)
**Mirror:** toolbar row added in the count slice.

- [ ] Step 1: Pass `page`, `onPageChange: (p: number) => void` into `DataGrid`
  alongside `totalRows`.
- [ ] Step 2: Replace the toolbar count text with range + controls
  (import `ChevronLeft, ChevronRight` from lucide-react):

```tsx
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">
            {result.rows.length === 0
              ? `0 ${isMongo ? "documents" : "rows"}`
              : `${(page * PAGE_SIZE + 1).toLocaleString()}–${(page * PAGE_SIZE + result.rows.length).toLocaleString()} of ${
                  totalRows !== null ? totalRows.toLocaleString() : "…"
                } ${isMongo ? "documents" : "rows"}`}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="p-1 rounded-[var(--radius-sm)] text-muted hover:text-fg hover:bg-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Previous page"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="text-[11px] text-muted px-1">
              {page + 1}{totalRows !== null ? ` / ${Math.max(1, Math.ceil(totalRows / PAGE_SIZE))}` : ""}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={totalRows !== null && (page + 1) * PAGE_SIZE >= totalRows}
              className="p-1 rounded-[var(--radius-sm)] text-muted hover:text-fg hover:bg-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Next page"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
        <ColumnPicker columns={result.columns} hidden={hidden} onToggle={toggleCol} />
      </div>
```

- [ ] Step 3: Shell renders `<DataGrid ... page={page} onPageChange={setPage} />`.
  While a page is loading (`!result`) keep the existing Spinner branch.
- [ ] Verify: `bun run typecheck && bun run test:run` → clean, 30 pass.

## Validation

```bash
bun run typecheck && bun run test:run
cd src-tauri && cargo check
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Page beyond last (rows deleted meanwhile) | Low | empty page shows "0 rows"; Prev still enabled |
| Mongo OFFSET skip cost on huge collections | Low | acceptable v1, same as DataGrip default behavior |

## Acceptance

- [ ] Prev/Next page through data; range indicator correct; Prev disabled on page 1, Next disabled on last
- [ ] Switching tables resets to page 1
- [ ] typecheck + vitest + cargo check pass
