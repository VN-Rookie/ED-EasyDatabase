# Plan: MongoDB Documents View + MQL Query Support

**Source:** User report — "collections show nothing in the Data tab" + "plan how to handle query for Mongo since it differs from Postgres/MySQL".
**Complexity:** Medium

## Goal

Opening a MongoDB collection shows its documents in the data grid (with working inline
edit on `_id`), and the SQL console accepts real MQL (`db.<collection>.find({...})`,
`countDocuments`) against the backend. Fix the stale current-db bug when collections
from different Mongo databases are open.

## Root-Cause Findings (verified in code)

1. **No data in collections:** `src/features/object-view/DataGridShell.tsx:196` skips the
   fetch (`if (isMongo) return;`) and `:240` renders a hard-coded EmptyState
   ("Document view — next milestone"). Backend already supports the grid's query:
   `src-tauri/src/drivers/mongo.rs:72` (`parse_mongo_select`) turns
   `SELECT * FROM <col> LIMIT n` into `find()`.
2. **Console MQL is frontend-only:** `SqlConsoleShell.tsx:146-155` already switches the
   editor to MQL mode and defaults to `db.collection.find({})`, but
   `mongo.rs::run_query` (`:219`) only parses the mini-SQL form → any MQL the user
   types errors out.
3. **`list_foreign_keys` errors for Mongo** (`drivers/mod.rs:20-23` default impl), and
   `DataGridShell`/`StructureShell` fetch it inside `Promise.all` — enabling the Mongo
   grid without branching would fail the whole fetch.
4. **`_id` edits can never match:** grid rows carry `_id` as a hex string
   (`mongo.rs:280` `oid.to_hex()`), but `update_row`/`delete_row` (`mongo.rs:398,425`)
   filter with `Bson::String` — never equals a stored `ObjectId`.
5. **Stale current-db:** `MongoDriver` holds one `RwLock<String>` current db;
   `ExplorerTree.openMongoCollection` switches db only at open time. Re-activating a
   tab from another db refetches against the wrong db. `OpenObject`
   (`src/stores/workspaceStore.ts:5`) doesn't carry the database.

## Patterns to Mirror

| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Driver errors | `src-tauri/src/drivers/mongo.rs:116` | `.map_err(\|e\| AppError::new(e.to_string()))` |
| SQL→Mongo parsing | `src-tauri/src/drivers/mongo.rs:72-111` | pure `fn parse_*` returning `Option<struct>`, driver method does I/O |
| Rust tests | `src-tauri/src/drivers/mod.rs:112-129` | `#[cfg(test)] mod tests` in the same file; pure-function tests need no live DB |
| invoke wrappers | `src/features/object-view/objectApi.ts:4-14` | `export const x = (connId, ...) => invoke<T>("cmd", {...})` |
| Shell fetch/error | `src/features/object-view/IndexesShell.tsx:11-14` | fetch in `useEffect`, `catch((e) => setError(String(e)))` |
| Engine branching in UI | `src/features/object-view/ObjectView.tsx:12-17` | `const isMongo = object.engine === "mongodb"` then ternary — no engine branching leaks to backend |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src-tauri/src/drivers/mongo.rs` | MODIFY | extract doc→result helper; add MQL parser + executor; ObjectId coercion; unit tests |
| `src/stores/workspaceStore.ts` | MODIFY | add `database?: string` to `OpenObject` |
| `src/features/explorer/ExplorerTree.tsx` | MODIFY | pass `database` when opening a Mongo collection |
| `src/features/object-view/objectApi.ts` | MODIFY | add `ensureMongoDb` helper |
| `src/features/object-view/DataGridShell.tsx` | MODIFY | enable Mongo fetch; skip FK lookup; drop placeholder |
| `src/features/object-view/StructureShell.tsx` | MODIFY | skip FK lookup for Mongo; ensure db context |
| `src/features/object-view/IndexesShell.tsx` | MODIFY | ensure db context before listing indexes |

## Tasks

### Task 1: Extract `docs_to_result` helper in the Mongo driver

**Files:** Modify `src-tauri/src/drivers/mongo.rs:246-289`
**Mirror:** existing conversion code — this is a pure move, no behavior change.

- [ ] Step 1: Add a module-level function containing the exact conversion currently
  inlined in `run_query` (union of field names with `_id` first, Bson→JSON per cell):

```rust
/// Convert fetched documents into a QueryResult (columns = union of field
/// names across docs, `_id` first; exotic Bson degrades to its string form).
fn docs_to_result(all_docs: Vec<Document>) -> QueryResult {
    use mongodb::bson::Bson;

    if all_docs.is_empty() {
        return QueryResult { columns: vec![], rows: vec![], rows_affected: None };
    }

    let mut field_set: std::collections::LinkedList<String> = std::collections::LinkedList::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    if seen.insert("_id".to_string()) { field_set.push_back("_id".to_string()); }
    for doc in &all_docs {
        for key in doc.keys() {
            if key != "_id" && seen.insert(key.to_string()) {
                field_set.push_back(key.to_string());
            }
        }
    }
    let columns: Vec<String> = field_set.into_iter().collect();

    let rows = all_docs.iter().map(|doc| {
        let mut map = serde_json::Map::new();
        for col in &columns {
            let val = match doc.get(col.as_str()) {
                None => Value::Null,
                Some(Bson::Null) => Value::Null,
                Some(Bson::Boolean(b)) => Value::Bool(*b),
                Some(Bson::Int32(n)) => json!(n),
                Some(Bson::Int64(n)) => json!(n),
                Some(Bson::Double(n)) => json!(n),
                Some(Bson::String(s)) => Value::String(s.clone()),
                Some(Bson::ObjectId(oid)) => Value::String(oid.to_hex()),
                Some(Bson::DateTime(dt)) => Value::String(dt.to_string()),
                Some(other) => Value::String(other.to_string()),
            };
            map.insert(col.clone(), val);
        }
        Value::Object(map)
    }).collect();

    QueryResult { columns, rows, rows_affected: None }
}
```

- [ ] Step 2: In `run_query`, replace lines 251–289 (the `if all_docs.is_empty()` block
  through `Ok(QueryResult {...})`) with `Ok(docs_to_result(all_docs))`.
- [ ] Verify: `cd src-tauri && cargo check` → no errors, no new warnings.

### Task 2: MQL parser (`db.<collection>.find/countDocuments`) + unit tests

**Files:** Modify `src-tauri/src/drivers/mongo.rs` (module-level fns + tests)
**Mirror:** `parse_mongo_select` at `mongo.rs:72` — pure parse fns, I/O stays in the driver method.

- [ ] Step 1: Add the chain parser (handles nested braces and quoted strings inside args):

```rust
/// One parsed call in a `db.<coll>.method(args).method(args)` chain.
struct MqlCall {
    method: String,
    args: String, // raw text between the parens
}

/// Extract the contents of a balanced `(...)` that `s` starts with.
/// Returns (inner, rest_after_closing_paren). Respects strings and nesting.
fn extract_parens(s: &str) -> Option<(String, &str)> {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'(') { return None; }
    let mut depth: i32 = 0;
    let mut in_str: Option<u8> = None;
    let mut escaped = false;
    for (i, &b) in bytes.iter().enumerate() {
        if let Some(q) = in_str {
            if escaped { escaped = false; }
            else if b == b'\\' { escaped = true; }
            else if b == q { in_str = None; }
            continue;
        }
        match b {
            b'"' | b'\'' => in_str = Some(b),
            b'(' | b'{' | b'[' => depth += 1,
            b')' | b'}' | b']' => {
                depth -= 1;
                if depth == 0 && b == b')' {
                    return Some((s[1..i].trim().to_string(), &s[i + 1..]));
                }
                if depth < 0 { return None; }
            }
            _ => {}
        }
    }
    None
}

