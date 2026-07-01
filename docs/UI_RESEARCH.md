# UI/UX Research & Improvement Plan

> Tham khảo: TablePlus, Beekeeper Studio, Postico, MongoDB Compass, DataGrip, DBeaver

---

## 1. Current State — Vấn đề hiện tại

| Khu vực | Vấn đề cụ thể |
|---------|--------------|
| **Sidebar** | Flat, không có depth. DB type badges (PG/MY/MG) text thô. Active state yếu. |
| **Tab bar** | Tabs trông như buttons. Active tab quá nhẹ (`bg-gray-800`). |
| **DataGrid** | Rows flat, không phân biệt. NULL hiện chữ "NULL" xám — cần italic style riêng. Bool hiện text thô. Numbers không right-aligned đủ. Không có row striping. |
| **Typography** | Quá nhiều custom sizes: text-[9px], text-[10px], text-[11px] — không có hệ thống. |
| **Colors** | Safe nhưng nhàm. Mọi thứ gray/neutral. Thiếu depth, layering. |
| **Empty states** | Generic icon + text đơn điệu. Không CTA. |
| **Connection form** | DB type = 3 plain buttons. Thiếu visual hierarchy. |
| **Buttons** | Không có consistent hierarchy (primary/secondary/ghost/danger). |
| **FilterBar** | Cramped, filters dạng form rows khó đọc. |
| **Loading states** | Spinner overlay che toàn màn — quá disruptive. |

---

## 2. Tham khảo từ best-in-class tools

### TablePlus
- Rounded tabs giống macOS, tab có own background khi active
- DataGrid: row striping cực nhẹ, clean borders, full-row blue highlight khi select
- NULL: light italic `null` (không uppercase, không badge)
- Status bar ở bottom: latency, row count, query time

### Beekeeper Studio (dark theme tốt nhất)
- Left border accent `border-l-2` khi connection active
- Tab bar: pill-style bottom indicator thay `bg-` full
- Error: inline colored boxes, không popup dialog
- Spacing: 4px base grid rất consistent

### Postico (đẹp nhất, macOS)
- Row padding generous (`py-2.5` = 32px height)
- NULL: italic gray text in cell (not a badge, not uppercase)
- Boolean: small colored circles/pills
- Column resize: invisible handle until hover → 3px blue line

### MongoDB Compass
- Document view: BSON type-colored values
- Sidebar: proper `+` Add button per section
- Search bar always visible (không ẩn sau threshold)

---

## 3. Design System Tokens (proposed)

```
Background layers:
  bg-base:     #080d17   (main — darker than current #0a0f1a)
  bg-surface:  #0d1424   (sidebar, panels — giữ nguyên)
  bg-elevated: #111d2e   (cards, code areas — thay bg-gray-800)
  bg-input:    #0f1825   (inputs)
  bg-overlay:  #162035   (dropdowns, context menus)

Borders (thay border-gray-*):
  border-faint:   rgba(255,255,255,0.04)
  border-subtle:  rgba(255,255,255,0.07)
  border-default: rgba(255,255,255,0.10)
  border-strong:  rgba(255,255,255,0.16)

Text:
  primary:   #e2e8f4  (thay gray-100)
  secondary: #7a8699  (thay gray-400/500)
  muted:     #374357  (thay gray-600/700)
  code:      #a8b4c8  (thay gray-300 mono)

DB Colors:
  postgres:  text-sky-400  bg-sky-500/10   border-sky-500/20
  mysql:     text-orange-400 bg-orange-500/10 border-orange-500/20
  mongodb:   text-emerald-400 bg-emerald-500/10 border-emerald-500/20

States:
  success:   #22c55e  (green-500)
  danger:    #f43f5e  (rose-500)
  warning:   #f59e0b  (amber-500)
  info:      #3b82f6  (blue-500)
```

---

## 4. Top 12 UI Improvements

---

### 🔴 P0 — Ngay (high impact, low effort)

