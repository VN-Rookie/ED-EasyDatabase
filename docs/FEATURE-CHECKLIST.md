# Tool-SQL — Danh sách chức năng & lộ trình (DataGrip-class)

> Mục tiêu: một GUI database desktop cho **PostgreSQL + MySQL + MongoDB** đủ sức thay
> TablePlus/DataGrip cho công việc hằng ngày. File này liệt kê **toàn bộ chức năng cần có**,
> chia theo **phase**, kèm **các case cần xử lý** cho mỗi phase, và **trạng thái hiện tại**.

## Chú thích trạng thái
- ✅ **Xong** — đã làm và verify
- 🟡 **Một phần** — backend xong nhưng UI chưa nối (hoặc ngược lại)
- ⬜ **Chưa làm**

## Hiện trạng tóm tắt (vì sao bạn kết nối được mà không thấy gì)
- **Backend** đã có sẵn và đã test thật với Postgres: `connect`, `ping`, `test_connection`,
  `save/load/delete_saved_connection`, `disconnect`, `list_connections`, `switch_mongo_db`,
  `list_databases`, `list_tables`, `describe_table`, `list_indexes`, `run_query`
  (tất cả đã đăng ký trong `src-tauri/src/lib.rs`).
- **UI mới (shell)** chỉ mới nối **lớp kết nối**. Cây Explorer **cố ý** hiện
  *"Schema browsing — next milestone"* thay vì gọi `list_tables` → **đó là lý do không thấy table**.
- **Sửa/Xoá kết nối:** lệnh `delete_saved_connection` + upsert trong `save_connection` đã có ở
  backend, nhưng **dialog UI mới chưa có nút Edit/Delete** → đây là việc của Phase 1.
- Các file backend `ai.rs`, `audit.rs`, `saved_queries.rs`, `settings.rs` **tồn tại nhưng chưa
  khai báo trong `commands/mod.rs`** → hiện **không được biên dịch/đăng ký** (code mồ côi, tham khảo).

---

## PHASE 0 — Nền tảng (Foundation) — ✅ phần lớn đã xong
| # | Chức năng | Trạng thái |
|---|---|---|
| F01 | `Driver` trait (async, object-safe) cho mọi engine | ✅ |
| F02 | `connect(config) -> Arc<dyn Driver>` factory (nơi duy nhất `match` engine) | ✅ |
| F03 | `AppState` giữ `HashMap<ConnId, Driver>`, lock-then-clone, không giữ mutex qua `.await` | ✅ |
| F04 | `AppError(String)` serialize về frontend, mọi command trả `Result<T, AppError>` | ✅ |
| F05 | Result model chuẩn hoá (cột + rows JSON, NULL an toàn, không panic) | ✅ |
| F06 | TS boundary types khớp Rust model (`shared/types.ts`) | 🟡 (mới có phần connection) |
| F07 | Typed `invoke()` wrapper theo feature (không gọi raw string ngoài wrapper) | 🟡 (mới có connection) |
| F08 | UI shell DataGrip-style (toolbar, explorer resize, workspace tab, status bar) | ✅ |
| F09 | Design tokens (Tailwind v4 `@theme`), không hardcode hex | ✅ |
| F10 | Toast / confirm bar trong app (cấm `alert/confirm/prompt`) | 🟡 (ToastProvider có sẵn) |

**Cases cần xử lý:** engine không hỗ trợ → lỗi rõ ràng; type lạ (BSON/array/bytea) → degrade về Text/Json; lỗi serialize không được làm sập app.

---