/// Parse `db.<collection>.method(args)[.method(args)...]` (trailing `;` ok).
fn parse_mql_chain(input: &str) -> Option<(String, Vec<MqlCall>)> {
    let s = input.trim().trim_end_matches(';').trim();
    let rest = s.strip_prefix("db.")?;
    let dot = rest.find('.')?;
    let collection = rest[..dot].trim().to_string();
    if collection.is_empty() { return None; }
    let mut rest = &rest[dot + 1..];
    let mut calls = Vec::new();
    loop {
        let paren = rest.find('(')?;
        let method = rest[..paren].trim().to_string();
        if method.is_empty() || !method.chars().all(|c| c.is_ascii_alphanumeric()) {
            return None;
        }
        let (args, after) = extract_parens(&rest[paren..])?;
        calls.push(MqlCall { method, args });
        let after = after.trim_start();
        if after.is_empty() { break; }
        rest = after.strip_prefix('.')?;
    }
    Some((collection, calls))
}

/// Split `find(filter, projection)` args at the single top-level comma.
fn split_top_level_comma(s: &str) -> Vec<String> {
    let bytes = s.as_bytes();
    let mut depth: i32 = 0;
    let mut in_str: Option<u8> = None;
    let mut escaped = false;
    let mut parts = Vec::new();
    let mut start = 0usize;
    for (i, &b) in bytes.iter().enumerate() {
        if let Some(q) = in_str {
            if escaped { escaped = false; }
            else if b == b'\\' { escaped = true; }
            else if b == q { in_str = None; }
            continue;
        }
        match b {
            b'"' | b'\'' => in_str = Some(b),
            b'(' | b'{' | b'[' => depth += 1,
            b')' | b'}' | b']' => depth -= 1,
            b',' if depth == 0 => { parts.push(s[start..i].trim().to_string()); start = i + 1; }
            _ => {}
        }
    }
    parts.push(s[start..].trim().to_string());
    parts
}

/// Parse a JSON object argument ("" -> empty doc). Strict JSON: keys must be
/// double-quoted; the error message says so.
fn parse_json_doc(raw: &str) -> Result<Document, AppError> {
    let raw = raw.trim();
    if raw.is_empty() { return Ok(Document::new()); }
    let value: Value = serde_json::from_str(raw).map_err(|e| {
        AppError::new(format!(
            "Invalid JSON in MongoDB query (keys and strings must be double-quoted): {e}"
        ))
    })?;
    match value {
        Value::Object(map) => json_map_to_doc(&map),
        _ => Err(AppError::new("MongoDB query argument must be a JSON object")),
    }
}
```

- [ ] Step 2: Add the parsed-operation builder:

```rust
const DEFAULT_MQL_LIMIT: i64 = 100;

enum MqlOp {
    Find {
        collection: String,
        filter: Document,
        projection: Option<Document>,
        sort: Option<Document>,
        limit: i64,
        skip: u64,
    },
    Count { collection: String, filter: Document },
}

