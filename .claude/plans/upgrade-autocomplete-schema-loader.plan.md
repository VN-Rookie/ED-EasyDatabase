# Plan: Upgrade Autocomplete & Schema Loader

**Source:** [smart_sql_editor_analysis.md](file:///Users/hieuvu/.gemini/antigravity-cli/brain/a84a0ac4-d1da-4b3e-9a2a-c5f1396c3169/smart_sql_editor_analysis.md)
**Complexity:** Medium

## Goal
Nâng cấp trải nghiệm chỉnh sửa mã của Console bằng cách:
1. Thay đổi cơ chế nạp schema: Thay vì lặp qua từng bảng để gọi `describeTable` (gây nghẽn mạng), chúng ta sẽ truy vấn toàn bộ thông tin bảng/cột bằng một câu lệnh duy nhất từ Database ở Backend.
2. Tích hợp sâu autocomplete của CodeMirror 6 bằng cách sử dụng `PostgreSQL.language.data.of({ autocomplete: sqlCompletionSource })` thay vì dùng `autocompletion({ override })` làm mất đi tính năng phân tích ngữ pháp mặc định.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Command | `src-tauri/src/commands/schema.rs:13` | Tauri command calling driver method |
| Rust Driver | `src-tauri/src/drivers/postgres.rs:61` | Execute sqlx raw query to metadata tables |
| Frontend API | `src/features/explorer/schemaApi.ts:1` | Invoke command wrapper using Tauri api |
| Frontend Shell | `src/features/sql-console/SqlConsoleShell.tsx:624` | Configure CodeMirror extensions |

## Files to Change
| File | Action | Why |
|---|---|---|
| `src-tauri/src/model.rs` | MODIFY | Thêm struct `TableSchemaInfo` để gửi dữ liệu gộp của schema về frontend. |
| `src-tauri/src/drivers/mod.rs` | MODIFY | Thêm phương thức `describe_schema` vào `Driver` trait. |
| `src-tauri/src/drivers/postgres.rs` | MODIFY | Triển khai `describe_schema` cho PostgreSQL. |
| `src-tauri/src/drivers/mysql.rs` | MODIFY | Triển khai `describe_schema` cho MySQL. |
| `src-tauri/src/drivers/mongo.rs` | MODIFY | Triển khai `describe_schema` cho MongoDB (trả về collection names và columns rỗng). |
| `src-tauri/src/drivers/redis.rs` | MODIFY | Triển khai `describe_schema` cho Redis (trả về rỗng). |
| `src-tauri/src/commands/schema.rs` | MODIFY | Thêm tauri command `describe_schema`. |
| `src-tauri/src/lib.rs` | MODIFY | Đăng ký command `describe_schema` với Tauri builder. |
| `src/features/explorer/schemaApi.ts` | MODIFY | Khai báo hàm `describeSchema` gọi Tauri backend. |
| `src/features/sql-console/SqlConsoleShell.tsx` | MODIFY | Thay thế loop `describeTable` bằng `describeSchema`, đồng thời gộp autocomplete thông minh thay vì override. |

---

## Tasks

### Task 1: Định nghĩa Struct và Interface ở Backend Rust
**Files:** Modify `src-tauri/src/model.rs` · Modify `src-tauri/src/drivers/mod.rs`
- [ ] Thêm struct `TableSchemaInfo` vào `src-tauri/src/model.rs`:
  ```rust
  #[derive(Serialize, Clone)]
  pub struct TableSchemaInfo {
      pub table_name: String,
      pub columns: Vec<ColumnInfo>,
  }
  ```
- [ ] Thêm phương thức `describe_schema` vào `Driver` trait trong `src-tauri/src/drivers/mod.rs`:
  ```rust
  async fn describe_schema(&self) -> Result<Vec<TableSchemaInfo>, AppError>;
  ```
- [ ] Verify: Chạy `cargo check` trong `src-tauri` để đảm bảo code biên dịch (sẽ có lỗi thiếu implementation ở các driver, chúng ta sẽ sửa ở Task tiếp theo).

### Task 2: Triển khai Driver Postgres và MySQL
**Files:** Modify `src-tauri/src/drivers/postgres.rs` · Modify `src-tauri/src/drivers/mysql.rs`
- [ ] Triển khai `describe_schema` trong `src-tauri/src/drivers/postgres.rs`:
  Dùng 1 query lấy toàn bộ bảng và cột kèm thông tin PK của schema hiện tại:
  ```rust
  async fn describe_schema(&self) -> Result<Vec<TableSchemaInfo>, AppError> {
      let schema = self.schema.read().unwrap().clone();
      let rows = sqlx::query_as::<_, (String, String, String, bool, bool)>(
          "SELECT 
              c.table_name, 
              c.column_name, 
              c.data_type, 
              c.is_nullable,
              (pk.column_name IS NOT NULL) AS is_pk
           FROM information_schema.columns c
           LEFT JOIN (
               SELECT kcu.table_name, kcu.column_name
               FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu
                   ON tc.constraint_name = kcu.constraint_name
                   AND tc.table_schema  = kcu.table_schema
                   AND tc.table_name    = kcu.table_name
               WHERE tc.constraint_type = 'PRIMARY KEY'
                   AND tc.table_schema = $1
           ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
           WHERE c.table_schema = $1
           ORDER BY c.table_name, c.ordinal_position"
      )
      .bind(&schema)
      .fetch_all(&self.pool)
      .await?;

      // Group columns by table_name
      let mut map: std::collections::BTreeMap<String, Vec<ColumnInfo>> = std::collections::BTreeMap::new();
      for (table_name, col_name, data_type, nullable, is_pk) in rows {
          map.entry(table_name).or_default().push(ColumnInfo {
              name: col_name,
              data_type,
              nullable: nullable == "YES",
              is_pk,
          });
      }

      Ok(map.into_iter().map(|(table_name, columns)| TableSchemaInfo {
          table_name,
          columns,
      }).collect())
  }
  ```
- [ ] Triển khai `describe_schema` trong `src-tauri/src/drivers/mysql.rs`:
  Tương tự PostgreSQL, sử dụng database hiện tại:
  ```rust
  async fn describe_schema(&self) -> Result<Vec<TableSchemaInfo>, AppError> {
      let rows = sqlx::query_as::<_, (String, String, String, bool, bool)>(
          "SELECT 
              c.TABLE_NAME, 
              c.COLUMN_NAME, 
              c.DATA_TYPE, 
              c.IS_NULLABLE,
              (c.COLUMN_KEY = 'PRI') AS is_pk
           FROM information_schema.COLUMNS c
           WHERE c.TABLE_SCHEMA = DATABASE()
           ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION"
      )
      .fetch_all(&self.pool)
      .await?;

      let mut map: std::collections::BTreeMap<String, Vec<ColumnInfo>> = std::collections::BTreeMap::new();
      for (table_name, col_name, data_type, nullable, is_pk) in rows {
          map.entry(table_name).or_default().push(ColumnInfo {
              name: col_name,
              data_type,
              nullable: nullable == "YES",
              is_pk,
          });
      }

      Ok(map.into_iter().map(|(table_name, columns)| TableSchemaInfo {
          table_name,
          columns,
      }).collect())
  }
  ```

### Task 3: Triển khai Driver MongoDB, Redis và Tauri Command
**Files:** Modify `src-tauri/src/drivers/mongo.rs` · Modify `src-tauri/src/drivers/redis.rs` · Modify `src-tauri/src/commands/schema.rs` · Modify `src-tauri/src/lib.rs`
- [ ] Triển khai `describe_schema` trong `src-tauri/src/drivers/mongo.rs`:
  Trả về danh sách collection (sử dụng `list_tables` kết quả) với cột rỗng:
  ```rust
  async fn describe_schema(&self) -> Result<Vec<TableSchemaInfo>, AppError> {
      let collections = self.list_tables().await?;
      Ok(collections.into_iter().map(|t| TableSchemaInfo {
          table_name: t.name,
          columns: vec![],
      }).collect())
  }
  ```
- [ ] Triển khai `describe_schema` trong `src-tauri/src/drivers/redis.rs`:
  Trả về rỗng:
  ```rust
  async fn describe_schema(&self) -> Result<Vec<TableSchemaInfo>, AppError> {
      Ok(vec![])
  }
  ```
- [ ] Thêm command `describe_schema` vào `src-tauri/src/commands/schema.rs`:
  ```rust
  use crate::model::TableSchemaInfo; // Update imports if needed
  
  #[tauri::command]
  pub async fn describe_schema(conn_id: String, state: State<'_, AppState>) -> Result<Vec<TableSchemaInfo>, AppError> {
      state.driver(&conn_id)?.describe_schema().await
  }
  ```
- [ ] Đăng ký command `describe_schema` vào list handler ở `src-tauri/src/lib.rs`.
- [ ] Verify: Chạy `cargo test` để đảm bảo code backend compile thành công và không lỗi.

### Task 4: Khai báo Frontend API
**Files:** Modify `src/features/explorer/schemaApi.ts`
- [ ] Export type `TableSchemaInfo` và hàm `describeSchema` gọi Tauri command:
  ```typescript
  export interface TableSchemaInfo {
    table_name: string;
    columns: { name: string; data_type: string; nullable: boolean; is_pk: boolean }[];
  }

  export const describeSchema = (connId: string): Promise<TableSchemaInfo[]> =>
    invoke("describe_schema", { connId });
  ```

### Task 5: Nâng cấp Auto-complete và Tải Schema ở Frontend Console
**Files:** Modify `src/features/sql-console/SqlConsoleShell.tsx`
- [ ] Thay thế logic `useEffect` nạp schema cũ (lặp `describeTable`) bằng `describeSchema` gộp:
  ```typescript
  // Load schema for auto-completion when connection changes.
  useEffect(() => {
    if (!connId) return;

    const loadSchema = async () => {
      try {
        const schemaData = await describeSchema(connId);
        const tables: TableInfo[] = schemaData.map(s => ({ name: s.table_name }));
        const tableColumns = new Map<string, { name: string; type: string }[]>();

        for (const s of schemaData) {
          tableColumns.set(s.table_name, s.columns.map(c => ({ name: c.name, type: c.data_type })));
        }

        setSchemaCache({
          tables,
          tableColumns,
          timestamp: Date.now(),
        });
      } catch {
        // Schema loading is best-effort for completions
      }
    };

    loadSchema();
  }, [connId, isMongoConnection, mongoDb]);
  ```
- [ ] Thay đổi cách đăng ký `sqlCompletionSource` vào CodeMirror extensions:
  Thay vì override thô sơ làm mất gợi ý keyword và cú pháp SQL của CodeMirror:
  ```typescript
  // Thay đổi cmExtensions:
  const cmExtensions = [
    isMongoConnection 
      ? mqlLanguage 
      : sql({ 
          dialect: PostgreSQL, 
          tables: schemaCache.tables.map(t => ({ 
            label: t.name, 
            columns: schemaCache.tableColumns.get(t.name)?.map(c => ({ label: c.name, type: c.type })) || [] 
          })) 
        }),
    // Đăng ký custom source thông qua PostgreSQL language data thay vì override toàn bộ autocompletion
    !isMongoConnection && PostgreSQL.language.data.of({
      autocomplete: sqlCompletionSource
    }),
    isMongoConnection && autocompletion({ override: [mongoCompletionSource] }),
    keymap.of([{ key: "Mod-Enter", run: () => { execute(); return true; } }]),
  ].filter(Boolean);
  ```
- [ ] Verify: Chạy `bun run typecheck` và `bun run build` để kiểm tra lỗi biên dịch TypeScript.

---

## Validation
```bash
# Ở root directory
bun run typecheck
bun run build
cd src-tauri && cargo check && cargo test
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Lỗi cú pháp SQL khi query catalog trên các phiên bản MySQL/Postgres khác nhau | Low | Sử dụng các view tiêu chuẩn ANSI SQL như `information_schema.columns` và `information_schema.tables` tương thích rộng rãi. |
| CodeMirror 6 custom autocomplete bị trùng lặp kết quả gợi ý | Medium | Hàm `sqlCompletionSource` sẽ lọc bớt từ khóa trùng nếu CodeMirror đã gợi ý, chỉ tập trung gợi ý Table/Column chi tiết. |

## Acceptance
- [ ] Toàn bộ code compile thành công (TypeScript & Rust)
- [ ] Console nạp dữ liệu schema của table/column chỉ bằng 1 network request xuống backend
- [ ] Editor gợi ý được cả từ khóa SQL mặc định (SELECT, FROM...) và tên bảng/cột từ DB
