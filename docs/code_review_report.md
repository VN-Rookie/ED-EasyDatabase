# BÁO CÁO RÀ SOÁT MÃ NGUỒN VÀ KIỂM TOÁN AN NINH (CODE REVIEW & SECURITY AUDIT REPORT)

Báo cáo này tổng hợp chi tiết các phát hiện từ quá trình rà soát mã nguồn (code review) và kiểm toán an ninh (security audit) trên toàn bộ dự án `tool-sql` (bao gồm cả Backend bằng Rust/Tauri và Frontend bằng React/TypeScript). Các phát hiện dưới đây được đúc rút nhằm nâng cao độ an toàn, tính ổn định và tối ưu hiệu năng của hệ thống trước khi đưa vào sản xuất.

---

## 1. Rà soát chi tiết mã nguồn Backend (Rust)

### 1.1. Đánh giá cấu trúc kiến trúc
*   **Cấu trúc Drivers (`src-tauri/src/drivers/`)**:
    *   Hệ thống tuân thủ tốt kiến trúc đích sử dụng mẫu thiết kế `Driver` trait (`drivers/mod.rs`), giúp loại bỏ cấu trúc rẽ nhánh `match db_connection` cồng kềnh.
    *   *Điểm yếu kiến trúc*: `PostgresDriver` và `MongoDriver` đang lưu trữ trạng thái động của schema/database dưới dạng một `RwLock<String>` bên trong struct driver:
        *   `src-tauri/src/drivers/postgres.rs` (dòng 9-12): `pub schema: std::sync::RwLock<String>`
        *   `src-tauri/src/drivers/mongo.rs` (dòng 11-14): `db: RwLock<String>`
        *   Việc duy trì trạng thái này trong một cấu trúc được bọc bởi `Arc<dyn Driver>` dùng chung làm mất tính stateless của driver và gây tranh chấp dữ liệu (race conditions) khi chạy song song.
*   **Cấu trúc Commands (`src-tauri/src/commands/`)**:
    *   Các command hoạt động như một lớp chuyển tiếp mỏng (thin IPC layer), chịu trách nhiệm nhận tham số từ frontend, truy xuất driver từ AppState và gọi phương thức trait tương ứng. Điều này đúng với định hướng thiết kế.
    *   *Phát hiện lỗi*: Câu lệnh `generate_filters` được định nghĩa trong `src-tauri/src/commands/ai.rs` (dòng 249-279) nhưng **hoàn toàn bị bỏ quên**, không được đăng ký trong danh sách invoke handler của Tauri tại `src-tauri/src/lib.rs` (dòng 28-72). Điều này khiến frontend không thể gọi được tính năng này qua IPC.
*   **Cấu trúc Model & State (`src-tauri/src/model.rs`, `src-tauri/src/state.rs`)**:
    *   `ResultSet` chuẩn hóa tốt dữ liệu trả về giữa các cơ sở dữ liệu khác nhau khi đi qua ranh giới Rust-JS.
    *   `AppState` bảo vệ danh sách kết nối bằng `Arc<Mutex<HashMap<...>>>` một cách an toàn, tuy nhiên chưa bảo vệ được trạng thái kết nối độc lập bên trong các pool khi có nhiều luồng cùng checkout kết nối.

### 1.2. Nhận xét chất lượng mã nguồn & các phát hiện cụ thể

#### A. Lỗ hổng SQL Injection nghiêm trọng trong các truy vấn DML
Các thao tác thêm/sửa/xóa dòng đơn lẻ (`insert_row`, `update_row`, `delete_row`) và chỉnh sửa hàng loạt (`apply_batch_edits`) trong cả driver PostgreSQL và MySQL được xây dựng bằng cách cộng chuỗi trực tiếp (string interpolation) thay vì sử dụng tham số hóa (parameterized queries).
*   **Tệp tin**: `src-tauri/src/drivers/postgres.rs`
    *   *Dòng 202-205*: `let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, column_list, value_list);`
    *   *Dòng 231-234*: `let sql = format!("UPDATE {} SET {} WHERE {} = {}", table, set_list, pk_column, pk_literal);`
    *   *Dòng 250-253*: `let sql = format!("DELETE FROM {} WHERE {} = {}", table, pk_column, pk_literal);`