## PHASE 1 — Quản lý kết nối đầy đủ (Connection management)
| # | Chức năng | Trạng thái |
|---|---|---|
| F11 | Tạo kết nối mới (Postgres/MySQL/Mongo, field theo engine) | ✅ |
| F12 | Test Connection (báo OK/lỗi inline) | ✅ |
| F13 | Lưu kết nối (persist `connections.json`) | ✅ |
| F14 | Liệt kê kết nối đã lưu khi mở app | ✅ |
| F15 | Connect / Disconnect, hiển thị trạng thái connected | ✅ |
| F16 | **Sửa (Edit) kết nối đã lưu** | ⬜ (backend upsert ✅, UI ⬜) |
| F17 | **Xoá (Delete) kết nối đã lưu** (có confirm bar) | ⬜ (backend ✅, UI ⬜) |
| F18 | Nhân bản (Duplicate) kết nối | ⬜ |
| F19 | Nhóm/Folder kết nối, đổi tên, gán màu/nhãn | ⬜ |
| F20 | **Lưu mật khẩu an toàn** (OS keychain) thay vì plaintext trong JSON | ⬜ (⚠️ hiện đang plaintext — rủi ro bảo mật) |
| F21 | Tuỳ chọn SSL/TLS, SSH tunnel, read-only mode | ⬜ |
| F22 | Auto-reconnect / phát hiện mất kết nối | ⬜ |

**Cases cần xử lý:** sai host/port/credential → thông báo cụ thể (không lộ chi tiết nhạy cảm); timeout kết nối; DB không tồn tại; Mongo cần connection string; xoá kết nối đang active phải disconnect trước; sửa kết nối đang active → hỏi reconnect.

---

## PHASE 2 — Điều hướng schema (Schema navigation) ← **việc kế tiếp**
| # | Chức năng | Trạng thái |
|---|---|---|
| F23 | Liệt kê databases (Mongo: list DB; Postgres hiện trả `[]` — **cần sửa stub**) | 🟡 |
| F24 | Liệt kê schemas (Postgres) / flat (MySQL/Mongo) | ⬜ |
| F25 | Liệt kê **tables** dưới connection (nối `list_tables` vào cây) | ⬜ (backend ✅, UI ⬜) |
| F26 | Liệt kê **views** (hiện đang bị loại khỏi `list_tables`) | ⬜ |
| F27 | Liệt kê **collections** (MongoDB) | ⬜ |
| F28 | Click table/collection → mở tab trong workspace (`openObject`) | 🟡 (store có sẵn, đang feed mock) |
| F29 | Lazy-load khi expand node (DB lớn) + loading state | ⬜ |
| F30 | Refresh schema thủ công | ⬜ |
| F31 | Tìm kiếm/lọc nhanh trong cây explorer | ⬜ |
| F32 | Hiển thị số dòng ước lượng / kích thước table | ⬜ |
| F33 | Functions / procedures / sequences / enums (nâng cao) | ⬜ |

**Cases cần xử lý:** DB rỗng (0 table) → empty state; không có quyền (permission denied) → báo rõ; schema rất lớn → phân trang/lazy; mất kết nối giữa chừng → báo & cho reconnect; phân biệt table vs view vs materialized view; Mongo không có schema cố định.

---

## PHASE 3 — Data grid (xem dữ liệu)
| # | Chức năng | Trạng thái |
|---|---|---|
| F34 | Hiển thị dữ liệu thật từ `run_query`/`SELECT * LIMIT` | ⬜ (backend ✅, UI shell mock) |
| F35 | Header dính, badge kiểu dữ liệu, đánh dấu PK | ✅ (shell) |
| F36 | Hiển thị NULL khác rỗng (italic muted) | ✅ (shell) |
| F37 | **Phân trang** (LIMIT/OFFSET) hoặc cuộn ảo (virtual scroll) | ⬜ |
| F38 | **Sắp xếp** theo cột (ORDER BY) | ⬜ |
| F39 | **Lọc** theo cột (WHERE builder / quick filter) | ⬜ |
| F40 | Resize/reorder/ẩn cột | ⬜ |
| F41 | Mở rộng ô (cell expand modal) cho text/JSON dài | ⬜ |
| F42 | Copy ô / dòng / vùng chọn | ⬜ |
| F43 | Hiển thị tổng số dòng, thời gian truy vấn | 🟡 (status bar có chỗ) |

