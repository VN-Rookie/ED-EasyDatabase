# Tauri Command API

Frontend gọi backend qua `invoke(commandName, args)`. Tất cả commands đều async và trả về `Promise<T>` — error được throw nếu Rust trả về `Err`.

## TypeScript types

```typescript
// Dùng trong tất cả hooks

export type DbType = "postgres" | "mysql" | "mongodb";

export interface ConnectionMeta {
  id: string;       // UUID v4
  name: string;     // Display name
  db_type: DbType;
}

export interface TableInfo {
  name: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;  // Postgres type string, e.g. "integer", "character varying"
  nullable: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];  // Each row is column_name → value
  rows_affected: number | null;     // null cho SELECT, number cho DML
}
```

---

## Commands hiện có

### `connect`

Tạo connection mới đến database. Pool được giữ trong AppState.

```typescript
invoke<ConnectionMeta>("connect", {
  req: {
    name: string,
    db_type: DbType,
    host: string,
    port: number,
    database: string,
    username: string,
    password: string,
  }
})
```

**Returns**: `ConnectionMeta` với `id` là UUID dùng để reference connection sau này.

**Errors**:
- `"Connection refused: ..."` — database không chạy hoặc sai host/port
- `"password authentication failed"` — sai credentials
- `"Unsupported db type: ..."` — db_type không hợp lệ

---

### `disconnect`

Đóng connection và giải phóng pool.

```typescript
invoke<void>("disconnect", { id: string })
```

Không throw nếu id không tồn tại (idempotent).

---

### `list_connections`

Trả về tất cả active connections trong current session.

```typescript
invoke<ConnectionMeta[]>("list_connections")
```

---

### `list_tables`

Trả về danh sách tables của connection (chỉ `public` schema cho Postgres).

```typescript
invoke<TableInfo[]>("list_tables", { conn_id: string })
```

**Errors**:
- `"Connection not found"` — conn_id không tồn tại
- `"MySQL schema browser coming soon"` — MySQL chưa implement
- `"MongoDB schema browser coming soon"` — MongoDB chưa implement

---

### `describe_table`

Trả về columns của một table theo ordinal position.

```typescript
invoke<ColumnInfo[]>("describe_table", {
  conn_id: string,
  table: string,
})
```

Table không tồn tại → trả về array rỗng (không throw).

---

### `run_query`

Chạy arbitrary SQL và trả về rows.

```typescript
invoke<QueryResult>("run_query", {
  conn_id: string,
  sql: string,
})
```

**Type mapping** (Postgres → JSON):

| Postgres type | JSON type |
|--------------|-----------|
| `bool` | `boolean` |
| `int2`, `int4`, `int8` | `number` |
| `float4`, `float8`, `numeric` | `number` |
| `text`, `varchar`, `char`, `uuid` | `string` |
| `timestamp`, `date` | `string` (ISO format) |
| `NULL` | `null` |
| `json`, `jsonb`, `array`, `bytea` | `null` (phase 2) |

---

## Commands dự kiến (Phase 1 còn lại)

```typescript
// Lưu connection config ra file
invoke("save_connection", { config: ConnectionConfig })

// Load connections từ file khi app start
invoke<ConnectionConfig[]>("load_saved_connections")

// Xoá saved connection
invoke("delete_saved_connection", { id: string })

// Test connection không lưu vào state
invoke<boolean>("test_connection", { req: ConnectRequest })

// Execute DML (INSERT/UPDATE/DELETE) — trả về rows_affected
invoke<QueryResult>("execute", { conn_id: string, sql: string })
```

---

## Sử dụng trong React

```typescript
// src/hooks/useConnections.ts
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionMeta } from "../types";

export function useConnections() {
  const connect = (req: ConnectRequest) =>
    invoke<ConnectionMeta>("connect", { req });

  const disconnect = (id: string) =>
    invoke<void>("disconnect", { id });

  const listConnections = () =>
    invoke<ConnectionMeta[]>("list_connections");

  return { connect, disconnect, listConnections };
}
```