*   **Tệp tin**: `src-tauri/src/drivers/mysql.rs`
    *   *Dòng 154-157*: `let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, column_list, value_list);`
    *   *Dòng 183-186*: `let sql = format!("UPDATE {} SET {} WHERE {} = {}", table, set_list, pk_column, pk_literal);`
    *   *Dòng 202-205*: `let sql = format!("DELETE FROM {} WHERE {} = {}", table, pk_column, pk_literal);`
*   *Hệ quả*: Kẻ tấn công hoặc dữ liệu độc hại có chứa ký tự đóng nháy có thể dễ dàng phá vỡ cấu trúc câu lệnh SQL, thực thi các truy vấn tùy ý trên cơ sở dữ liệu của người dùng.

#### B. Tranh chấp luồng (Thread Safety) và nhiễm độc search_path trong Connection Pool
*   **Tệp tin**: `src-tauri/src/drivers/postgres.rs` (dòng 21-27)
    *   Khi gọi `set_database` để đổi schema, driver chạy câu lệnh: `SET search_path TO <schema>, public`.
    *   Vì `sqlx::PgPool` quản lý một nhóm các kết nối động, việc thiết lập `SET search_path` chỉ có tác dụng trên kết nối đơn lẻ vừa được checkout ra khỏi pool vào thời điểm đó. Khi kết nối được trả lại pool, nó giữ nguyên trạng thái cấu hình này.
    *   Khi các tác vụ song song khác checkout kết nối từ pool, chúng có thể nhận được kết nối bị "nhiễm độc" search_path của schema cũ, dẫn đến việc truy vấn sai schema hoặc gây ra lỗi không tìm thấy bảng ("relation not found").

#### C. Lưu trữ API Key của Claude và OpenAI dưới dạng Plaintext
*   **Tệp tin**: `src-tauri/src/commands/settings.rs` (dòng 15-32) và dòng 90-93.
    *   Các trường `claude_api_key` và `openai_api_key` được lưu trữ dưới dạng văn bản rõ (plaintext) trong tệp cấu hình cấu trúc JSON tại thư mục config của người dùng (`~/.config/tool-sql/settings.json`).
    *   Bất kỳ tiến trình độc hại nào chạy cục bộ trên máy người dùng đều có thể đọc trộm các khóa API nhạy cảm này.

#### D. Bỏ qua lỗi Keyring (Ignored OS Keychain Error Handling)
*   **Tệp tin**: `src-tauri/src/commands/connection.rs`
    *   *Dòng 13-17*:
        ```rust
        fn save_password(id: &str, password: &str) {
            if let Ok(entry) = keyring::Entry::new("tool-sql", id) {
                let _ = entry.set_password(password); // Bỏ qua kết quả trả về
            }
        }
        ```
    *   *Dòng 27-31*:
        ```rust
        fn delete_password(id: &str) {
            if let Ok(entry) = keyring::Entry::new("tool-sql", id) {
                let _ = entry.delete_credential(); // Bỏ qua kết quả trả về
            }
        }
        ```
    *   *Hệ quả*: Việc nuốt lỗi bằng ký tự `_` khiến ứng dụng không nhận diện được khi OS Keychain bị lỗi (ví dụ trong Docker container hoặc môi trường linux thiếu dbus). Người dùng nghĩ rằng mật khẩu đã được lưu an toàn nhưng thực tế nó đã bị mất vĩnh viễn.