fn parse_mql(input: &str) -> Result<MqlOp, AppError> {
    let unsupported = || AppError::new(
        "Unsupported MongoDB query. Supported: db.<collection>.find({filter}, {projection}?)\
         .sort({...})?.limit(n)?.skip(n)? and db.<collection>.countDocuments({filter}?)",
    );
    let (collection, calls) = parse_mql_chain(input).ok_or_else(unsupported)?;
    let first = calls.first().ok_or_else(unsupported)?;

    match first.method.as_str() {
        "countDocuments" | "count" => {
            if calls.len() > 1 { return Err(unsupported()); }
            Ok(MqlOp::Count { collection, filter: parse_json_doc(&first.args)? })
        }
        "find" | "findOne" => {
            let parts = split_top_level_comma(&first.args);
            if parts.len() > 2 { return Err(unsupported()); }
            let filter = parse_json_doc(&parts[0])?;
            let projection = match parts.get(1) {
                Some(p) if !p.is_empty() => Some(parse_json_doc(p)?),
                _ => None,
            };
            let mut sort = None;
            let mut limit = if first.method == "findOne" { 1 } else { DEFAULT_MQL_LIMIT };
            let mut skip = 0u64;
            for call in &calls[1..] {
                match call.method.as_str() {
                    "sort" => sort = Some(parse_json_doc(&call.args)?),
                    "limit" => limit = call.args.trim().parse::<i64>()
                        .map_err(|_| AppError::new("limit(n) expects an integer"))?,
                    "skip" => skip = call.args.trim().parse::<u64>()
                        .map_err(|_| AppError::new("skip(n) expects an integer"))?,
                    _ => return Err(unsupported()),
                }
            }
            Ok(MqlOp::Find { collection, filter, projection, sort, limit, skip })
        }
        _ => Err(unsupported()),
    }
}
```

- [ ] Step 3: Add pure-parser tests to the existing `#[cfg(test)] mod tests`
  (no live DB needed — mirror `connect_rejects_unknown_engine` style):

```rust
#[test]
fn parses_plain_find() {
    let op = parse_mql(r#"db.users.find({})"#).expect("parse failed");
    match op {
        MqlOp::Find { collection, filter, limit, skip, .. } => {
            assert_eq!(collection, "users");
            assert!(filter.is_empty());
            assert_eq!(limit, DEFAULT_MQL_LIMIT);
            assert_eq!(skip, 0);
        }
        _ => panic!("expected Find"),
    }
}

#[test]
fn parses_find_with_filter_sort_limit_skip() {
    let op = parse_mql(r#"db.orders.find({"status": "paid", "total": {"$gt": 10}}).sort({"created_at": -1}).limit(20).skip(40);"#)
        .expect("parse failed");
    match op {
        MqlOp::Find { collection, filter, sort, limit, skip, .. } => {
            assert_eq!(collection, "orders");
            assert_eq!(filter.get_str("status").unwrap(), "paid");
            assert!(sort.is_some());
            assert_eq!(limit, 20);
            assert_eq!(skip, 40);
        }
        _ => panic!("expected Find"),
    }
}

#[test]
fn parses_find_with_projection() {
    let op = parse_mql(r#"db.users.find({"age": {"$gte": 18}}, {"name": 1, "email": 1})"#)
        .expect("parse failed");
    match op {
        MqlOp::Find { projection, .. } => assert!(projection.is_some()),
        _ => panic!("expected Find"),
    }
}

#[test]
fn parses_count_documents() {
    let op = parse_mql(r#"db.users.countDocuments({"active": true})"#).expect("parse failed");
    match op {
        MqlOp::Count { collection, filter } => {
            assert_eq!(collection, "users");
            assert_eq!(filter.get_bool("active").unwrap(), true);
        }
        _ => panic!("expected Count"),
    }
}

#[test]
fn rejects_unquoted_keys_with_clear_message() {
    let err = parse_mql(r#"db.users.find({name: "x"})"#).unwrap_err();
    assert!(err.0.contains("double-quoted"));
}

#[test]
fn rejects_unsupported_method() {
    assert!(parse_mql(r#"db.users.drop()"#).is_err());
    assert!(parse_mql(r#"SELECT 1"#).is_err());
}

#[test]
fn handles_strings_containing_braces_and_parens() {
    let op = parse_mql(r#"db.users.find({"note": "weird ) } value"})"#).expect("parse failed");
    match op {
        MqlOp::Find { filter, .. } => assert_eq!(filter.get_str("note").unwrap(), "weird ) } value"),
        _ => panic!("expected Find"),
    }
}
```

- [ ] Verify: `cd src-tauri && cargo test drivers::mongo -- --nocapture` → all new
  parser tests PASS (write tests first, watch them fail to compile/pass, then they
  pass after Steps 1–2 code is in — RED→GREEN per repo TDD rule).

