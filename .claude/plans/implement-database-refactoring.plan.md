# Plan: Implement Database Refactoring

**Source:** [smart_sql_editor_analysis.md](file:///Users/hieuvu/.gemini/antigravity-cli/brain/a84a0ac4-d1da-4b3e-9a2a-c5f1396c3169/smart_sql_editor_analysis.md)
**Complexity:** Large

## Goal
Xây dựng tính năng Database Refactoring cho phép đổi tên bảng (Table) hoặc cột (Column) an toàn bằng cách tự động tìm kiếm, sửa đổi và tạo lại các đối tượng phụ thuộc (Views, Stored Procedures, Functions) trong một Transaction duy nhất ở Backend, đồng thời cung cấp giao diện Refactor Preview cho người dùng xác nhận.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Command | `src-tauri/src/commands/schema.rs:17` | Tauri command wrapper calling driver method |
| Rust Driver | `src-tauri/src/drivers/postgres.rs:61` | sqlx raw query to PG catalogs |
| Frontend Modal | `src/features/explorer/BackupModal.tsx:1` | In-app modal with inputs and execution state |

## Files to Change
| File | Action | Why |
|---|---|---|
| `src-tauri/src/model.rs` | MODIFY | Định nghĩa các struct `DependencyInfo` và `RefactorPreview` để gửi dữ liệu preview về frontend. |
| `src-tauri/src/drivers/mod.rs` | MODIFY | Thêm phương thức `get_refactor_preview` vào `Driver` trait. |
| `src-tauri/src/drivers/postgres.rs` | MODIFY | Triển khai phân tích dependency và sinh DDL refactor cho Postgres. |
| `src-tauri/src/drivers/mysql.rs` | MODIFY | Triển khai phân tích dependency cho MySQL. |
| `src-tauri/src/drivers/mongo.rs` | MODIFY | Triển khai dummy `get_refactor_preview` cho Mongo (chỉ đổi tên collection). |
| `src-tauri/src/drivers/redis.rs` | MODIFY | Triển khai dummy cho Redis. |
| `src-tauri/src/commands/schema.rs` | MODIFY | Thêm các tauri commands: `get_refactor_preview` và `execute_refactor`. |
| `src-tauri/src/lib.rs` | MODIFY | Đăng ký các commands refactor mới. |
| `src/features/explorer/schemaApi.ts` | MODIFY | Khai báo API wrapper cho Refactoring. |
| `src/features/explorer/RefactorModal.tsx` | CREATE | Xây dựng giao diện Refactor Preview Modal (Form đổi tên, danh sách views/functions bị ảnh hưởng, SQL Preview box). |
| `src/features/explorer/ExplorerTree.tsx` | MODIFY | Thêm tùy chọn "Refactor Rename..." vào dropdown của Table. |
| `src/features/object-view/StructureShell.tsx` | MODIFY | Thêm nút Edit/Refactor bên cạnh mỗi Column. |

---

## Tasks

### Task 1: Định nghĩa Struct và Interface ở Rust Backend
**Files:** Modify `src-tauri/src/model.rs` · Modify `src-tauri/src/drivers/mod.rs`
- [ ] Thêm các struct vào `src-tauri/src/model.rs`:
  ```rust
  #[derive(Serialize, Clone)]
  pub struct DependencyInfo {
      pub object_name: String,
      pub object_type: String, // "View" | "Procedure" | "Function"
      pub old_definition: String,
      pub new_definition: String,
  }

  #[derive(Serialize, Clone)]
  pub struct RefactorPreview {
      pub dependencies: Vec<DependencyInfo>,
      pub generated_ddl: String,
  }
  ```
- [ ] Thêm phương thức `get_refactor_preview` vào `Driver` trait trong `src-tauri/src/drivers/mod.rs`:
  ```rust
  async fn get_refactor_preview(
      &self,
      table: &str,
      column: Option<&str>,
      new_name: &str,
  ) -> Result<RefactorPreview, AppError>;
  ```
- [ ] Verify: Chạy `cargo check` trong `src-tauri` để đảm bảo code compile (sẽ báo thiếu implementation trên các driver).

### Task 2: Triển khai Driver Postgres và MySQL cho Refactoring
**Files:** Modify `src-tauri/src/drivers/postgres.rs` · Modify `src-tauri/src/drivers/mysql.rs`
- [ ] Triển khai `get_refactor_preview` trong `src-tauri/src/drivers/postgres.rs`:
  *   Tìm views phụ thuộc bằng query catalog:
      ```sql
      SELECT DISTINCT 
          dependent_view.relname AS view_name,
          pg_get_viewdef(dependent_view.oid) AS view_definition
      FROM pg_depend dep
      JOIN pg_rewrite re ON dep.objid = re.oid
      JOIN pg_class dependent_view ON re.ev_class = dependent_view.oid
      JOIN pg_class source_table ON dep.refobjid = source_table.oid
      JOIN pg_namespace n ON source_table.relnamespace = n.oid
      WHERE source_table.relname = $1 AND n.nspname = $2;
      ```
  *   Tìm procedures/functions chứa chuỗi tên bảng hoặc cột:
      ```sql
      SELECT p.proname, pg_get_functiondef(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = $1 AND pg_get_functiondef(p.oid) ILIKE $2;
      ```
  *   Sử dụng regex/text replace trong Rust để sửa định nghĩa view/procedure cũ sang mới:
      Thay thế chính xác token (tránh thay thế nhầm substring bằng ranh giới từ `\b`).
  *   Tạo chuỗi `generated_ddl`:
      ```sql
      -- Rename table/column:
      ALTER TABLE {table} RENAME TO {new_name}; -- hoặc RENAME COLUMN
      -- Drop views & Recreate views/functions:
      DROP VIEW {view} CASCADE;
      CREATE VIEW {view} AS {new_definition};
      ```
- [ ] Triển khai `get_refactor_preview` trong `src-tauri/src/drivers/mysql.rs`:
  *   MySQL views: Tìm trong `information_schema.views` có chứa tên bảng/cột.
  *   MySQL routines: Tìm trong `information_schema.routines` có chứa tên bảng/cột.
  *   Tạo chuỗi `generated_ddl` tương ứng.

### Task 3: Triển khai Driver MongoDB, Redis và Tauri Commands
**Files:** Modify `src-tauri/src/drivers/mongo.rs` · Modify `src-tauri/src/drivers/redis.rs` · Modify `src-tauri/src/commands/schema.rs` · Modify `src-tauri/src/lib.rs`
- [ ] Triển khai `get_refactor_preview` cho Mongo (chỉ đổi tên collection, không view/proc):
  Sinh ra DDL preview đơn giản: `db.collection.renameCollection("new_name")`.
- [ ] Triển khai `get_refactor_preview` cho Redis (chỉ sinh command RENAME).
- [ ] Tạo Tauri commands `get_refactor_preview` và `execute_refactor` trong `src-tauri/src/commands/schema.rs`:
  ```rust
  #[tauri::command]
  pub async fn get_refactor_preview(
      conn_id: String,
      table: String,
      column: Option<String>,
      new_name: String,
      state: State<'_, AppState>,
  ) -> Result<RefactorPreview, AppError> {
      state.driver(&conn_id)?.get_refactor_preview(&table, column.as_deref(), &new_name).await
  }

  #[tauri::command]
  pub async fn execute_refactor(
      conn_id: String,
      ddl: String,
      state: State<'_, AppState>,
  ) -> Result<QueryResult, AppError> {
      // Run the DDL inside the query runner (execute refactor query)
      state.driver(&conn_id)?.run_query(&ddl).await
  }
  ```
- [ ] Đăng ký các commands này trong `src-tauri/src/lib.rs`.
- [ ] Verify: Chạy `cargo test` để kiểm tra.

### Task 4: Xây dựng Giao diện Refactor Modal và Tích hợp Frontend
**Files:** Create `src/features/explorer/RefactorModal.tsx` · Modify `src/features/explorer/schemaApi.ts` · Modify `src/features/explorer/ExplorerTree.tsx` · Modify `src/features/object-view/StructureShell.tsx`
- [ ] Thêm các khai báo API trong `schemaApi.ts`:
  ```typescript
  export interface DependencyInfo {
    object_name: string;
    object_type: string;
    old_definition: string;
    new_definition: string;
  }

  export interface RefactorPreview {
    dependencies: DependencyInfo[];
    generated_ddl: string;
  }

  export const getRefactorPreview = (
    connId: string,
    table: string,
    column: string | null,
    newName: string
  ) => invoke<RefactorPreview>("get_refactor_preview", { connId, table, column, newName });

  export const executeRefactor = (connId: string, ddl: string) =>
    invoke<void>("execute_refactor", { connId, ddl });
  ```
- [ ] Viết component `RefactorModal.tsx` hỗ trợ:
  *   Nhập tên mới.
  *   Nút "Preview" gọi `getRefactorPreview` và render danh sách `dependencies` bị ảnh hưởng.
  *   Khung CodeMirror (đọc ghi) hoặc text box render `generated_ddl` để xem trước và cho phép chỉnh sửa.
  *   Nút "Execute" gọi `executeRefactor`, hiển thị loading spinner, hoàn thành sẽ thông báo toast thành công và đóng modal.
  *   Design: Hỗ trợ resize và cuộn nội dung, giao diện tối màu Sleek Dark Mode.
- [ ] Tích hợp vào `ExplorerTree.tsx`:
  *   Thêm action "Refactor Rename" vào dropdown của table.
  *   Mở `RefactorModal` khi được chọn.
- [ ] Tích hợp vào `StructureShell.tsx`:
  *   Hiển thị icon Edit/Refactor bên cạnh mỗi Column.
  *   Khi click, mở `RefactorModal` truyền kèm `column: col.name`.
- [ ] Verify: Chạy `bun run typecheck` và `bun run build`.

---

## Validation
```bash
bun run typecheck
bun run build
cd src-tauri && cargo check && cargo test
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Parser text replace thay thế nhầm các chuỗi con trùng | Medium | Sử dụng word boundary trong thay thế chuỗi và cho phép sửa DDL trực tiếp trước khi chạy. |
| DB engines không chạy re-create view trơn tru | Medium | Bọc toàn bộ các lệnh DDL trong một Transaction, nếu một lệnh lỗi sẽ rollback toàn bộ. |

## Acceptance
- [ ] Người dùng đổi tên bảng hoặc cột thành công.
- [ ] View phụ thuộc vào bảng/cột đó tự động được re-create với tên mới.
- [ ] DDL được review trước khi bấm chạy thực tế.
