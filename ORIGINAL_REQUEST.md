# Original User Request

## Initial Request — 2026-07-07T23:56:00+07:00

Hãy thực hiện việc rà soát và kiểm toán toàn bộ mã nguồn backend Rust, frontend React và cấu trúc tính năng của dự án `tool-sql` để đánh giá chất lượng mã, phát hiện bug/lỗ hổng bảo mật và đề xuất tối ưu hóa.

Working directory: /Volumes/NewVolume/Workspace/project/tool-sql
Integrity mode: development

## Requirements

### R1. Code Audit (Rust Backend)
Rà soát toàn bộ code Rust trong `src-tauri/src/` (drivers, commands, model, state, mcp) để đánh giá chất lượng code, xử lý lỗi (error handling), an toàn luồng (thread safety), và bảo mật của cơ chế OS Keychain (`keyring`).

### R2. Code Audit (React Frontend)
Rà soát code React/TypeScript trong `src/` (features, components, stores, hooks), đặc biệt tập trung vào DataGridShell, ExplorerTree, SettingsShell để tìm các vấn đề về hiệu năng (re-render), rò rỉ bộ nhớ, và tính nhất quán kiểu dữ liệu.

### R3. Feature Gap & Polish Review
Đánh giá kỹ lượng các tính năng cốt lõi (Postgres multi-schema, batch edits, data import, database snapshot, SQL console statement splitting) xem có lỗ hổng logic hoặc ca đặc biệt (edge cases) nào chưa xử lý tốt và đề xuất cải tiến.

## Acceptance Criteria

### Review Report
- [ ] Báo cáo chi tiết dạng markdown lưu tại `/Volumes/NewVolume/Workspace/project/tool-sql/docs/code_review_report.md`.
- [ ] Chỉ ra ít nhất 3 điểm cải tiến chất lượng code/bảo mật có kèm dẫn chiếu file/dòng code cụ thể.
- [ ] Đưa ra danh sách các đề xuất tối ưu hóa hiệu năng kèm phân tích cụ thể.