### Task 3: Route `run_query` — `db.` prefix → MQL executor, else existing SELECT path

**Files:** Modify `src-tauri/src/drivers/mongo.rs:219-290` (`run_query`)
**Mirror:** existing `run_query` structure; reuse `docs_to_result` from Task 1.

- [ ] Step 1: At the top of `run_query`, branch on the trimmed input:

```rust
async fn run_query(&self, sql: &str) -> Result<QueryResult, AppError> {
    use mongodb::bson::{doc, Document};
    use futures_util::StreamExt;

    let db = self.current_db();

    if sql.trim_start().starts_with("db.") {
        return self.run_mql(&db, sql).await;
    }

    let parsed = parse_mongo_select(sql)
        .ok_or_else(|| AppError::new(
            "MongoDB queries must be MQL, e.g. db.<collection>.find({\"field\": \"value\"})",
        ))?;
    // ... existing find path unchanged, ending in Ok(docs_to_result(all_docs))
```

- [ ] Step 2: Add the executor as an inherent method on `MongoDriver` (next to `current_db`):

```rust
async fn run_mql(&self, db: &str, input: &str) -> Result<QueryResult, AppError> {
    use futures_util::StreamExt;

    match parse_mql(input)? {
        MqlOp::Count { collection, filter } => {
            let coll: mongodb::Collection<Document> =
                self.client.database(db).collection(&collection);
            let count = coll.count_documents(filter).await
                .map_err(|e| AppError::new(e.to_string()))?;
            Ok(QueryResult {
                columns: vec!["count".to_string()],
                rows: vec![json!({ "count": count })],
                rows_affected: None,
            })
        }
        MqlOp::Find { collection, filter, projection, sort, limit, skip } => {
            let coll: mongodb::Collection<Document> =
                self.client.database(db).collection(&collection);
            let mut find = coll.find(filter).limit(limit).skip(skip);
            if let Some(p) = projection { find = find.projection(p); }
            if let Some(s) = sort { find = find.sort(s); }
            let mut cursor = find.await.map_err(|e| AppError::new(e.to_string()))?;
            let mut all_docs: Vec<Document> = Vec::new();
            while let Some(doc) = cursor.next().await {
                all_docs.push(doc.map_err(|e| AppError::new(e.to_string()))?);
            }
            Ok(docs_to_result(all_docs))
        }
    }
}
```

- [ ] Verify: `cd src-tauri && cargo check && cargo test drivers::mongo` → compiles,
  all tests PASS. (Console→backend wiring needs no change: `SqlConsoleShell` already
  sends the raw editor text through `run_query`.)

### Task 4: Coerce string `_id` to ObjectId in `update_row` / `delete_row`

**Files:** Modify `src-tauri/src/drivers/mongo.rs:392-437`
**Mirror:** `json_to_bson` helper style at `mongo.rs:26`.

- [ ] Step 1: Add module-level helper + test:

```rust
/// Grid rows carry `_id` as the hex string form of an ObjectId
/// (see docs_to_result). Convert it back so PK filters actually match.
fn coerce_pk_bson(pk_column: &str, value: Bson) -> Bson {
    if pk_column == "_id" {
        if let Bson::String(s) = &value {
            if let Ok(oid) = mongodb::bson::oid::ObjectId::parse_str(s) {
                return Bson::ObjectId(oid);
            }
        }
    }
    value
}
```

```rust
#[test]
fn coerces_hex_id_string_to_object_id() {
    let coerced = coerce_pk_bson("_id", Bson::String("507f1f77bcf86cd799439011".into()));
    assert!(matches!(coerced, Bson::ObjectId(_)));
    // non-hex strings and non-_id columns pass through untouched
    assert!(matches!(coerce_pk_bson("_id", Bson::String("abc".into())), Bson::String(_)));
    assert!(matches!(
        coerce_pk_bson("email", Bson::String("507f1f77bcf86cd799439011".into())),
        Bson::String(_)
    ));
}
```

