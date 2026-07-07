# Plan: Table Row / Document Count in Data View

**Source:** User requirement 1 — "how many (count) data in this table?"
**Complexity:** Small

## Goal

The Data tab shows the total number of rows (SQL) / documents (Mongo) in the open
table, fetched via a new `count_rows` driver method — not just the 200 loaded rows.
This count is also the foundation the pagination slice (next plan) will reuse.

## Patterns to Mirror

| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Driver trait method | `src-tauri/src/drivers/mod.rs:18` (`describe_table`) | per-engine impl, normalized return |
| SQL scalar query | `src-tauri/src/drivers/postgres.rs:25-30` | `sqlx::query_as::<_, (T,)>(...).fetch_all/fetch_one` |
| Raw table interpolation | `src/features/object-view/DataGridShell.tsx:204` (`SELECT * FROM ${table}`) | same style — no quoting layer exists yet |
| Mongo count | `src-tauri/src/drivers/mongo.rs` `run_mql` Count arm | `coll.count_documents(filter)` |
| Thin command | `src-tauri/src/commands/query.rs:4-7` (`run_query`) | deserialize → driver call → Result |
| invoke wrapper | `src/features/object-view/objectApi.ts` (`runQuery`) | typed wrapper per feature |
| Toolbar UI | `src/features/object-view/DataGridShell.tsx:138` | left/right toolbar row above grid |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src-tauri/src/drivers/mod.rs` | MODIFY | add `count_rows` to `Driver` trait |
| `src-tauri/src/drivers/postgres.rs` | MODIFY | `SELECT COUNT(*)` impl |
| `src-tauri/src/drivers/mysql.rs` | MODIFY | `SELECT COUNT(*)` impl |
| `src-tauri/src/drivers/mongo.rs` | MODIFY | `count_documents({})` impl |
| `src-tauri/src/commands/query.rs` | MODIFY | `count_rows` command |
| `src-tauri/src/lib.rs` | MODIFY | register command |
| `src/features/object-view/objectApi.ts` | MODIFY | `countRows` wrapper |
| `src/features/object-view/DataGridShell.tsx` | MODIFY | fetch + display total count in toolbar |

## Tasks

### Task 1: `count_rows` on the Driver trait + all three engines

**Files:** Modify `src-tauri/src/drivers/mod.rs`, `postgres.rs`, `mysql.rs`, `mongo.rs`
**Mirror:** trait shape of `describe_table`; scalar query shape of `list_schemas`.

- [ ] Step 1: In `drivers/mod.rs`, add to the `Driver` trait (after `list_foreign_keys`):

```rust
    /// Total rows (SQL) / documents (Mongo) in a table or collection.
    async fn count_rows(&self, table: &str) -> Result<u64, AppError>;
```

- [ ] Step 2: In `postgres.rs` (inside `impl Driver for PostgresDriver`):

```rust
    async fn count_rows(&self, table: &str) -> Result<u64, AppError> {
        let (count,): (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(&self.pool)
            .await?;
        Ok(count.max(0) as u64)
    }
```

- [ ] Step 3: In `mysql.rs` (inside `impl Driver for MysqlDriver`), identical body:

```rust
    async fn count_rows(&self, table: &str) -> Result<u64, AppError> {
        let (count,): (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(&self.pool)
            .await?;
        Ok(count.max(0) as u64)
    }
```

- [ ] Step 4: In `mongo.rs` (inside `impl Driver for MongoDriver`):

```rust
    async fn count_rows(&self, table: &str) -> Result<u64, AppError> {
        let coll: mongodb::Collection<Document> = self.client
            .database(&self.current_db())
            .collection(table);
        coll.count_documents(Document::new())
            .await
            .map_err(|e| AppError::new(e.to_string()))
    }
```

- [ ] Verify: `cd src-tauri && cargo check` → clean (no new warnings), `cargo test` → all pass.

### Task 2: Thin command + registration

**Files:** Modify `src-tauri/src/commands/query.rs`, `src-tauri/src/lib.rs`
**Mirror:** `run_query` command at `query.rs:4-7`.

- [ ] Step 1: Append to `commands/query.rs`:

```rust
#[tauri::command]
pub async fn count_rows(conn_id: String, table: String, state: State<'_, AppState>) -> Result<u64, AppError> {
    state.driver(&conn_id)?.count_rows(&table).await
}
```

- [ ] Step 2: In `lib.rs` `generate_handler!`, after `commands::query::run_query,` add
  `commands::query::count_rows,`.
- [ ] Verify: `cd src-tauri && cargo check` → clean.

### Task 3: Frontend wrapper + toolbar display

**Files:** Modify `src/features/object-view/objectApi.ts`, `src/features/object-view/DataGridShell.tsx`
**Mirror:** `runQuery` wrapper; existing toolbar row in `DataGridShell`.

- [ ] Step 1: In `objectApi.ts`, next to `runQuery`:

```ts
export const countRows = (connId: string, table: string) =>
  invoke<number>("count_rows", { connId, table });
```

- [ ] Step 2: In `DataGridShell.tsx`:
  - Add state in `DataGridShell`: `const [totalRows, setTotalRows] = useState<number | null>(null);`
    and reset it (`setTotalRows(null);`) with the other resets in the effect.
  - In `fetchData`, add the count to the parallel fetch (import `countRows`):

```ts
        const [cols, data, fks, total] = await Promise.all([
          describeTable(object.connId, object.table),
          runQuery(object.connId, `SELECT * FROM ${object.table} LIMIT 200`),
          isMongo ? Promise.resolve([] as ForeignKeyInfo[]) : listForeignKeys(object.connId, object.table),
          countRows(object.connId, object.table),
        ]);
```

    then `setTotalRows(total);` next to `setResult(data);`.
  - Pass `totalRows` into `DataGrid` as a new prop `totalRows: number | null` and render
    it on the left side of the existing toolbar (the toolbar currently only has the
    ColumnPicker on the right):

```tsx
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-surface shrink-0">
        <span className="text-[11px] text-muted">
          {result.rows.length.toLocaleString()} of{" "}
          {totalRows !== null ? totalRows.toLocaleString() : "…"} {isMongo ? "documents" : "rows"}
        </span>
        <ColumnPicker columns={result.columns} hidden={hidden} onToggle={toggleCol} />
      </div>
```

    (`DataGrid` needs `isMongo` — derive it inside from `object.engine === "mongodb"`.)
- [ ] Verify: `bun run typecheck` → clean; `bun run test:run` → 30 tests still pass.

## Validation

```bash
cd src-tauri && cargo check && cargo test
cd .. && bun run typecheck && bun run test:run
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `COUNT(*)` slow on huge SQL tables | Low (target = individual devs) | acceptable v1; count runs in parallel with data fetch |
| Table name interpolation | Existing pattern everywhere (grid, edit ops) | no worse than current; centralized quoting is a separate refactor |
| Count fails but data loads | Low | count failure rejects the `Promise.all` like any other piece — one error path, consistent with current behavior |

## Acceptance ("done" criteria for /execute)

- [ ] Data tab toolbar shows "X of Y rows" (SQL) / "X of Y documents" (Mongo)
- [ ] `cargo check`, `cargo test`, `bun run typecheck`, `bun run test:run` pass
- [ ] No change beyond listed files