#### E. Nuốt lỗi khôi phục cơ sở dữ liệu (Database Restore Error Swallowing)
*   **Tệp tin**: `src-tauri/src/commands/backup_import.rs` (dòng 172-180 và 183-186)
    *   Khi duyệt qua các câu lệnh trong tệp backup để khôi phục, hệ thống chạy: `let _ = driver.run_query(sql).await;`.
    *   Các lỗi cú pháp hoặc xung đột dữ liệu phát sinh trong lúc restore bị nuốt hoàn toàn, hệ thống vẫn trả về `Ok(())` giả tạo cho frontend.

---

## 2. Rà soát chi tiết mã nguồn Frontend (React)

### 2.1. Đánh giá cấu trúc hệ thống
*   **Hiện tượng phân tách trạng thái (State Split / Duplicate Connection Stores)**:
    *   Hệ thống tồn tại song song hai store Zustand quản lý kết nối hoàn toàn độc lập:
        1.  `src/stores/connectionStore.ts` (dòng 18-53): Sử dụng bởi các component cũ như `SchemaTree.tsx` (dòng 16) và hook `useConnections.ts` (dòng 3).
        2.  `src/features/connection/connectionStore.ts` (dòng 18-53): Sử dụng bởi các component mới như `ExplorerTree.tsx` (dòng 3) và `SqlConsoleShell.tsx` (dòng 20).
    *   *Hậu quả*: Trạng thái kết nối hoạt động (`activeConnections`) không được đồng bộ giữa hai store này. Khi kết nối mới được kích hoạt qua store tính năng, các component cũ vẫn hiển thị trạng thái ngắt kết nối.

### 2.2. Nhận xét về hiệu năng, rò rỉ bộ nhớ và kiểu dữ liệu

#### A. Nghẽn cổ chai hiệu năng re-render trên DataGrid
*   **Tệp tin**: `src/features/object-view/DataGridCell.tsx` (dòng 40-41)
    *   Thành phần `DataGridCell` lấy toàn bộ hàm và dữ liệu từ store thông qua lệnh gọi không có selector: `const { editingCell, startEditing, ... } = useDataGridStore();`.
    *   Bất kỳ hành động thay đổi nhỏ nào trong store (như cập nhật trạng thái `dirtyCells` khi gõ phím) sẽ buộc **tất cả các ô dữ liệu trong bảng re-render lại**.
    *   `DataGridCell` không được bọc trong `React.memo`. Khi bảng lớn (ví dụ 100 hàng x 50 cột = 5,000 ô), việc nhập một ký tự vào ô dữ liệu sẽ kích hoạt 5,000 lượt render đồng thời, tạo ra độ trễ (lag) cực kỳ lớn khiến người dùng không thể gõ phím mượt mà.

#### B. Rò rỉ bộ nhớ do không giải phóng Event Listener trên Window
*   **Tệp tin**: `src/components/SqlEditor.tsx` (dòng 102-116) và `src/components/DataGrid.tsx` (dòng 414-420)
    *   Khi người dùng bắt đầu kéo thả thay đổi kích thước editor hoặc cột, các sự kiện `mousemove` và `mouseup` được gán động vào đối tượng toàn cục `window`.
    *   If component bị hủy (unmount) khi tiến trình kéo thả chưa kết thúc (người dùng chuyển tab hoặc đóng kết nối), các listener này sẽ tồn tại vĩnh viễn trong bộ nhớ `window`, ngăn cản Garbage Collector giải phóng bộ nhớ của DOM và các component React liên quan.

#### C. Lỗi điều hướng Foreign Key Click do bất nhất cấu trúc Object ID
*   **Tệp tin**: `src/features/object-view/DataGridShell.tsx` (dòng 739-750)
    *   Khi click vào liên kết khóa ngoại, hệ thống tạo `targetObjId = \`${object.connId}:${refTable}\`` (chỉ gồm 2 phần, thiếu thông tin database/schema).