#### UI-1: DataGrid Cell Rendering *(~2h)*
```
NULL    → italic gray, lowercase: <span className="text-[11px] text-gray-600/80 italic select-none not-italic">∅</span>
         hoặc: empty string = empty, null = light "null" italic
bool=T  → <span className="text-[10px] font-medium text-emerald-400 bg-emerald-900/25 rounded-full px-2 py-0.5">true</span>
bool=F  → <span className="text-[10px] font-medium text-rose-400 bg-rose-900/25 rounded-full px-2 py-0.5">false</span>
number  → right-align, text-amber-300 (brighter), tabular-nums
ObjectId → first 8 chars + "…" với `text-gray-500 font-mono text-[10px]`
long str → truncate với max-w-[200px] + expand button
```

#### UI-2: DataGrid Row Aesthetics *(~1h)*
```
row striping:  even:bg-white/[0.018]
row hover:     hover:bg-[#0e1a2e]  (blue-tinted dark)
row selected:  bg-blue-500/10 border-l-2 border-l-blue-500
row height:    py-[7px] thay py-1.5 (28px→32px)
thead bg:      bg-[#090e1b] sticky (tối hơn body)
thead text:    text-[10px] font-semibold uppercase tracking-wider text-gray-500
resize handle: 3px, bg-transparent hover:bg-blue-500/50
```

#### UI-3: Tab Bar Redesign *(~1h)*
```
Active tab:
  text-white
  border-b-2 border-blue-500
  bg-transparent (không dùng bg-gray-800)

Inactive tab:
  text-gray-500
  hover:text-gray-300
  hover:bg-white/[0.03]

Tab bar container:
  bg-[#080d17] (match main bg → depth effect)
  border-b border-white/[0.06]
  height: 38px

Selected table badge (right side):
  bg-[#111d2e] border border-white/[0.08] rounded-md
  font-mono text-[11px] text-gray-400
  max-w-[180px] truncate
```

#### UI-4: Sidebar Connection Items *(~2h)*
```
Active connection row:
  border-l-2 border-blue-500
  bg-gradient-to-r from-blue-600/[0.08] to-transparent
  padding-left: calc(0.5rem - 2px) để bù border

DB type badge → icon + color:
  PostgreSQL: Database icon, text-sky-400
  MongoDB:    Leaf icon, text-emerald-400  
  MySQL:      Cylinder icon, text-orange-400

Status dot khi connected:
  bg-emerald-400
  box-shadow: 0 0 0 3px rgba(52,211,153,0.15) (subtle glow ring)

Connection name:
  selected: text-white font-medium
  active:   text-gray-200
  inactive: text-gray-400
```

#### UI-5: Button Design System *(~1h)*
```
Primary:
  bg-blue-600 hover:bg-blue-500 active:bg-blue-700
  text-white font-medium rounded-lg px-4 py-1.5
  shadow-sm shadow-blue-900/40

Secondary:
  bg-white/[0.04] hover:bg-white/[0.07]
  border border-white/[0.10] hover:border-white/[0.16]
  text-gray-300 rounded-lg px-3 py-1.5

Ghost:
  text-gray-400 hover:text-gray-200
  hover:bg-white/[0.04] rounded-lg

Danger:
  text-rose-400 hover:text-rose-300
  hover:bg-rose-500/[0.08] rounded-lg

Icon button:
  p-1.5 rounded-md text-gray-500
  hover:text-gray-200 hover:bg-white/[0.05]
```

---

### 🟡 P1 — Tuần tiếp

#### UI-6: Connection Form — DB Type Cards *(~2h)*
```
Thay 3 flat buttons bằng 3 icon cards:
  Layout: 3 cards horizontal, height 64px
  Each card:
    - DB icon (20px SVG hoặc lucide với màu đặc trưng)
    - DB name (text-xs font-medium)
    - Short desc (text-[10px] text-gray-500)
  Selected state:
    border-2 border-[db-color] bg-[db-color]/10
  Hover:
    border-white/20 bg-white/[0.03]
```

