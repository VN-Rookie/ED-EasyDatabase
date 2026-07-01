# Architecture

## Tổng quan

```
┌─────────────────────────────────────────────────────────┐
│                     Tauri Desktop App                   │
│                                                         │
│  ┌─────────────────────┐   invoke()  ┌───────────────┐  │
│  │   React Frontend    │ ──────────► │  Rust Backend │  │
│  │   (Vite + TS)       │ ◄────────── │  (Commands)   │  │
│  │                     │   Result<T> │               │  │
│  └─────────────────────┘             └───────┬───────┘  │
│                                              │           │
│                               ┌──────────────┼───────┐  │
│                               │              │       │  │
│                          PgPool        MySqlPool  Client│
│                         (sqlx)          (sqlx)  (mongo) │
└─────────────────────────────────────────────────────────┘
         │                                              │
    PostgreSQL                                    MongoDB
      MySQL
```

Không có HTTP server. Frontend giao tiếp với backend hoàn toàn qua Tauri's `invoke()` — IPC được Tauri xử lý tự động.

---

## Rust Backend

### Module structure

```
src-tauri/src/
├── main.rs          Entry point — chỉ gọi lib::run()
├── lib.rs           Tauri Builder: đăng ký plugins, state, commands
├── error.rs         AppError type
├── state.rs         AppState + DbConnection enum
├── db/
│   └── mod.rs       Helper: connect_postgres/mysql/mongo
└── commands/
    ├── mod.rs
    ├── connection.rs  connect, disconnect, list_connections
    ├── schema.rs      list_tables, describe_table
    └── query.rs       run_query
```

### State management

`AppState` là single source of truth cho tất cả active connections:

```rust
pub struct AppState {
    pub connections: Mutex<HashMap<String, ConnectionEntry>>,
}
```

**Tại sao `std::sync::Mutex` thay vì `tokio::sync::Mutex`?**

Vì ta không bao giờ hold mutex qua `.await` point. Pattern nhất quán:
1. Lock → clone pool (Arc-backed, cheap) → unlock → await
2. Lock → insert/remove → unlock

`tokio::Mutex` sẽ không sai nhưng có overhead không cần thiết.

### DbConnection enum

```rust
pub enum DbConnection {
    Postgres(sqlx::PgPool),
    Mysql(sqlx::MySqlPool),
    Mongo(mongodb::Client),
}
```

**Tại sao enum, không dùng trait object?**

`async` functions trong trait cần `async-trait` crate và thêm overhead. Với 3 database types cố định, enum pattern (`match`) rõ ràng hơn, zero-cost, và dễ add variant mới mà không cần refactor interface.

### Error handling

`AppError(String)` implements `serde::Serialize` — bắt buộc để Tauri có thể serialize error ra JSON cho frontend:

```rust
#[derive(Debug, Serialize)]
pub struct AppError(pub String);
```

Frontend nhận error như: `{ error: "Connection refused: connection refused (os error 61)" }`.

---

## Frontend

### State management (Zustand)

Mỗi domain có một store riêng:

```
src/stores/
├── connectionStore.ts   — danh sách connections, active connection ID
├── schemaStore.ts       — schema tree của active connection
└── queryStore.ts        — query history, current result set
```

Store không fetch data — chỉ lưu state. Logic gọi Tauri commands nằm trong hooks.

### Tauri invoke wrappers

```
src/hooks/
├── useConnections.ts    — wrap connect, disconnect, list_connections
├── useSchema.ts         — wrap list_tables, describe_table
└── useQuery.ts          — wrap run_query
```

Mỗi hook trả về `{ data, loading, error }` pattern — giống React Query nhưng không cần thư viện.

### Component structure

```
src/components/
├── Sidebar/
│   ├── ConnectionList.tsx     — danh sách connections đã lưu
│   └── SchemaTree.tsx         — cây databases → schemas → tables
├── ConnectionDialog/
│   └── ConnectionForm.tsx     — form tạo/sửa connection
├── DataGrid/
│   ├── DataGrid.tsx           — bảng phân trang với sort
│   └── EditableCell.tsx       — cell có thể edit inline
├── QueryEditor/
│   ├── SqlEditor.tsx          — textarea với syntax highlight
│   └── ResultPanel.tsx        — DataGrid cho query results
└── Layout/
    ├── Sidebar.tsx
    └── MainPanel.tsx
```

---

## Luồng dữ liệu: kết nối và xem data

```
User clicks "Connect"
  → ConnectionForm submit
  → useConnections.connect(params)
  → invoke("connect", { name, db_type, host, ... })
  → Rust: connect_postgres(url) → PgPool
  → Rust: insert into AppState.connections
  → Return: { id, name, db_type }
  → connectionStore.addConnection(meta)
  → Sidebar re-renders với connection mới

User clicks table name
  → SchemaTree onClick
  → useSchema.listTables(connId)
  → invoke("list_tables", { conn_id })
  → Rust: clone PgPool, query information_schema
  → Return: [{ name: "users" }, { name: "posts" }, ...]
  → schemaStore.setTables(tables)

User clicks "users"
  → invoke("run_query", { conn_id, sql: "SELECT * FROM users LIMIT 50" })
  → Rust: fetch rows, convert to JSON
  → Return: { columns: [...], rows: [...] }
  → DataGrid renders
```

---

## Lưu trữ connection config

Connections được lưu vào file JSON local để persist qua sessions. Không dùng keychain ở phase 1 — password lưu plain text trong file. Phase 2 sẽ migrate sang OS keychain (`keyring` crate).

File location: `~/.config/tool-sql/connections.json`

Format:
```json
[
  {
    "id": "uuid-v4",
    "name": "Local Postgres",
    "db_type": "postgres",
    "host": "localhost",
    "port": 5432,
    "database": "myapp",
    "username": "postgres",
    "password": "..."
  }
]
```

---

## MCP Server (Phase 3)

MCP server sẽ chạy như `tokio::spawn` trong cùng Tauri process — không phải binary riêng. Lý do: dùng chung `AppState` với active connections mà không cần IPC giữa processes.

```
Claude Code ──── JSON-RPC/TCP ────► localhost:3456
                                        │
                                    MCP Handler
                                        │
                                    AppState (shared Arc)
                                        │
                                    PgPool → Postgres
```

Port mặc định: 3456. Cấu hình trong Claude Code:
```json
{
  "mcpServers": {
    "tool-sql": {
      "command": "nc",
      "args": ["localhost", "3456"]
    }
  }
}
```
