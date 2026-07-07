# Kế hoạch Triển khai: Import Data & Database Snapshot

Kế hoạch này chi tiết hóa cách thức xây dựng hai tính năng quan trọng phục vụ quản trị dữ liệu quy mô lớn trên ứng dụng `tool-sql`: **Nhập dữ liệu từ CSV/JSON** và **Sao lưu/Khôi phục cơ sở dữ liệu (Database Snapshot)**.

---

## 1. Kiến trúc Tổng quan (Architecture Design)

### 1.1 Tính năng Nhập dữ liệu (CSV/JSON Import)
*   **Luồng dữ liệu:**
    `Frontend (Chọn file & map cột) → Tauri Command (Đọc stream tệp & parse) → Driver Trait (Bulk Insert) → Database`.
*   **Tối ưu hiệu năng:** 
    *   Sử dụng thư viện `csv` và `serde_json` trên Rust để đọc tệp qua luồng (Reader/Buffer) theo từng lô (Batch Size = 1000 records).
    *   Tránh nạp toàn bộ tệp vào RAM cùng lúc để ngăn chặn tràn bộ nhớ với các tệp tin lớn (> 100MB).
    *   Mỗi Driver (Postgres, MySQL, Mongo) sẽ tự động tạo câu truy vấn Bulk Insert tối ưu nhất cho lô dữ liệu.

### 1.2 Tính năng Sao lưu / Snapshot
*   **Luồng dữ liệu:**
    `Frontend (Kích hoạt backup) → Tauri Command → Gọi CLI gốc (pg_dump/mysqldump) HOẶC Duyệt schema sinh tập lệnh DDL DML → Ghi tệp SQL/Archive`.
*   **Giải pháp Hybrid (Kết hợp):**
    *   *Ưu tiên 1:* Kiểm tra sự tồn tại của CLI hệ thống. Nếu có, thực thi CLI để đảm bảo tốc độ và tính toàn vẹn (ví dụ: `pg_dump -U username -h host -d dbname -f output.sql`).
    *   *Ưu tiên 2 (Fallback):* Nếu không có CLI gốc, Driver tự động crawl siêu dữ liệu thông qua các hàm có sẵn (`describe_table`, `list_foreign_keys`) để tự sinh tập lệnh DDL `CREATE TABLE` và dữ liệu DML `INSERT INTO`.

---

## 2. Thay đổi chi tiết Backend (Rust)