*   **Tệp tin**: `src/features/explorer/ExplorerTree.tsx` (dòng 376-378)
    *   Cây Explorer đăng ký các bảng dưới dạng cấu trúc ID gồm 3 phần: `connId:db:table`.
    *   *Hậu quả*: Khi click chuyển bảng qua khóa ngoại, ID bị lệch cấu trúc khiến SchemaTree không thể tìm và kích hoạt node tương ứng, đồng thời truyền giá trị `database` là `undefined` xuống driver backend, làm phát sinh lỗi truy vấn không tìm thấy bảng ở PostgreSQL.

---

## 3. Đánh giá lỗ hổng logic & polish các tính năng cốt lõi

### 3.1. Postgres Multi-Schema Support
*   *Lỗi logic*: Khi chọn schema mới trong `SchemaTree`, frontend chỉ cập nhật store local (`useSchemaStore.getState().setSelectedSchema(schemaName)`) mà **không hề kích hoạt cuộc gọi API xuống backend** để đổi schema kết nối.
*   *Hệ quả*: Backend driver vẫn trỏ vào schema `"public"` mặc định ban đầu. Thêm vào đó, do hàm truy vấn dữ liệu bảng xây dựng câu lệnh SQL thô không gắn schema prefix (`SELECT * FROM "${table}"`), các bảng nằm ở schema khác `public` sẽ luôn báo lỗi `"relation not found"`.