- [ ] Step 2: In `update_row` (`:398`) and `delete_row` (`:425`) wrap the pk value:

```rust
let pk_bson = coerce_pk_bson(&input.pk_column, json_to_bson(&input.pk_value));
```

- [ ] Verify: `cd src-tauri && cargo test drivers::mongo` → PASS.

### Task 5: Carry the database on `OpenObject` + `ensureMongoDb` helper

**Files:** Modify `src/stores/workspaceStore.ts:5-11`, `src/features/explorer/ExplorerTree.tsx` (`openMongoCollection`), `src/features/object-view/objectApi.ts`
**Mirror:** invoke-wrapper style `objectApi.ts:4-14`; `switchMongoDb` already exists in `schemaApi.ts:7`.

- [ ] Step 1: Add the field to `OpenObject` in `workspaceStore.ts`:

```ts
export interface OpenObject {
  id: string;          // unique key, e.g. "conn1:users"
  connId: string;      // active connection id (= conn_id for schema/query commands)
  table: string;       // raw table/collection name for backend calls
  label: string;       // display name
  engine: "postgres" | "mysql" | "mongodb";
  database?: string;   // MongoDB only: the db this collection lives in
}
```

- [ ] Step 2: In `ExplorerTree.tsx` `openMongoCollection`, include it:

```ts
openObject({ id: `${conn.id}:${db}:${table}`, connId: conn.id, table, label: table, engine: conn.db_type, database: db });
```

- [ ] Step 3: Add to `objectApi.ts` (top, after imports):

```ts
import { switchMongoDb } from "../explorer/schemaApi";
import type { OpenObject } from "../../stores/workspaceStore";

/**
 * The Mongo driver has a single "current database". Point it at this
 * object's database before any schema/data call so a tab from another
 * db doesn't read stale context. No-op for SQL engines.
 */
export const ensureMongoDb = async (object: Pick<OpenObject, "connId" | "engine" | "database">) => {
  if (object.engine === "mongodb" && object.database) {
    await switchMongoDb(object.connId, object.database);
  }
};
```

- [ ] Verify: `bun run typecheck` → clean.

### Task 6: Enable the Mongo Documents grid in `DataGridShell`

**Files:** Modify `src/features/object-view/DataGridShell.tsx:184-250`
**Mirror:** its own existing SQL fetch path; keep the `DataGrid` component untouched.

- [ ] Step 1: In the `useEffect` (`:195`), delete `if (isMongo) return;`, call
  `ensureMongoDb` first, and make the FK lookup engine-conditional:

```ts
useEffect(() => {
  setResult(null); setColumns([]); setForeignKeys([]); setFkOptions(new Map()); setError("");

  const fetchData = async () => {
    try {
      await ensureMongoDb(object);
      // Fetch table structure, data, and FK metadata in parallel
      const [cols, data, fks] = await Promise.all([
        describeTable(object.connId, object.table),
        runQuery(object.connId, `SELECT * FROM ${object.table} LIMIT 200`),
        isMongo ? Promise.resolve([] as ForeignKeyInfo[]) : listForeignKeys(object.connId, object.table),
      ]);
      // ... rest unchanged (FK dropdown loop is a no-op for fks = [])
```

  Update the import line to include `ensureMongoDb` from `./objectApi`, and the
  dependency array to `[isMongo, object.connId, object.table, object.engine, object.database]`.
  Note: `object` itself is referenced inside — keep using the individual deps as today
  (same pattern the file already uses).
- [ ] Step 2: Delete line `:240`
  (`if (isMongo) return <EmptyState ... />;`) and remove the now-unused
  `EmptyState` / `FileText` imports. Change the empty message to
  `{isMongo ? "No documents" : "No rows"}`.
- [ ] Verify: `bun run typecheck && bun run lint` → clean.

### Task 7: Fix Structure and Indexes tabs for Mongo

