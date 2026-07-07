# Plan: Refresh — Connection, Database (Mongo), and Table Data

**Source:** User requirement 3 — "refresh data at level database, collection, table."
**Complexity:** Small

## Goal

Hover refresh buttons in the explorer re-fetch (a) a connection's tables/databases and
(b) a Mongo database's collections; a refresh button in the Data tab toolbar re-fetches
the current page + count. No caches survive a refresh.

## Patterns to Mirror

| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Hover action buttons | `src/features/explorer/ExplorerTree.tsx:237-243` | `opacity-0 group-hover:opacity-100` icon buttons |
| Cache-clearing | `ExplorerTree.tsx:65-69` (`handleConnect`) | filter out `id` and `id:*` keys immutably |
| Loaders | `ExplorerTree.tsx:79-103` | busy flag + try/catch → `connectionErrors` |
| Grid toolbar button | `DataGridShell.tsx` ColumnPicker button classes | small icon button, text-muted hover:text-fg |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/explorer/ExplorerTree.tsx` | MODIFY | force-reload loaders + refresh buttons on connection & db rows |
| `src/features/object-view/DataGridShell.tsx` | MODIFY | refreshKey state + toolbar refresh button |

## Tasks

### Task 1: Explorer — force-reload loaders + refresh buttons

**Files:** Modify `src/features/explorer/ExplorerTree.tsx`

- [ ] Step 1: Import `RefreshCw` from lucide-react.
- [ ] Step 2: Add a `force` flag so refresh bypasses the cache guards (the guards read
  a stale closure right after `setState`, so clearing state alone is not enough):

```ts
  const loadTablesForConn = async (id: string, force = false) => {
    if (!force && tables[id]) return;
    ...
  const loadDatabasesForConn = async (id: string, force = false) => {
    if (!force && databases[id]) return;
    ...
  const loadChildrenForConn = (conn: ConnectionConfig, force = false) =>
    conn.db_type === "mongodb" ? loadDatabasesForConn(conn.id, force) : loadTablesForConn(conn.id, force);
```

- [ ] Step 3: Extract the collection fetch out of `toggleDb` and add refresh handlers:

```ts
  const loadCollectionsForDb = async (connId: string, db: string) => {
    const key = `${connId}:${db}`;
    setDbBusy(key);
    try {
      await switchMongoDb(connId, db);
      const list = await listTables(connId);
      setTables((prev) => ({ ...prev, [key]: list }));
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [connId]: String(e) }));
    } finally {
      setDbBusy(null);
    }
  };
```

  `toggleDb` keeps its open/guard logic and calls `loadCollectionsForDb(connId, db)`.

```ts
  const refreshConn = (conn: ConnectionConfig) => {
    setTables((prev) => Object.fromEntries(
      Object.entries(prev).filter(([k]) => k !== conn.id && !k.startsWith(`${conn.id}:`))
    ));
    setDatabases((prev) => { const n = { ...prev }; delete n[conn.id]; return n; });
    setOpenDbs((prev) => new Set([...prev].filter((k) => !k.startsWith(`${conn.id}:`))));
    loadChildrenForConn(conn, true);
  };

  const refreshDb = (connId: string, db: string) => {
    setTables((prev) => { const n = { ...prev }; delete n[`${connId}:${db}`]; return n; });
    loadCollectionsForDb(connId, db);
  };
```

- [ ] Step 4: Connection row — in the hover action span (`:237`), when `active`, add
  before the Disconnect button:

```tsx
  <button onClick={() => refreshConn(conn)} title="Refresh" aria-label={`Refresh ${conn.name}`} className="text-muted hover:text-accent transition-colors"><RefreshCw size={11} /></button>
```

- [ ] Step 5: Db row — wrap the db `<button>` in `<div className="group/db w-full flex items-center">`
  and add beside it a hover refresh button:

```tsx
  <button
    onClick={() => refreshDb(conn.id, db)}
    title={`Refresh ${db}`}
    aria-label={`Refresh ${db}`}
    className="shrink-0 pr-2 opacity-0 group-hover/db:opacity-100 text-muted hover:text-accent transition-opacity"
  >
    <RefreshCw size={11} />
  </button>
```

- [ ] Verify: `bun run typecheck` → clean.

### Task 2: Data tab refresh button

**Files:** Modify `src/features/object-view/DataGridShell.tsx`

- [ ] Step 1: Shell state `const [refreshKey, setRefreshKey] = useState(0);` — append
  `refreshKey` to BOTH effects' dependency arrays (meta and page effects), so a refresh
  re-fetches count, structure, and rows.
- [ ] Step 2: Pass `onRefresh: () => setRefreshKey((k) => k + 1)` into `DataGrid`;
  render next to the ColumnPicker (import `RefreshCw`):

```tsx
  <button
    onClick={onRefresh}
    className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs text-muted hover:text-fg hover:bg-hover transition-colors"
    title="Refresh"
  >
    <RefreshCw size={11} />
  </button>
```

- [ ] Verify: `bun run typecheck && bun run test:run` → clean, 30 pass.

## Validation

```bash
bun run typecheck && bun run test:run && cd src-tauri && cargo check
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Refresh while another load in flight | Low | busy flags already serialize UI; last write wins, consistent with existing loaders |

## Acceptance

- [ ] Connection hover shows refresh; click reloads tables (SQL) / databases (Mongo)
- [ ] Mongo db row hover shows refresh; click reloads its collections
- [ ] Grid toolbar refresh re-fetches rows + count
- [ ] typecheck + vitest + cargo check pass