**Cases cần xử lý:** result rất lớn (giới hạn mặc định + cảnh báo); kiểu nhị phân/bytea/UUID/JSON/array/timestamptz → render hợp lý; giá trị rất dài; bảng không có PK (ảnh hưởng edit); cột trùng tên trong JOIN; query trả 0 dòng.

---

## PHASE 4 — SQL Editor / Console
| # | Chức năng | Trạng thái |
|---|---|---|
| F44 | Editor CodeMirror + syntax highlight SQL | ✅ (shell) |
| F45 | **Chạy query** (nối `run_query`) + hiển thị kết quả | ⬜ |
| F46 | Chạy phần bôi đen (run selection) | ⬜ |
| F47 | Nhiều câu lệnh / tách statement | ⬜ |
| F48 | Auto-complete (bảng, cột, từ khoá) | ⬜ |
| F49 | Format SQL (đã có dep `sql-formatter`) | ⬜ |
| F50 | Lịch sử query (history) | ⬜ (logic cũ ở `viewStore`) |
| F51 | Lưu / quản lý saved queries | ⬜ (file backend mồ côi) |
| F52 | Hiển thị lỗi SQL rõ ràng (dòng/cột) + thời gian chạy | ⬜ |
| F53 | Huỷ query đang chạy (cancel) | ⬜ |

**Cases cần xử lý:** SQL lỗi cú pháp; query treo lâu → cancel; câu lệnh ghi (INSERT/UPDATE/DELETE) → cảnh báo; nhiều statement; phân biệt SELECT vs DML để hiển thị grid hay rows_affected (logic `is_select` đã có).

---

## PHASE 5 — Chỉnh sửa dữ liệu (Data editing)
| # | Chức năng | Trạng thái |
|---|---|---|
| F54 | Sửa ô trực tiếp trong grid (inline edit) | ⬜ |
| F55 | Thêm dòng mới | ⬜ |
| F56 | Xoá dòng | ⬜ |
| F57 | Preview SQL sinh ra trước khi áp dụng | ⬜ |
| F58 | Commit / Rollback theo batch, chế độ transaction | ⬜ |
| F59 | Write-protection / xác nhận với thao tác ghi (đồng bộ với MCP) | ⬜ |

**Cases cần xử lý:** bảng không có PK → không cho sửa an toàn; xung đột (dòng đã đổi ở DB); kiểu dữ liệu sai khi nhập; NULL vs chuỗi rỗng; ràng buộc FK/NOT NULL/UNIQUE vi phạm → báo lỗi rõ; thao tác ghi nhầm → cần confirm.

---

## PHASE 6 — Đối tượng & DDL
| # | Chức năng | Trạng thái |
|---|---|---|
| F60 | Tab Structure (cột, kiểu, nullable, PK) dữ liệu thật | ⬜ (backend `describe_table` ✅, UI shell mock) |
| F61 | Tab Indexes dữ liệu thật | ⬜ (backend `list_indexes` ✅) |
| F62 | Tab DDL: xem `CREATE` thật, copy | ⬜ (shell mock) |
| F63 | Tạo / sửa / xoá / truncate table (DDL builder) | ⬜ |
| F64 | Xem & sửa FK, constraints, comment | ⬜ |

**Cases cần xử lý:** quyền hạn DDL; engine khác nhau cú pháp khác nhau (Mongo không có DDL kiểu SQL → ẩn tab DDL như shell đang làm); thao tác phá huỷ (DROP/TRUNCATE) phải confirm 2 bước.

---

## PHASE 7 — Export / Import
| # | Chức năng | Trạng thái |
|---|---|---|
| F65 | Export kết quả ra CSV / JSON / SQL INSERT | ⬜ |
| F66 | Copy vùng chọn dưới dạng INSERT / Markdown | ⬜ |
| F67 | Import CSV/JSON vào bảng | ⬜ |
| F68 | Export schema (DDL toàn DB) | ⬜ |

**Cases cần xử lý:** file lớn (stream, không load hết vào RAM); ký tự đặc biệt/encoding; kiểu dữ liệu khi import; ghi đè vs thêm mới.

---