### 3.2. Batch Edits (Chỉnh sửa hàng loạt)
*   *Lỗi logic*:
    1.  *Hiệu năng kém*: Mỗi ô bị sửa đổi trên UI được gửi về backend thành một phần tử riêng trong mảng. Backend duyệt mảng và thực thi **từng câu lệnh UPDATE riêng biệt** trong một vòng lặp, tạo ra số lượng roundtrip khổng lồ.
    2.  *Lỗi cập nhật PK*: Nếu người dùng cập nhật đồng thời khóa chính (PK) của dòng và một cột khác, câu lệnh cập nhật khóa chính chạy trước sẽ làm thay đổi giá trị PK ở cơ sở dữ liệu. Các câu lệnh cập nhật cột tiếp theo vẫn dùng giá trị PK cũ làm điều kiện `WHERE`, dẫn đến việc cập nhật thất bại âm thầm (0 dòng bị ảnh hưởng).
    3.  *Nuốt thay đổi của bảng không có PK*: UI vẫn cho phép chỉnh sửa bảng không có khóa chính, nhưng khi lưu sẽ return sớm một cách âm thầm, làm mất hoàn toàn dữ liệu thay đổi của người dùng mà không đưa ra bất kỳ thông báo lỗi nào.
    4.  *Lỗ hổng SQL Injection qua MySQL escape bypass*: Hàm `escape_sql_string` trong driver MySQL chỉ nhân đôi dấu nháy đơn (`s.replace('\'', "''")`). Nếu chuỗi nhập vào kết thúc bằng ký tự `\`, dấu `\` sẽ escape dấu nháy đơn đầu tiên trong chuỗi SQL nội suy, khiến dấu nháy đơn thứ hai đóng vai trò đóng chuỗi sớm, tạo điều kiện chèn mã độc.

### 3.3. Data Import (Nhập dữ liệu)
*   *Lỗi logic*:
    1.  *Tràn bộ nhớ RAM*: Hàm `import_json_data` đọc toàn bộ tệp tin JSON vào RAM bằng `fs::read_to_string`. Đối với các file dữ liệu lớn, việc phân tích cú pháp toàn bộ chuỗi JSON khổng lồ sẽ gây lỗi tràn bộ nhớ (Out Of Memory) làm sập ứng dụng Tauri.
    2.  *Thiếu tính nguyên tử (Atomicity)*: Việc thực thi import được chia theo batch 1000 dòng. Nếu xảy ra lỗi ở batch thứ N, các batch trước đó vẫn nằm lại trong database mà không có cơ chế rollback, để lại dữ liệu rác không nhất quán.
    3.  *Đoán kiểu dữ liệu CSV sai lệch*: CSV tự động ép kiểu chuỗi số có số 0 ở đầu thành dạng số (ví dụ: mã bưu điện `"02130"` thành số `2130`), làm mất mát định dạng chuỗi gốc quan trọng. Đồng thời các giá trị Boolean viết tắt không được nhận diện đúng.

### 3.4. Database Snapshot (Backup & Restore)
*   *Lỗi logic*:
    1.  *Lỗi MongoDB Restore*: Bản backup MongoDB được tạo ra dưới dạng script lệnh `db.collection.insert({ ... })`. Khi restore, hệ thống đọc từng dòng và truyền vào `run_query` vốn chỉ hỗ trợ các câu lệnh đọc như `find` và `countDocuments`. Lệnh restore MongoDB sẽ lỗi toàn bộ nhưng do lỗi bị nuốt, hệ thống vẫn báo thành công giả tạo.
    2.  *Trùng lặp dữ liệu*: Backup SQL không tạo câu lệnh `DROP TABLE IF EXISTS` trước khi tạo bảng, gây lỗi khi phục hồi đè lên cơ sở dữ liệu cũ.
    3.  *Tải toàn bộ backup vào RAM*: Toàn bộ chuỗi SQL backup được cộng dồn vào một biến `String` duy nhất trên RAM của Rust trước khi ghi xuống đĩa, gây quá tải bộ nhớ.

### 3.5. SQL Console Statement Splitting (Tách câu lệnh SQL)
*   *Lỗi logic*:
    1.  *Tách sai cú pháp*: Hệ thống chỉ tìm kiếm ký tự `";"` đơn giản mà không quan tâm đến ngữ cảnh. Nếu dấu chấm phẩy nằm trong chuỗi ký tự (`'John; Doe'`), trong phần comment (`-- comment;`), hoặc khối stored procedure (`$$ BEGIN ...; END; $$`), câu lệnh SQL duy nhất sẽ bị cắt nát thành các phân đoạn không hợp lệ, gây lỗi cú pháp khi thực thi.
    2.  *Fallback nguy hiểm*: Khi cursor ở dòng trống, câu lệnh trích xuất bị rỗng, hệ thống tự động fallback chạy toàn bộ nội dung của editor. Điều này có thể vô tình kích hoạt các câu lệnh nguy hại nằm ở các dòng khác trong file.

---

## 4. Đề xuất và Dẫn chiếu cải tiến cụ thể

### Cải tiến 1: Tham số hóa truy vấn DML chống SQL Injection
*   **Tập tin ảnh hưởng**: `src-tauri/src/drivers/postgres.rs` và `src-tauri/src/drivers/mysql.rs`.
*   **Giải pháp**: Sử dụng cơ chế bind biến của SQLx thay vì cộng chuỗi, đồng thời chuẩn hóa việc quote tên bảng và tên cột để tránh các lỗi chèn mã độc qua định danh.

#### Cấu trúc mã nguồn Before vs After (PostgreSQL INSERT):
**Before (Không an toàn)**:
```rust
// File: src-tauri/src/drivers/postgres.rs (dòng 202-205)
let columns: Vec<String> = values.keys().cloned().collect();
let values_list: Vec<String> = columns.iter()
    .filter_map(|col| values.get(col).map(|v| json_to_sql_literal(v)))
    .collect();
let column_list = columns.join(", ");
let value_list = values_list.join(", ");
let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, column_list, value_list);

let result = sqlx::query(&sql)
    .execute(&self.pool)
    .await?;
```

**After (Tham số hóa an toàn & Quote định danh)**:
```rust
// File: src-tauri/src/drivers/postgres.rs
let columns: Vec<String> = values.keys().cloned().collect();
// Tạo danh sách tham số $1, $2, ...
let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("${}", i)).collect();

// Quote an toàn tên bảng và tên cột chống chèn ký tự đặc biệt
let table_quoted = format!("\"{}\"", table.replace('"', "\"\""));
let column_list = columns.iter()
    .map(|c| format!("\"{}\"", c.replace('"', "\"\"")))
    .collect::<Vec<_>>()
    .join(", ");
