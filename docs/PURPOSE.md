# Purpose

## Vấn đề cần giải quyết

Các database GUI tool hiện tại (TablePlus, DBeaver, DataGrip) được thiết kế cho workflow thủ công: người dùng tự viết query, tự navigate schema, tự tổng hợp kết quả. Chúng hoàn toàn tách biệt với AI và không thể được AI agent sử dụng trực tiếp.

Điều này tạo ra ma sát lớn khi developer muốn:
- Nhờ AI phân tích data mà không phải copy-paste từng bảng
- Để Claude Code tự query database để hiểu context của task
- Hỏi AI bằng tiếng Việt/Anh tự nhiên để sinh SQL

## Mục tiêu

**tool-sql** là database GUI tool dành riêng cho developer dùng AI, với hai điểm khác biệt cốt lõi:

1. **AI-native**: AI query generation với schema context được inject tự động — không cần giải thích cấu trúc bảng mỗi lần
2. **MCP server tích hợp**: Claude Code, Cursor, và các AI agent khác có thể kết nối và query database trực tiếp qua MCP protocol, không cần human-in-the-loop

## Người dùng mục tiêu

**Chính**: Developer cá nhân làm việc với PostgreSQL, MySQL, hoặc MongoDB, và đang dùng AI coding tools hàng ngày (Claude Code, Cursor, Copilot).

**Không phải**: DBA doanh nghiệp cần RBAC, audit trail, team collaboration. Tool này không cạnh tranh ở segment đó.

## Thành công trông như thế nào

**Phase 1 MVP thành công khi:**
- Có thể kết nối Postgres và xem/sửa data mà không cần mở terminal
- Nhanh hơn TablePlus với tác vụ thông thường (kết nối, browse, query đơn giản)

**Phase 2 thành công khi:**
- Gõ "cho tôi xem 10 user mới nhất có email gmail" → SQL đúng được sinh ra và chạy
- AI hiểu schema mà không cần giải thích

**Phase 3 thành công khi:**
- Trong Claude Code, có thể nói "check xem bảng users có bao nhiêu row" và Claude tự query qua MCP
- AI agent có thể dùng tool-sql như một MCP server để làm việc với database

## Không nằm trong scope

- Collaboration / multi-user
- Migration tool / schema diff
- Query performance profiling / EXPLAIN analyzer (có thể thêm sau)
- Cloud database hosting
- Mobile app