**Files:** Modify `src/features/object-view/StructureShell.tsx:20-34`, `src/features/object-view/IndexesShell.tsx:11-14`
**Mirror:** their own fetch effects.

- [ ] Step 1: `StructureShell.tsx` — the local `OpenObject` interface (`:7-13`) gains
  `database?: string;`. Replace the effect body:

```ts
useEffect(() => {
  setCols(null);
  setForeignKeys(null);
  setError("");

  const load = async () => {
    try {
      await ensureMongoDb(object);
      const columns = await describeTable(object.connId, object.table);
      // MongoDB has no foreign keys; the backend rejects the call.
      const fks = object.engine === "mongodb"
        ? []
        : await listForeignKeys(object.connId, object.table);
      setCols(columns);
      setForeignKeys(fks);
    } catch (e) {
      setError(String(e));
    }
  };
  load();
}, [object.connId, object.table, object.engine, object.database]);
```

  (import `ensureMongoDb` from `./objectApi`; `object` is stable per render — deps
  mirror the existing style).
- [ ] Step 2: `IndexesShell.tsx` — replace the effect:

```ts
useEffect(() => {
  setIdx(null); setError("");
  ensureMongoDb(object)
    .then(() => listIndexes(object.connId, object.table))
    .then(setIdx)
    .catch((e) => setError(String(e)));
}, [object.connId, object.table, object.engine, object.database]);
```

  (import `ensureMongoDb`).
- [ ] Verify: `bun run typecheck && bun run lint` → clean.

## Validation

```bash
cd src-tauri && cargo check && cargo test
cd .. && bun run typecheck && bun run lint
# Live smoke (only if a local mongod is running):
# cd src-tauri && TOOLSQL_TEST_MONGO=1 cargo test mongo_live_connection -- --nocapture
```

Manual check (requires a running MongoDB with data): `kill $(lsof -ti :1420) 2>/dev/null; bun run tauri dev`,
connect to Mongo → expand db → click a collection → Documents tab shows rows;
Structure/Indexes tabs render; SQL console with the Mongo connection runs
`db.<coll>.find({})` and `db.<coll>.countDocuments({})`.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Users type shell-style unquoted keys (`{name: "x"}`) | High | Clear error message telling them to double-quote; relaxed JSON5 parsing is a follow-up, not this slice |
| A collection legitimately stores 24-hex *strings* as `_id` | Low | Coercion prefers ObjectId (the overwhelmingly common case); documented in `coerce_pk_bson` comment |
| Race: two Mongo tabs fetch concurrently around `switch_mongo_db` | Low | Single-user desktop app; fetches are triggered serially by tab activation. Proper fix (db-qualified driver calls) is a larger refactor, out of scope |
| Nested documents/arrays render as raw strings in the grid | Certain | Acceptable v1 — cells degrade to text per the normalized-result rule; a JSON cell viewer is a later slice |
| Editing non-`_id` fields containing nested docs via grid | Medium | Grid edit sends scalar values only; nested values round-trip as strings — users should use future document editor for those. No data loss on untouched fields (`$set` on one field) |

## Out of Scope (explicitly)

- `aggregate()` pipelines, `insertOne/updateOne/deleteMany` from the console (write
  path needs the write-protection flow).
- JSON5 / shell-flavored filter parsing.
- A dedicated document (tree/JSON) view — the grid view is this slice.
- The stale `docs/` direction; CLAUDE.md target architecture is followed (no engine
  branching outside the driver; UI branches only on `engine` for presentation/fetch shape).

## Acceptance ("done" criteria for /execute)

- [ ] All tasks complete
- [ ] `cargo check`, `cargo test`, `bun run typecheck`, `bun run lint` all pass
- [ ] Mongo collection click → documents render in the Data tab
- [ ] `db.<coll>.find({"field": "value"}).sort({"f": -1}).limit(5)` and
      `db.<coll>.countDocuments({})` work from the console
- [ ] SQL engines (Postgres/MySQL) behavior unchanged
- [ ] No change beyond the listed files