## PHASE 8 — Năng suất / UX
| # | Chức năng | Trạng thái |
|---|---|---|
| F69 | Nhiều tab object đồng thời, đóng tab | ✅ (shell) |
| F70 | Panel resize (explorer ↔ workspace) | ✅ |
| F71 | Status bar (engine, connection, object, row count) | 🟡 (đang mock) |
| F72 | Phím tắt (⌘↵ chạy, ⌘, settings…) + command palette | ⬜ |
| F73 | Settings panel (theme, font, UI scale) | ⬜ (UI cũ có, chưa nối shell mới) |
| F74 | Dark/light theme | ⬜ (mới có dark) |
| F75 | Khôi phục phiên làm việc (tab/kết nối lần trước) | ⬜ |

**Cases cần xử lý:** trạng thái rỗng ở mọi panel; lỗi không làm vỡ layout; thao tác bất đồng bộ phải có loading/disabled.

---

## PHASE 9 — AI & MCP (khác biệt, làm SAU cùng)
| # | Chức năng | Trạng thái |
|---|---|---|
| F76 | Sinh SQL từ ngôn ngữ tự nhiên (reqwest tới AI provider) | ⬜ (file `ai.rs` mồ côi) |
| F77 | Giải thích / tối ưu query | ⬜ |
| F78 | MCP server trong tiến trình Tauri, dùng lại `Driver` | ⬜ (file `mcp/` tham khảo) |
| F79 | Tool ghi của MCP đi qua đúng đường write-protection | ⬜ |
| F80 | Audit log thao tác | ⬜ (file `audit.rs` mồ côi) |

**Cases cần xử lý:** API key lưu an toàn (env/keychain, không hardcode); rate limit/timeout AI; SQL do AI sinh phải review trước khi chạy; phân quyền tool MCP đọc/ghi.

---

## Các case xuyên suốt (cross-cutting) cần xử lý rõ ràng
1. **Lỗi kết nối**: sai credential, host không tới được, timeout, DB không tồn tại, SSL bắt buộc.
2. **Lỗi quyền hạn**: read-only, không có quyền xem schema/chạy DDL.
3. **Dữ liệu lớn**: luôn có LIMIT mặc định + cảnh báo; lazy-load cây; virtual scroll grid.
4. **Kiểu dữ liệu khó**: JSON/JSONB, array, bytea/binary, UUID, timestamptz, numeric/bigint, BSON (Mongo) → render & edit hợp lý, NULL ≠ rỗng.
5. **Bảng không PK**: chặn edit an toàn, báo lý do.
6. **Query treo / cancel**: cho phép huỷ, không khoá UI.
7. **Mất kết nối giữa chừng**: phát hiện, báo, cho reconnect, không crash.
8. **Thao tác phá huỷ** (DROP/TRUNCATE/DELETE không WHERE): confirm rõ ràng, không dùng dialog trình duyệt.
9. **Khác biệt engine**: SQL vs MQL, schema vs flat, DDL có/không — xử lý trong driver, UI không branch theo engine.
10. **Bảo mật**: không log credential; mật khẩu/API key không để plaintext; không lộ chi tiết lỗi nhạy cảm ra UI.

---

## Thứ tự đề xuất triển khai (mỗi mục = 1 plan riêng cho /execute)
1. **Phase 2 — Schema navigation** (sửa đúng vấn đề "không thấy table") + **Phase 1 F16/F17** (Edit/Delete kết nối).
2. **Phase 3 — Data grid thật** (xem dữ liệu).
3. **Phase 6 — Structure/Indexes/DDL thật** (tái dùng `describe_table`/`list_indexes`).
4. **Phase 4 — SQL editor chạy thật**.
5. **Phase 5 — Sửa dữ liệu** (insert/update/delete).
6. **Phase 7/8 — Export/Import + UX**.
7. **Phase 9 — AI/MCP**.

> Ghi chú nợ kỹ thuật cần xử lý sớm: **F20** (mật khẩu plaintext trong `connections.json`) và **F23**
> (`list_databases` của Postgres đang trả `[]`).
