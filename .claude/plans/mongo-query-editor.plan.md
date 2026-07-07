# Plan: MongoDB Query Editor Handling in the Console

**Source:** User requirement 4 — "I need a handle editor for querying with mongodb."
**Complexity:** Small-Medium

## Goal

The SQL console becomes a real Mongo editor when a Mongo connection is selected:
(a) a **database selector** so queries target the right db (the backend `run_query`
uses the driver's current db), and (b) **MQL autocompletion** — collection names after
`db.`, chainable methods after `.`, and `$` operators — replacing the SQL-only
completions. Backend MQL execution already exists (find/findOne/countDocuments).

## Grounding (verified)

- `SqlConsoleShell.tsx:146` `isMongoConnection`; `:155` Mongo default query; `:395-396`
  language + completion switch (Mongo currently gets `override: []` — nothing).
- `:161-191` schema-cache effect skips Mongo entirely → no collections available.
- `:352-391` `sqlCompletionSource` pattern to mirror (`context.matchBefore`,
  `{from, options, validFor}`).
- `schemaApi.ts` exports `listDatabases`, `switchMongoDb`, `listTables`.
- Connection `<select>` markup at `:407-420` to mirror for the db selector.

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/sql-console/SqlConsoleShell.tsx` | MODIFY | db selector, Mongo schema cache, MQL completion source |

## Tasks

### Task 1: Mongo database selector

- [ ] Step 1: Import `listDatabases, switchMongoDb` from `../explorer/schemaApi`
  (extend the existing import line).
- [ ] Step 2: State + load effect (near the other state in `SqlConsoleShell`):

```ts
  const [mongoDbs, setMongoDbs] = useState<string[]>([]);
  const [mongoDb, setMongoDb] = useState("");

  // MongoDB: list databases for the console's db selector.
  useEffect(() => {
    if (!connId || !isMongoConnection) { setMongoDbs([]); setMongoDb(""); return; }
    listDatabases(connId).then(setMongoDbs).catch(() => setMongoDbs([]));
  }, [connId, isMongoConnection]);

  const handleMongoDbChange = async (db: string) => {
    setMongoDb(db);
    try {
      await switchMongoDb(connId, db);
    } catch (e) {
      setError(String(e));
    }
  };
```

- [ ] Step 3: Render after the connection selector (mirror its markup):

```tsx
        {isMongoConnection && (
          <div className="relative flex items-center">
            <select
              value={mongoDb}
              onChange={(e) => handleMongoDbChange(e.target.value)}
              className="appearance-none bg-elevated border border-border rounded-[var(--radius-sm)] text-xs text-fg pl-2.5 pr-6 py-1 cursor-pointer hover:border-accent focus:outline-none focus:border-accent transition-colors"
              title="MongoDB database"
            >
              <option value="" disabled>database…</option>
              {mongoDbs.map((db) => <option key={db} value={db}>{db}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 text-muted pointer-events-none" />
          </div>
        )}
```

- [ ] Verify: `bun run typecheck` → clean.

### Task 2: Collections in the schema cache for Mongo

- [ ] Step 1: Change the schema effect guard from `if (!connId || isMongoConnection) return;`
  to `if (!connId) return;`, wrap the per-table `describeTable` column loop in
  `if (!isMongoConnection) { ... }` (sampling every collection is too slow — collection
  names are enough for MQL completion), and add `mongoDb` to the dependency array so
  collections reload after a db switch.
- [ ] Verify: `bun run typecheck` → clean.

### Task 3: MQL completion source

- [ ] Step 1: Module-level constants next to `SQL_KEYWORDS`:

```ts
const MQL_METHODS = ["find", "findOne", "countDocuments", "sort", "limit", "skip"];
const MQL_OPERATORS = [
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin",
  "$and", "$or", "$not", "$regex", "$exists", "$type", "$size", "$elemMatch",
];
```

- [ ] Step 2: Completion source below `sqlCompletionSource` (order matters: check
  `db.` before the generic `.` pattern):

```ts
  // MQL completion: collections after "db.", methods after ".", $ operators.
  const mongoCompletionSource = useCallback((context: CompletionContext): CompletionResult | null => {
    const dbMatch = context.matchBefore(/db\.\w*/);
    if (dbMatch) {
      return {
        from: dbMatch.from + 3,
        options: schemaCache.tables.map((t) => ({ label: t.name, type: "class", detail: "collection" })),
        validFor: /^\w*$/,
      };
    }
    const opMatch = context.matchBefore(/\$\w*/);
    if (opMatch) {
      return {
        from: opMatch.from,
        options: MQL_OPERATORS.map((o) => ({ label: o, type: "keyword" })),
        validFor: /^\$\w*$/,
      };
    }
    const methodMatch = context.matchBefore(/\.\w*/);
    if (methodMatch) {
      return {
        from: methodMatch.from + 1,
        options: MQL_METHODS.map((m) => ({ label: m, type: "function", detail: "method" })),
        validFor: /^\w*$/,
      };
    }
    return null;
  }, [schemaCache]);
```

- [ ] Step 3: Wire it in `cmExtensions`:
  `autocompletion({ override: isMongoConnection ? [mongoCompletionSource] : [sqlCompletionSource] })`.
- [ ] Verify: `bun run typecheck && bun run test:run` → clean, 30 pass.

## Validation

```bash
bun run typecheck && bun run test:run && cd src-tauri && cargo check
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| User runs query before picking a db | Certain initially | driver's connect-time default db is used — same behavior as today, selector makes it explicit |
| Db selector out of sync with explorer's switch | Medium | both call the same `switch_mongo_db`; object tabs re-assert their db via `ensureMongoDb` before every fetch, so grids stay correct |

## Acceptance

- [ ] Mongo connection in console shows a database dropdown; picking one routes queries to it
- [ ] Typing `db.` completes collection names; `.` completes find/findOne/countDocuments/sort/limit/skip; `$` completes operators
- [ ] SQL connections keep their existing completions untouched
- [ ] typecheck + vitest + cargo check pass