let value_list = placeholders.join(", ");

let sql = format!("INSERT INTO {} ({}) VALUES ({})", table_quoted, column_list, value_list);
let mut query = sqlx::query(&sql);

// Thực hiện bind an toàn dựa trên kiểu dữ liệu của serde_json
for col in &columns {
    if let Some(val) = values.get(col) {
        query = match val {
            serde_json::Value::Null => query.bind(None::<String>),
            serde_json::Value::Bool(b) => query.bind(*b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() { query.bind(i) }
                else if let Some(f) = n.as_f64() { query.bind(f) }
                else { query.bind(n.to_string()) }
            }
            serde_json::Value::String(s) => query.bind(s.clone()),
            other => query.bind(other.to_string()),
        };
    }
}

let result = query.execute(&self.pool).await?;
```

---

### Cải tiến 2: Kích hoạt đồng bộ Schema từ Frontend & Truy vấn Schema PostgreSQL chuẩn xác
*   **Tập tin ảnh hưởng**: `src/hooks/useSchema.ts`.
*   **Giải pháp**: Sửa đổi hàm `selectSchema` để gửi lệnh IPC đồng bộ xuống backend, đồng thời gắn tiền tố schema rõ ràng vào câu lệnh SQL hiển thị dữ liệu lưới.

#### Cấu trúc mã nguồn Before vs After:
**Before (Không đồng bộ backend)**:
```typescript
// File: src/hooks/useSchema.ts (dòng 38-41)
const selectSchema = async (schemaName: string) => {
  useSchemaStore.getState().setSelectedSchema(schemaName);
};
```

**After (Đồng bộ gọi API thay đổi search_path trên backend)**:
```typescript
// File: src/hooks/useSchema.ts
import { invoke } from "@tauri-apps/api/core";

const selectSchema = async (schemaName: string) => {
  const connId = useConnectionStore.getState().activeConnectionId;
  if (connId) {
    // Gọi lệnh switch_mongo_db (hoặc switch_active_database_or_schema sau khi đổi tên)
    await invoke("switch_mongo_db", { connId, dbName: schemaName });
  }
  
  // Lưu trạng thái schema đã chọn ở frontend
  useSchemaStore.getState().setSelectedSchema(schemaName);
  
  // Tải lại danh sách bảng của schema vừa chọn
  if (connId) {
    await loadTables(connId);
  }
};
```

Đồng thời sửa dòng 164-165 trong `useSchema.ts` để truy vấn CSDL PostgreSQL có chỉ định rõ schema:
```typescript
// Sửa đổi câu lệnh SQL hiển thị dữ liệu
const schema = useSchemaStore.getState().selectedSchema || "public";
const sql = `SELECT * FROM "\${schema}"."\${table}"\${whereClause}\${orderClause} LIMIT \${pageSize} OFFSET \${page * pageSize}`;
```

---

### Cải tiến 3: Dọn dẹp triệt để Event Listener trên Window tránh Rò rỉ Bộ nhớ
*   **Tập tin ảnh hưởng**: `src/components/SqlEditor.tsx`.
*   **Giải pháp**: Quản lý trạng thái kéo thả thông qua một biến state `isDragging` và tận dụng hàm dọn dẹp `cleanup` của `useEffect` để loại bỏ listener trên `window` khi component unmount.

#### Cấu trúc mã nguồn Before vs After:
**Before (Không an toàn khi unmount)**:
```typescript
// File: src/components/SqlEditor.tsx (dòng 102-116)
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

**After (Đảm bảo dọn dẹp tự động)**:
```typescript
// File: src/components/SqlEditor.tsx
const [isDragging, setIsDragging] = useState(false);

const startDrag = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  setIsDragging(true);
}, []);

useEffect(() => {
  if (!isDragging) return;

  const onMouseMove = (ev: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((ev.clientY - rect.top) / rect.height) * 100;
    setEditorPct(Math.max(20, Math.min(80, pct)));
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  // Trả về hàm dọn dẹp tự động chạy khi component bị hủy hoặc kết thúc drag
  return () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };
}, [isDragging]);
```