#### UI-7: Sidebar Polish *(~2h)*
```
Width: 260px (hiện 240px — thêm 20px)
Logo area:
  icon lớn hơn: w-8 h-8 (hiện w-7)
  Add subtle gradient: bg-gradient-to-br from-blue-500/20 to-blue-600/10
  App name: text-[15px] font-bold (hiện text-sm)
  Version: "v0.1" text-[9px] text-gray-700

Section header ("CONNECTIONS"):
  flex items-center justify-between
  text-[9px] font-bold tracking-[0.12em] text-gray-600/70

"New Connection" button:
  bg-gradient-to-r from-blue-600 to-blue-500
  hover: from-blue-500 to-blue-400
  shadow-md shadow-blue-900/30

Sidebar background:
  bg-gradient-to-b from-[#0e1525] to-[#0d1424]
```

#### UI-8: SchemaTree Polish *(~1.5h)*
```
Search: luôn hiển thị (bỏ threshold > 8), nhỏ gọn hơn
Item selected: bg-blue-500/15 text-blue-300 font-medium
Item hover:    bg-white/[0.04]
Icon:
  Database → FolderOpen (14x14) text-gray-500
  Table    → GridIcon  (10x10) text-gray-600
  Count badge: right-aligned tabular-nums text-[9px] text-gray-700/80
Loading: 3 skeleton bars với pulse animation
```

#### UI-9: Toast Notification System *(~2h)*
```
Position: bottom-right, fixed, z-50
Slide in từ right (translateX 100% → 0)
Auto-dismiss: 2.5s, hover pause
Stack: max 3 toasts, mới nhất trên cùng
Types:
  success: bg-emerald-900/80 border-emerald-700/50 text-emerald-200
  error:   bg-rose-900/80    border-rose-700/50    text-rose-200
  info:    bg-blue-900/80    border-blue-700/50    text-blue-200
  default: bg-gray-800/90   border-gray-700/50    text-gray-200
```

---

### 🟢 P2 — Polish

#### UI-10: Skeleton Loading States *(~3h)*
```
Thay spinner overlay bằng skeleton shimmer:
  DataGrid loading: 8 skeleton rows với animated gradient
  SchemaTree loading: 4-5 skeleton items
  Animation: shimmer left-to-right (CSS keyframe)
  Color: from-gray-800/0 via-gray-700/30 to-gray-800/0
```

#### UI-11: Empty States Redesign *(~2h)*
```
Mỗi empty state:
  Icon: 40x40 rounded-2xl container với icon 20px
  Title: text-sm font-medium text-gray-400
  Desc:  text-xs text-gray-600 (optional)
  CTA:   primary/ghost button (contextual)

Instances:
  No connection → "Connect a database" + New Connection button
  No table selected → "Select a table or collection"
  Empty table → "No rows" + Insert row button
  No query result → empty (don't show anything before first run)
  Query OK (0 rows affected) → "0 rows returned" subtle
```

#### UI-12: FilterBar Chips *(~2h)*
```
Active filters → pills/chips thay form rows:
  `status = "active" [×]  age > 18 [×]  [+ Add filter]`
  Chips: bg-blue-900/30 border border-blue-700/40 rounded-full px-2 py-0.5 text-[11px]
  Remove: × button bên phải chip

MQL filter (MongoDB):
  bg-[#0f1825] rounded-lg border
  Focused: border-blue-500/50 ring-1 ring-blue-500/20
  Valid JSON: green dot indicator
  Invalid: red border + shake animation (CSS)
```

---

## 5. Implementation Order — Bắt đầu ngay

```
Ngay bây giờ (2-3h):
  1. DataGrid cells (NULL/bool/number)     UI-1  — biggest visual impact
  2. DataGrid row aesthetics               UI-2  — striping + hover + height
  3. Tab bar redesign                      UI-3  — immediately visible
  4. Button system                         UI-5  — consistency

Tiếp theo:
  5. Sidebar connection items              UI-4  — active state + icons
  6. Connection form DB cards              UI-6  — first impression
  7. Sidebar layout polish                 UI-7  — branding
  8. SchemaTree polish                     UI-8  — sidebar completeness

Sau:
  9. Toast system                          UI-9  — UX polish
  10. Skeleton loading                     UI-10 — perceived performance
  11. Empty states                         UI-11 — polish
  12. FilterBar chips                      UI-12 — filter UX
```
