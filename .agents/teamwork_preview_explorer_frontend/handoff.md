# Handoff Report — Frontend Audit and Performance Review

## 1. Observation

During our full code review and performance audit of the frontend React/TypeScript codebase (`src/`), the following exact paths, line numbers, and logic patterns were observed:

### A. Severe DataGrid/Cell Re-render and Performance Bottleneck
- **File**: `src/features/object-view/DataGridCell.tsx` (Lines 40–41)
  ```typescript
  const { editingCell, startEditing, stopEditing, getCellValue, isDirty, updateDirtyValue, rowsOffset, updateStagedRow } =
    useDataGridStore();
  ```
- **File**: `src/features/object-view/DataGridShell.tsx` (Line 477)
  ```typescript
  <DataGridCell
    column={c}
    rowIndex={i}
    value={row[c]}
    isPrimaryKey={isPk}
    isForeignKey={fkMap.has(c)}
    foreignKeyOptions={fkMap.has(c) ? fkOptions.get(c) ?? [] : []}
    dataType={colInfo?.data_type ?? "text"}
    onFkClick={onFkClick}
  />
  ```
- **Context**: Every `DataGridCell` component subscribes to the entire Zustand store because it calls `useDataGridStore()` without any selectors. Also, the `DataGridCell` component function is not wrapped in `React.memo()`.

### B. Duplicate Connection Stores (State Split)
- **File 1**: `src/stores/connectionStore.ts` (Lines 18–53) defines a Zustand store for saved/active connections.
- **File 2**: `src/features/connection/connectionStore.ts` (Lines 18–53) defines a duplicate Zustand store.
- **Imports**:
  - Legacy components like `src/components/SchemaTree.tsx` (Line 16) and legacy hooks like `src/hooks/useConnections.ts` (Line 3) import the root store:
    ```typescript
    import { useConnectionStore } from "../stores/connectionStore";
    ```
  - New feature components like `src/features/explorer/ExplorerTree.tsx` (Line 3) and `src/features/sql-console/SqlConsoleShell.tsx` (Line 20) import the feature store:
    ```typescript
    import { useConnectionStore } from "../connection/connectionStore";
    ```
- **Context**: These are two distinct Zustand store instances running side-by-side in the application, creating unsynced connection state pools.

### C. Leaked Event Listeners on Drag/Resize Unmount
- **File**: `src/components/SqlEditor.tsx` (Lines 102–116)
  ```typescript
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setEditorPct(Math.max(20, Math.min(80, pct)));
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);
  ```
- **Context**: The `mousemove` and `mouseup` event listeners are registered dynamically on the global `window` object. If the `SqlEditor` component unmounts while a drag is active, the event listeners are never cleaned up, resulting in a memory leak. Similar patterns exist in `src/components/DataGrid.tsx` lines 414–420.