---

## 5. Danh sách các đề xuất tối ưu hóa hiệu năng

### Đề xuất 1: Memoization và Tách biệt Subscription trong DataGridCell
*   **Mô tả**: Tối ưu hóa việc re-render lưới dữ liệu bằng cách bọc `DataGridCell` trong `React.memo` và chia nhỏ việc gọi store Zustand thông qua các selector đơn nhiệm.
*   **Chi tiết triển khai**:
    *   Tách các thao tác tĩnh (như các hàm update, edit) ra khỏi trạng thái thay đổi liên tục của cell.
    *   Sử dụng `useCallback` trong selector để so sánh trạng thái của riêng ô đó (ví dụ: chỉ re-render khi `editingCell` của ô đó chuyển từ true sang false hoặc ngược lại).
    *   Giảm số lượng render từ $O(R \times C)$ xuống còn $O(1)$ cho mỗi thao tác nhập liệu.

### Đề xuất 2: Streaming và Buffering cho Snapshot Database (Backup/Restore)
*   **Mô tả**: Thay thế cơ chế gom toàn bộ dữ liệu backup vào bộ nhớ RAM bằng cách ghi trực tiếp xuống file theo từng dòng thông qua bộ đệm.
*   **Chi tiết triển khai**:
    *   **Backup**: Sử dụng phương thức `sqlx::query(...).fetch(&self.pool)` trong Rust để nhận luồng dữ liệu (Stream of Rows). Sử dụng `std::io::BufWriter` để ghi từng dòng dữ liệu xuống đĩa cứng ngay lập tức. Bộ nhớ RAM sử dụng sẽ ổn định ở mức cực thấp bất kể dung lượng database cần sao lưu.
    *   **Restore**: Sử dụng `std::io::BufReader` để đọc file backup theo từng khối, kết hợp với cơ chế phân tách câu lệnh tuần tự để thực thi trực tiếp, tránh nạp toàn bộ file SQL/BSON vào RAM.

### Đề xuất 3: JSON Streaming Parser khi Import tập tin cấu trúc lớn
*   **Mô tả**: Sửa đổi cơ chế import dữ liệu của tệp JSON để hỗ trợ các tệp tin kích thước lớn mà không gây tràn bộ nhớ.
*   **Chi tiết triển khai**:
    *   Sử dụng thư viện phân tích cú pháp luồng như `serde_json::Deserializer::from_reader` kết hợp với `std::io::BufReader`.
    *   Đọc và xử lý từng bản ghi hoặc từng nhóm nhỏ bản ghi (chunking) rồi tiến hành giải phóng bộ nhớ của bản ghi cũ ngay lập tức, ngăn ngừa hoàn toàn lỗi tràn RAM (OOM) ở ứng dụng Client.

### Đề xuất 4: Nhất quan nguồn dữ liệu kết nối (Zustand Store Consolidation)
*   **Mô tả**: Loại bỏ hoàn toàn sự không nhất quán về mặt trạng thái kết nối hoạt động bằng cách hợp nhất hai store Zustand về một nguồn duy nhất.
*   **Chi tiết triển khai**:
    *   Xóa bỏ tệp tin store trùng lặp kế thừa tại đường dẫn `src/stores/connectionStore.ts`.
    *   Cấu hình lại toàn bộ mã nguồn import ở các component cũ (`SchemaTree.tsx`, `useConnections.ts`) hướng trực tiếp tới store tính năng chuẩn hóa tại `src/features/connection/connectionStore.ts`.
    *   Đảm bảo toàn bộ ứng dụng chỉ sử dụng duy nhất một phiên bản Connection Store hoạt động trong toàn bộ vòng đời.