### Step 2.1: Mở rộng Driver Trait
Thêm các định nghĩa sau vào `Driver` trait trong [mod.rs](file:///Volumes/NewVolume/Workspace/project/tool-sql/src-tauri/src/drivers/mod.rs):
```rust
#[async_trait]
pub trait Driver: Send + Sync {
    // ... các method hiện có ...

    /// Thực hiện chèn hàng loạt dữ liệu vào bảng
    async fn bulk_insert(
        &self,
        table: &str,
        columns: &[String],
        rows: Vec<Vec<serde_json::Value>>,
    ) -> Result<(), AppError>;

    /// Tạo bản Dump (Schema + Data) dạng SQL thô
    async fn generate_logical_dump(&self) -> Result<String, AppError>;
}
```

### Step 2.2: Triển khai trên Drivers

#### A. Postgres Driver ([postgres.rs](file:///Volumes/NewVolume/Workspace/project/tool-sql/src-tauri/src/drivers/postgres.rs))
*   `bulk_insert`: Xây dựng câu truy vấn chèn nhiều dòng:
    `INSERT INTO "table" (col1, col2) VALUES ($1, $2), ($3, $4)...`
    Sử dụng QueryBuilder của `sqlx` để gán tham số động một cách an toàn để chống SQL Injection.
*   `generate_logical_dump`:
    *   Duyệt qua danh sách bảng. Với mỗi bảng, gọi `describe_table` để sinh DDL `CREATE TABLE`.
    *   Query dữ liệu hiện tại để sinh các câu lệnh `INSERT INTO`.

#### B. MySQL Driver ([mysql.rs](file:///Volumes/NewVolume/Workspace/project/tool-sql/src-tauri/src/drivers/mysql.rs))
*   `bulk_insert`: Tương tự như Postgres nhưng sử dụng cú pháp dấu ngoặc kép định danh MySQL (\``).
*   `generate_logical_dump`: Dùng `SHOW CREATE TABLE <name>` để lấy trực tiếp cấu trúc DDL của MySQL, sau đó sinh lệnh `INSERT INTO`.

#### C. MongoDB Driver ([mongo.rs](file:///Volumes/NewVolume/Workspace/project/tool-sql/src-tauri/src/drivers/mongo.rs))
*   `bulk_insert`: Gọi API `insert_many` của MongoDB driver.
*   `generate_logical_dump`: Xuất dạng tệp nén JSON mở rộng (Extended JSON - BSON).

### Step 2.3: Tạo các Tauri Commands mới
Tạo mới file `src-tauri/src/commands/backup_import.rs` chứa các command:
*   `#[tauri::command] pub async fn import_csv(conn_id, table, file_path, mapping)`
*   `#[tauri::command] pub async fn import_json(conn_id, table, file_path, mapping)`
*   `#[tauri::command] pub async fn create_database_backup(conn_id, output_path, schema_only)`
*   `#[tauri::command] pub async fn restore_database_backup(conn_id, file_path)`

Đăng ký các command này vào handler của `lib.rs`.

---

## 3. Thay đổi chi tiết Frontend (React/TypeScript)

### Step 3.1: Giao diện Import (Import Modal)
*   Tạo component `ImportModal.tsx` mở ra khi nhấn "Import" từ Data Grid:
    *   **File Selection:** Cho phép chọn tệp CSV hoặc JSON.
    *   **Preview:** Hiển thị 5 hàng đầu tiên của tệp dưới dạng bảng nhỏ.
    *   **Column Mapping Grid:** Hiển thị 2 cột:
        *   Cột đích trong Database (ví dụ: `id`, `name`, `email`).
        *   Dropdown chọn Cột nguồn trong file CSV (tự động khớp nếu trùng tên).
    *   **Progress Bar:** Hiển thị tiến trình nạp dữ liệu (bao nhiêu phần trăm lô đã hoàn thành).

### Step 3.2: Giao diện Snapshot / Backup
*   Thêm menu chuột phải trong [ExplorerTree.tsx](file:///Volumes/NewVolume/Workspace/project/tool-sql/src/features/explorer/ExplorerTree.tsx):
    *   Nhấp chuột phải vào Database node → Hiện "Backup Database...".
    *   Nhấp chuột phải vào Connection node → Hiện "Restore Backup...".
*   Tạo component `BackupDialog.tsx` để người dùng chọn:
    *   Đường dẫn lưu file `.sql` / `.json` backup (sử dụng Tauri `save` dialog).
    *   Chế độ: "Chỉ cấu trúc" (Schema Only) hoặc "Đầy đủ" (Schema + Data).
    *   Nút bấm "Execute Backup" gọi Tauri command.

---

## 4. Kế hoạch Thực thi (Step-by-Step Execution Plan)

### Lô 1: Nền tảng Backend & Mở rộng Driver (1 ngày)
1.  **Task 1.1:** Cập nhật `Driver` trait trong [mod.rs](file:///Volumes/NewVolume/Workspace/project/tool-sql/src-tauri/src/drivers/mod.rs) thêm `bulk_insert` và `generate_logical_dump`.
2.  **Task 1.2:** Triển khai `bulk_insert` trên `postgres.rs`, `mysql.rs` và `mongo.rs`.
3.  **Task 1.3:** Viết unit test trong Rust để kiểm thử việc ghi lô (Bulk Insert) 10,000 bản ghi xem hiệu năng và tính an toàn của transaction.

### Lô 2: Tauri Commands & CLI Backup (1 ngày)
1.  **Task 2.1:** Triển khai cơ chế backup hybrid (gọi CLI hệ thống `pg_dump`/`mysqldump` trước, nếu lỗi thì chuyển sang native logical dump).
2.  **Task 2.2:** Xây dựng tệp Tauri command `backup_import.rs` và đăng ký vào handler chính.
3.  **Task 2.3:** Kiểm tra biên dịch backend thành công bằng `cargo check`.

### Lô 3: Thiết kế Giao diện Frontend (1 ngày)
1.  **Task 3.1:** Xây dựng modal `ImportModal.tsx` để chọn file và cấu hình ánh xạ cột.
2.  **Task 3.2:** Thêm menu ngữ cảnh (Right-click context menu) và dialog backup trong `ExplorerTree.tsx`.
3.  **Task 3.3:** Liên kết frontend với các Tauri commands mới. Chạy `bun run typecheck` và `bun run build`.

---

## 5. Tiêu chí Nghiệm thu (Verification & Acceptance Criteria)
*   **Import test:** Nhập file CSV chứa 50,000 dòng dữ liệu vào bảng Postgres. Đảm bảo:
    *   Tốc độ hoàn thành dưới 5 giây.
    *   Bộ nhớ RAM của app không tăng đột biến (> 20MB).
    *   Dữ liệu được map đúng cột, xử lý tốt ký tự đặc biệt, dấu nháy kép, dấu xuống dòng trong ô dữ liệu.
*   **Backup test:** Chạy backup một database Postgres local. File output sinh ra phải chứa đầy đủ câu lệnh DDL `CREATE TABLE` chuẩn xác và câu lệnh DML `INSERT INTO` chứa đúng số lượng bản ghi gốc.
*   **Restore test:** Restore file SQL backup vừa tạo vào một database trống mới và kiểm tra cấu trúc/dữ liệu được tái tạo nguyên vẹn.