### D. Foreign Key Click Navigation Object ID Inconsistency
- **File**: `src/features/object-view/DataGridShell.tsx` (Lines 739–750)
  ```typescript
  const targetObjId = `${object.connId}:${refTable}`;
  const filterValue = typeof value === "number" ? value : `'${String(value).replace(/'/g, "''")}'`;
  const filterStr = `${quoteIdent(refColumn, object.engine)} = ${filterValue}`;

  setPendingFilter(targetObjId, filterStr);
  openObject({
    id: targetObjId,
    connId: object.connId,
    table: refTable,
    label: refTable,
    engine: object.engine,
  });
  ```
- **File**: `src/features/explorer/ExplorerTree.tsx` (Lines 376–378)
  ```typescript
  const objId = conn.db_type === "postgres"
    ? `${conn.id}:${db}:${t.name}`
    : `${conn.id}:${db}:${t.name}`;
  ```
- **Context**: The `targetObjId` generated in `handleFkClick` has the structure `connId:refTable` (2 parts) and completely omits the schema/database `db` property. In contrast, `ExplorerTree` registers Postgres/Mongo tables as `connId:db:table` (3 parts). When opening an FK table, it opens with an invalid ID, fails to match the tree active node, and fails to switch to the correct database/schema since `object.database` is `undefined`.

---

## 2. Logic Chain

1. **Re-rendering Bottleneck**:
   - Calling `useDataGridStore()` without selectors subscribes the component to all store updates.
   - Any keystroke in a cell triggers `updateDirtyValue` which modifies the `dirtyCells` map reference.
   - Since `DataGridCell` is subscribed to the entire store, every cell re-renders on every keystroke.
   - Because `DataGridCell` is not memoized, parent `DataGrid` re-renders (which occur on cursor movement/selection) also force all child cells to re-render.
   - In a table of 100 rows and 50 columns (5,000 cells), typing a single character causes 5,000 redundant React component renders, creating severe lag.

2. **Split Connection State**:
   - Creating two separate instances of the Zustand connection store means they occupy different memory spaces.
   - Modifying state (like calling `addActiveConnection`) on the store instance at `src/features/connection/connectionStore.ts` does not update the store instance at `src/stores/connectionStore.ts`.
   - Any component importing from the root store will think there are zero active connections, even if the feature store lists active sessions.

3. **Memory Leaks**:
   - Dynamically bound window event listeners in `startDrag` (and column resizing) rely on the callback `onMouseUp` to remove themselves.
   - If a component unmounts mid-drag (e.g. if the tab is closed or connection drops), the `mouseup` event is never fired on that instance.
   - The `onMouseMove` callback keeps a closure over `containerRef` and React state updates. This leaks the memory of the unmounted DOM elements and React fibers, triggering React state update warnings on unmounted components if triggered post-unmount.

4. **Foreign Key Navigation Failure**:
   - `handleFkClick` constructs `targetObjId` without the database/schema namespace.
   - Because the ID is constructed as `connId:refTable`, it does not match the active tabs in `Workspace.tsx` (`connId:db:table`).
   - Consequently, the `ensureMongoDb` helper receives `undefined` for `object.database`, bypassing database/schema selection. This causes SQL queries in PostgreSQL schemas other than default/public to throw "relation not found" errors.

---

## 3. Caveats

- We did not audit the Tauri backend Rust database pool lifecycle or network protocols.
- We assumed standard React 19 concurrent features.
- We did not delete the unused legacy files in `src/components/` and `src/hooks/` as we are operating in a read-only investigation mode.

---

## 4. Conclusion

The React/TypeScript frontend codebase contains several performance and logical discrepancies due to a partial feature migration:
- **Performance**: Grid cell rendering scales quadratically with columns × rows on keystrokes due to full-store subscriptions and lack of memoization.
- **State Consistency**: Split connection stores divide active connection states, leading to inconsistent application behavior.
- **Memory Safety**: Global window dragging listeners lack unmount cleanup.
- **Routing/Navigation**: Foreign key links navigate to incomplete table IDs, bypassing search paths and databases.

---

## 5. Verification Method

### A. Performance Verification
1. Open the browser DevTools (React DevTools Profiler).
2. Double-click to edit any cell in `DataGrid` and type.
3. Observe in the flamegraph that all cells are re-rendered.
4. Apply the proposed selector fix (see below) and verify only the editing cell re-renders.

### B. State Consistence Verification
1. Run `eslint` or `grep` to verify all imports of `useConnectionStore` point to the single feature path:
   `src/features/connection/connectionStore.ts`
2. Ensure there are no imports pointing to `src/stores/connectionStore.ts`.

### C. Foreign Key Click Verification
1. Connect to PostgreSQL with a schema other than `public`.
2. Open a table that has a foreign key to another table in the same schema.
3. Click the foreign key link (`Link2` icon) to navigate to the referenced row.
4. Verify the referenced table opens successfully and queries data without schema errors.

---

## 6. Proposed Code Improvements (Implementation Sketches)

### Sketch 1: Optimize DataGridCell Subscriptions & Memoization
**File**: `src/features/object-view/DataGridCell.tsx`

Replace lines 40–41:
```typescript
  const { editingCell, startEditing, stopEditing, getCellValue, isDirty, updateDirtyValue, rowsOffset, updateStagedRow } =
    useDataGridStore();
```

With selectors and stable actions from the state:
```typescript
  // 1. Selector for editing mode: only re-renders when this cell's edit status changes
  const isEditing = useDataGridStore(
    useCallback((s) => s.editingCell?.rowIndex === rowIndex && s.editingCell?.column === column, [rowIndex, column])
  );

  // 2. Selector for cell value: only re-renders when the value of this specific cell changes
  const currentValue = useDataGridStore(
    useCallback((s) => s.getCellValue(rowIndex, column, value), [rowIndex, column, value])
  );

  // 3. Selector for dirtiness: only re-renders when this cell's dirtiness changes
  const hasDirty = useDataGridStore(
    useCallback((s) => s.isDirty(rowIndex, column), [rowIndex, column])
  );

  // 4. Stable actions (no reactive subscription)
  const startEditing = useDataGridStore((s) => s.startEditing);
  const stopEditing = useDataGridStore((s) => s.stopEditing);
  const updateStagedRow = useDataGridStore((s) => s.updateStagedRow);
  const updateDirtyValue = useDataGridStore((s) => s.updateDirtyValue);
```

Wrap the export in `React.memo` (Line 245):
```typescript
export const DataGridCell = React.memo(DataGridCellComponent);
```

---

### Sketch 2: Fix Foreign Key ID Click Navigation
**File**: `src/features/object-view/DataGridShell.tsx` (Lines 739–751)

Modify `handleFkClick`:
```typescript
  const handleFkClick = useCallback((column: string, value: unknown) => {
    const fk = foreignKeys.find((f) => {
      const cols = f.columns.split(",").map((c) => c.trim());
      return cols.includes(column);
    });
    if (!fk) return;

    const refTable = fk.referenced_table;
    const refColumn = fk.referenced_columns.split(",")[0]?.trim();
    if (!refColumn) return;

    // Use database/schema name in the generated ID if present to ensure matching tree node
    const targetObjId = object.database
      ? `${object.connId}:${object.database}:${refTable}`
      : `${object.connId}:${refTable}`;
      
    const filterValue = typeof value === "number" ? value : `'${String(value).replace(/'/g, "''")}'`;
    const filterStr = `${quoteIdent(refColumn, object.engine)} = ${filterValue}`;

    setPendingFilter(targetObjId, filterStr);
    openObject({
      id: targetObjId,
      connId: object.connId,
      table: refTable,
      label: refTable,
      engine: object.engine,
      database: object.database, // Propagate the database/schema name
    });
  }, [foreignKeys, object, openObject, setPendingFilter]);
```
