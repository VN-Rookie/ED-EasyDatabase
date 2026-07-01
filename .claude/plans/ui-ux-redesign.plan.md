# Plan: UI/UX Breaking Redesign — Modern (Linear/Raycast) + Dark/Light Design System

**Source:** User request (2026-06-26): breaking change toàn bộ UI/UX để trải nghiệm mượt hơn. Decisions confirmed:
- Pain points: visual, layout & navigation, smoothness/motion, consistency (tất cả).
- Direction: **Modern — Linear/Raycast-style** (bo góc, depth/shadow tinh tế, micro-motion, command palette).
- Scope: **toàn bộ — design system mới**.
- Theming: **Dark + Light** với toggle.

**Complexity:** Large (phased; an toàn để dừng giữa các phase).

## Goal
Thay lớp trình bày của app bằng một design system mới (token-driven, dark+light, motion primitives, atoms thống nhất) theo phong cách Linear/Raycast, áp dụng lên toàn bộ live tree (`src/app`, `src/features`, `src/shared/ui`). **Success condition:** mọi feature đang chạy render bằng token mới; bật/tắt Dark↔Light tức thì không vỡ màu; `bun run typecheck` sạch; tương tác (hover/press/tab/panel/list) có micro-motion mượt; có command palette ⌘K điều hướng connections/tables/actions.

## Scope Guardrails (đọc trước khi code)
- **CHỈ** sửa live tree: `src/app/**`, `src/features/**`, `src/shared/ui/**`, `src/stores/{workspaceStore,layoutStore,settingsStore,savedQueriesStore}.ts`, `src/features/connection/connectionStore.ts`, `src/App.css`, `src/main.tsx`/`src/App.tsx`.
- **TUYỆT ĐỐI KHÔNG** sửa code attempt cũ (đã chết trong live tree): `src/components/**`, `src/hooks/**`, `src/stores/{connectionStore,schemaStore,viewStore}.ts`. Nếu thấy bẩn → ghi chú, không xoá (theo CLAUDE.md "reference only" + Karpathy surgical).
- **Không đổi** backend, Tauri commands, hay data flow `invoke()`. Đây là redesign thuần frontend presentation + light interaction state (theme, layout persist, command palette).
- **Không thêm** browser `alert/confirm/prompt` (dùng in-app, đã có Toast + confirm-bar pattern).
- Tailwind v4 qua `@tailwindcss/vite`, entry `@import "tailwindcss"` trong `App.css`, **không** tạo `tailwind.config.js`.
- File ≤ 800 dòng, ưu tiên 200–400; tách khi phình.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Design tokens | `src/App.css:3-19` (`@theme { --color-* }`) | Token semantic đã có (`bg/surface/elevated/hover/border/fg/muted/faint/accent/ok/warn/danger`). Giữ TÊN token, đổi cơ chế sang var-driven 2-theme. |
| Token consumption | `src/app/Toolbar.tsx:11` (`bg-surface border-border text-fg text-accent`) | Mọi component dùng utility semantic — KHÔNG hardcode hex/`text-white`. Light mode "miễn phí" nếu giữ kỷ luật này. |
| UI atom | `src/shared/ui/IconButton.tsx` | Functional comp, props `interface`, className template-string, `transition-*`. Atoms mới theo đúng khuôn này. |
| Tabs underline | `src/shared/ui/Tabs.tsx` | Active = `border-b-2 border-accent`; thêm motion slide. |
| Dropdown/overlay outside-click | `src/features/object-view/DataGridShell.tsx:22-38` (ColumnPicker `useRef` + `mousedown` listener) | Khuôn cho menu/command-palette dismiss. |
| Modal | `src/shared/ui/CellDetailModal.tsx` | Khuôn overlay cho command palette. |
| Toast | `src/components/Toast.tsx` (live, dùng ở `App.tsx`) | Đã có; chỉ restyle token, không viết lại logic. |
| Zustand store | `src/stores/layoutStore.ts:6` (`create<T>((set) => ...)`) | Khuôn store. **Persistence chưa có** → thêm bằng `zustand/middleware` `persist` (mới — lý do bên dưới). |
| Resizer | `src/shared/ui/ResizableSplit.tsx` | Đã có drag cơ bản (mousemove + ref). Nâng cấp tại chỗ, giữ API props. |

> **Không có sẵn pattern cho:** theme switching, motion tokens, command palette, persisted layout. Các phần này là **code mới** — đánh dấu rõ trong từng task, không giả vờ mirror.

## Files to Change
| File | Action | Why |
|---|---|---|
| `src/App.css` | MODIFY | Token system mới: raw vars `:root`/`[data-theme="dark"]` + `@theme inline` map + radius/shadow/motion tokens + keyframes; sửa scrollbar/shimmer dùng `currentColor`/token thay `rgba(255,255,255,…)`. |
| `src/stores/themeStore.ts` | CREATE | State `theme: 'light'\|'dark'\|'system'`, persisted; resolved theme. |
| `src/shared/ui/useTheme.ts` | CREATE | Hook: áp `data-theme` lên `document.documentElement`, lắng nghe `prefers-color-scheme` khi `system`; export `resolveTheme` + `useResolvedTheme` dùng chung. |
| `src/stores/layoutStore.ts` | MODIFY | Thêm `persist` cho `explorerWidth` (+ command-palette open state nếu cần). |
| `src/shared/ui/Button.tsx` | CREATE | Atom Button (variants: primary/ghost/danger/subtle; sizes). |
| `src/shared/ui/Input.tsx` | CREATE | Atom Input/Textfield thống nhất. |
| `src/shared/ui/Select.tsx` | CREATE | Atom Select thống nhất. |
| `src/shared/ui/Kbd.tsx` | CREATE | Hiển thị phím tắt (⌘K…), dùng ở palette/tooltip. |
| `src/shared/ui/Spinner.tsx` | CREATE | Thay các `Loader2 animate-spin` rải rác bằng 1 atom. |
| `src/shared/ui/IconButton.tsx` | MODIFY | Restyle theo token + motion mới (giữ API props). |
| `src/shared/ui/Tabs.tsx` | MODIFY | Bỏ `text-white` hardcode → `text-fg`; thêm motion. |
| `src/shared/ui/ResizableSplit.tsx` | MODIFY | Pointer capture, double-click reset, handle rõ hơn, persist width. |
| `src/shared/ui/EmptyState.tsx` | MODIFY | Restyle token + bo góc/shadow mới. |
| `src/shared/ui/CellDetailModal.tsx` | MODIFY | Restyle + motion enter. |
| `src/app/Toolbar.tsx` | MODIFY | Layout mới + theme toggle + nút ⌘K + dùng Button/IconButton mới. |
| `src/app/StatusBar.tsx` | MODIFY | Restyle token, pill connection-status. |
| `src/app/AppShell.tsx` | MODIFY | Mount `useTheme`, mount CommandPalette, cấu trúc layout. |
| `src/features/explorer/ExplorerTree.tsx` | MODIFY | Overhaul hàng/hover/selection/chevron-motion/status; có thể tách `ConnectionRow`/`TableRow`. |
| `src/features/explorer/ConnectionRow.tsx` | CREATE (nếu tách) | Giảm kích thước ExplorerTree (<400 dòng). |
| `src/features/workspace/Workspace.tsx` | MODIFY | Tab bar restyle + motion; active-tab indicator. |
| `src/features/object-view/ObjectView.tsx` | MODIFY | Header/tabs restyle token. |
| `src/features/object-view/DataGridShell.tsx` | MODIFY | Grid restyle: sticky header depth, zebra/hover, density; tách menu nếu phình. |
| `src/features/sql-console/SqlConsoleShell.tsx` | MODIFY | Restyle toolbar/result; CodeMirror theme theo light/dark thay `oneDark` cứng. |
| `src/features/settings/SettingsShell.tsx` | MODIFY | Restyle bằng atoms mới; thêm chọn Theme. |
| `src/features/connection/ConnectionDialogShell.tsx` | MODIFY | Restyle bằng atoms mới. |
| `src/features/saved-queries/SavedQueriesPanel.tsx` | MODIFY | Restyle bằng atoms mới. |
| `src/features/command-palette/CommandPalette.tsx` | CREATE | ⌘K overlay: fuzzy filter connections/tables/actions. |
| `src/features/command-palette/useCommandPalette.ts` | CREATE | Global ⌘K listener + open/close state. |

---

## Tasks

> Mỗi task verify bằng: `bun run typecheck` → **0 errors**, và (khi đổi giao diện) kiểm tra trực quan qua dev server. **Khởi động dev server đúng luật CLAUDE.md:** `kill $(lsof -ti :1420) 2>/dev/null; bun run dev` rồi mở `http://localhost:1420`. Không để server chạy ngầm giữa các lần.

### PHASE 0 — Token & Theme Foundation

### Task 1: Token system 2-theme trong `App.css`
**Files:** Modify `src/App.css`
**Mirror:** giữ TÊN token ở `App.css:3-19`. **Mới:** cơ chế var-driven + `@theme inline` (Tailwind v4 dark-mode-bằng-CSS-vars) — không có sẵn trong repo.
- [ ] Step 1: Thay block `@theme { … }` hiện tại bằng raw vars theo theme + `@theme inline` map. Dán nguyên:
```css
@import "tailwindcss";

/* ── Raw semantic palette: light = default, dark = override ─────────── */
:root {
  --bg:            #ffffff;
  --surface:       #f6f7f9;
  --elevated:      #ffffff;
  --hover:         #eef0f3;
  --border:        #e4e7eb;
  --border-strong: #d4d8de;
  --fg:            #16181d;
  --muted:         #5f6672;
  --faint:         #9aa1ad;
  --accent:        #5e6ad2;   /* Linear violet */
  --accent-strong: #4c56c0;
  --on-accent:     #ffffff;   /* text on accent fills */
  --ok:            #2f9e54;
  --warn:          #c2820a;
  --danger:        #d23f3f;
  --overlay:       rgba(16,18,23,0.40);
  --scrollbar:     rgba(0,0,0,0.18);
  --scrollbar-hover: rgba(0,0,0,0.30);
  --shimmer:       rgba(0,0,0,0.05);

  --radius-sm: 6px;
  --radius-md: 9px;
  --radius-lg: 13px;
  --shadow-sm: 0 1px 2px rgba(16,18,23,0.06), 0 1px 1px rgba(16,18,23,0.04);
  --shadow-md: 0 4px 12px rgba(16,18,23,0.10), 0 1px 3px rgba(16,18,23,0.06);
  --shadow-lg: 0 12px 32px rgba(16,18,23,0.16), 0 2px 8px rgba(16,18,23,0.08);
  --dur-fast: 110ms;
  --dur-base: 170ms;
  --dur-slow: 260ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

[data-theme="dark"] {
  --bg:            #0c0d10;
  --surface:       #131418;
  --elevated:      #1a1c21;
  --hover:         #202329;
  --border:        #262931;
  --border-strong: #383c45;
  --fg:            #e8eaed;
  --muted:         #8b8f98;
  --faint:         #565b64;
  --accent:        #6e79e0;
  --accent-strong: #818cf0;
  --on-accent:     #ffffff;
  --ok:            #34d399;
  --warn:          #fbbf24;
  --danger:        #f87171;
  --overlay:       rgba(0,0,0,0.55);
  --scrollbar:     rgba(255,255,255,0.10);
  --scrollbar-hover: rgba(255,255,255,0.18);
  --shimmer:       rgba(255,255,255,0.05);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.40);
  --shadow-md: 0 4px 14px rgba(0,0,0,0.45);
  --shadow-lg: 0 14px 40px rgba(0,0,0,0.55);
}

/* ── Map vào utilities Tailwind (inline = follow runtime var) ───────── */
@theme inline {
  --color-bg:            var(--bg);
  --color-surface:       var(--surface);
  --color-elevated:      var(--elevated);
  --color-hover:         var(--hover);
  --color-border:        var(--border);
  --color-border-strong: var(--border-strong);
  --color-fg:            var(--fg);
  --color-muted:         var(--muted);
  --color-faint:         var(--faint);
  --color-accent:        var(--accent);
  --color-accent-strong: var(--accent-strong);
  --color-on-accent:     var(--on-accent);
  --color-ok:            var(--ok);
  --color-warn:          var(--warn);
  --color-danger:        var(--danger);
}
/* radius/shadow/motion KHÔNG map vào @theme — dùng trực tiếp qua arbitrary value:
   rounded-[var(--radius-md)], shadow-[var(--shadow-lg)], duration-[var(--dur-fast)].
   Tránh map tự-tham-chiếu vòng và utility không bao giờ gọi tới. */

html, body, #root { height: 100%; }
body { background: var(--bg); color: var(--fg); }
```
- [ ] Step 2: Cập nhật keyframes/utility cũ để không hardcode trắng:
```css
@keyframes shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }
.skeleton-shimmer {
  background: linear-gradient(90deg, transparent 0%, var(--shimmer) 50%, transparent 100%);
  background-size: 600px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes toastIn { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.toast-enter { animation: toastIn var(--dur-slow) var(--ease-out); }

/* Motion primitives dùng lại toàn app */
@keyframes popIn { from { opacity: 0; transform: scale(0.97) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.anim-pop  { animation: popIn var(--dur-base) var(--ease-out); }
.anim-fade { animation: fadeIn var(--dur-base) var(--ease-out); }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}

::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 5px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover); border: 2px solid transparent; background-clip: content-box; }

td { user-select: text; }
th { user-select: none; }
```
- [ ] Verify: `bun run typecheck` → 0 errors. Dev server: app vẫn render; tạm thời chưa có `data-theme` nên hiển thị **light** (default `:root`). Set thủ công trong devtools `document.documentElement.dataset.theme='dark'` → toàn app đổi sang dark tức thì (chứng minh token auto-switch).

### Task 2: themeStore + useTheme hook
**Files:** Create `src/stores/themeStore.ts`, `src/shared/ui/useTheme.ts`
**Mirror:** store theo `layoutStore.ts:6`. **Mới:** dùng `persist` middleware (`zustand/middleware`) — lý do: theme/layout phải sống qua reload; repo chưa có persistence, đây là cách chuẩn của zustand 5 (đã có trong deps).
- [ ] Step 1: `src/stores/themeStore.ts`
```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePref = "light" | "dark" | "system";

interface ThemeState {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({ pref: "system", setPref: (pref) => set({ pref }) }),
    { name: "tool-sql:theme" },
  ),
);
```
- [ ] Step 2: `src/shared/ui/useTheme.ts`
```ts
import { useEffect, useState } from "react";
import { useThemeStore, type ThemePref } from "../../stores/themeStore";

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

/** Mount once at app root: keeps <html data-theme> in sync with the pref. */
export function useTheme(): void {
  const pref = useThemeStore((s) => s.pref);
  useEffect(() => {
    const apply = () => { document.documentElement.dataset.theme = resolveTheme(pref); };
    apply();
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);
}

/** Reactive resolved theme for components that branch on it (e.g. the SQL editor). */
export function useResolvedTheme(): "light" | "dark" {
  const pref = useThemeStore((s) => s.pref);
  const [resolved, setResolved] = useState(() => resolveTheme(pref));
  useEffect(() => {
    const update = () => setResolved(resolveTheme(pref));
    update();
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [pref]);
  return resolved;
}
```
- [ ] Step 3: Trong `src/app/AppShell.tsx` thêm `import { useTheme } from "../shared/ui/useTheme";` và gọi `useTheme();` ở đầu component (trước `return`).
- [ ] Verify: `bun run typecheck` → 0 errors. Dev server: reload → theme khớp OS; sẽ gắn toggle ở Task 7.

### PHASE 1 — Shared atoms

### Task 3: Button + Input + Select + Kbd + Spinner atoms
**Files:** Create `src/shared/ui/{Button,Input,Select,Kbd,Spinner}.tsx`
**Mirror:** `IconButton.tsx` (props interface, className template-string, `transition-*`).
- [ ] Step 1: `src/shared/ui/Button.tsx`
```tsx
import type { ButtonHTMLAttributes, ElementType, ReactNode } from "react";

type Variant = "primary" | "subtle" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ElementType;
  children?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong shadow-[var(--shadow-sm)]",
  subtle:  "bg-elevated text-fg border border-border hover:bg-hover",
  ghost:   "text-muted hover:text-fg hover:bg-hover",
  danger:  "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20",
};
const SIZE: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-9 px-3.5 text-sm gap-2 rounded-[var(--radius-md)]",
};

export function Button({ variant = "subtle", size = "md", icon: Icon, children, className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center font-medium transition-all duration-[var(--dur-fast)] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {Icon && <Icon size={size === "sm" ? 13 : 15} />}
      {children}
    </button>
  );
}
```
- [ ] Step 2: `src/shared/ui/Input.tsx`
```tsx
import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`h-9 w-full px-3 text-sm bg-elevated text-fg rounded-[var(--radius-md)] border border-border placeholder:text-faint transition-colors duration-[var(--dur-fast)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 ${className}`}
    />
  );
}
```
- [ ] Step 3: `src/shared/ui/Select.tsx`
```tsx
import type { SelectHTMLAttributes, ReactNode } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { children: ReactNode; }

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={`h-9 w-full px-3 text-sm bg-elevated text-fg rounded-[var(--radius-md)] border border-border transition-colors duration-[var(--dur-fast)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 ${className}`}
    >
      {children}
    </select>
  );
}
```
- [ ] Step 4: `src/shared/ui/Kbd.tsx`
```tsx
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center h-5 px-1.5 text-[10px] font-medium font-sans text-muted bg-elevated border border-border rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)]">
      {children}
    </kbd>
  );
}
```
- [ ] Step 5: `src/shared/ui/Spinner.tsx`
```tsx
import { Loader2 } from "lucide-react";
export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-muted ${className}`} />;
}
```
- [ ] Verify: `bun run typecheck` → 0 errors.

### Task 4: Restyle các atom sẵn có (IconButton, Tabs, EmptyState, CellDetailModal)
**Files:** Modify `src/shared/ui/{IconButton,Tabs,EmptyState,CellDetailModal}.tsx`
**Mirror:** giữ nguyên props API & logic; chỉ đổi className sang token/motion mới.
- [ ] Step 1: `IconButton.tsx` — đổi className button thành:
```tsx
className={`p-1.5 rounded-[var(--radius-md)] transition-all duration-[var(--dur-fast)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
  active ? "text-accent bg-accent/12" : "text-muted hover:text-fg hover:bg-hover"
}`}
```
- [ ] Step 2: `Tabs.tsx` — bỏ `text-white` hardcode (vỡ ở light). Active class đổi `border-accent text-white` → `border-accent text-fg`; thêm `transition-all duration-[var(--dur-base)]` (đã có `transition-all`, giữ).
- [ ] Step 3: `EmptyState.tsx` — icon wrapper: `bg-elevated border border-border` → `bg-elevated border border-border shadow-[var(--shadow-sm)] rounded-[var(--radius-lg)]`; thêm `anim-fade` lên container ngoài cùng.
- [ ] Step 4: `CellDetailModal.tsx` — backdrop dùng `bg-[var(--overlay)]`; panel thêm `shadow-[var(--shadow-lg)] rounded-[var(--radius-lg)] anim-pop`; thay mọi hex/`rgba` trắng (nếu có) bằng token.
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: mở 1 cell dài → modal có shadow + pop-in; tabs đọc được ở cả light/dark.

### PHASE 2 — App shell

### Task 5: ResizableSplit nâng cấp + persist width
**Files:** Modify `src/shared/ui/ResizableSplit.tsx`, `src/stores/layoutStore.ts`
**Mirror:** giữ props API (`left/right/leftWidth/onLeftWidthChange/min/max`).
- [ ] Step 1: `layoutStore.ts` — thêm persist:
```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  explorerWidth: number;
  setExplorerWidth: (w: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({ explorerWidth: 280, setExplorerWidth: (explorerWidth) => set({ explorerWidth }) }),
    { name: "tool-sql:layout" },
  ),
);
```
- [ ] Step 2: `ResizableSplit.tsx` — dùng pointer events + capture + double-click reset. Đổi handle div:
```tsx
const DEFAULT = 280;
const onPointerDown = (e: React.PointerEvent) => {
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  dragging.current = true;
};
const onPointerMove = (e: React.PointerEvent) => {
  if (!dragging.current) return;
  onLeftWidthChange(Math.min(max, Math.max(min, e.clientX)));
};
const stop = () => { dragging.current = false; };
// handle:
<div
  onPointerDown={onPointerDown}
  onPointerMove={onPointerMove}
  onPointerUp={stop}
  onDoubleClick={() => onLeftWidthChange(DEFAULT)}
  className="w-1 cursor-col-resize bg-border/0 hover:bg-accent/50 active:bg-accent transition-colors duration-[var(--dur-fast)]"
/>
```
(Bỏ `onMouseMove/onMouseUp` ở container ngoài; chuyển hết lên handle.)
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: kéo resizer mượt không nhảy; double-click → về 280; reload → giữ width.

### Task 6: Toolbar redesign (+ theme toggle + nút ⌘K)
**Files:** Modify `src/app/Toolbar.tsx`
**Mirror:** dùng `IconButton` + `Kbd` mới; `Button` cho New Connection.
- [ ] Step 1: Thêm props `onOpenPalette?: () => void`. Header class: `h-12 ... bg-surface/80 backdrop-blur border-b border-border`. Brand giữ `DatabaseZap` + tên app.
- [ ] Step 2: Thêm cụm giữa: nút "Search…" mở palette — `Button variant="subtle" size="sm"` chứa icon `Search`, text `Tìm kiếm`, và `<Kbd>⌘K</Kbd>`, `onClick={onOpenPalette}`.
- [ ] Step 3: Thêm theme toggle bên phải: `IconButton` icon `Sun`/`Moon` (từ `lucide-react`) đọc `useThemeStore`, click cycle `light→dark→system`. Title hiển thị pref hiện tại.
```tsx
import { Sun, Moon, MonitorSmartphone, Search } from "lucide-react";
import { useThemeStore } from "../stores/themeStore";
// trong component:
const { pref, setPref } = useThemeStore();
const next = pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
const ThemeIcon = pref === "light" ? Sun : pref === "dark" ? Moon : MonitorSmartphone;
// nút:
<IconButton icon={ThemeIcon} label={`Theme: ${pref}`} onClick={() => setPref(next)} />
```
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: bấm toggle → toàn app đổi light/dark tức thì, mượt; reload giữ lựa chọn.

### Task 7: StatusBar + AppShell composition
**Files:** Modify `src/app/StatusBar.tsx`, `src/app/AppShell.tsx`
**Mirror:** StatusBar giữ props; AppShell giữ cấu trúc Toolbar/Split/StatusBar.
- [ ] Step 1: `StatusBar.tsx` — restyle: `h-7 bg-surface border-t border-border text-[11px] text-muted`; connection thành pill `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-elevated border border-border` với chấm trạng thái `<span className="w-1.5 h-1.5 rounded-full bg-ok" />`.
- [ ] Step 2: `AppShell.tsx` — truyền `onOpenPalette` xuống Toolbar (state mở palette ở Task 13), giữ `useTheme()` (Task 2).
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: status bar đọc tốt ở cả 2 theme.

### PHASE 3 — Explorer

### Task 8: ExplorerTree overhaul
**Files:** Modify `src/features/explorer/ExplorerTree.tsx` (+ Create `src/features/explorer/ConnectionRow.tsx` nếu vượt ~400 dòng)
**Mirror:** giữ TOÀN BỘ logic state/handlers hiện có (connect/disconnect/delete/loadTables); chỉ đổi presentation. Confirm-delete giữ pattern inline (không browser dialog).
- [ ] Step 1: Header "Explorer": giữ; thêm padding/letter-spacing token. Hàng connection: tăng vùng chạm `py-1.5`, bo `rounded-[var(--radius-sm)] mx-1`, hover `hover:bg-hover`, selected dùng `bg-accent/10 text-fg`.
- [ ] Step 2: Chevron animate: thay đổi giữa `ChevronRight/ChevronDown` bằng 1 `ChevronRight` xoay: `className={`transition-transform duration-[var(--dur-fast)] ${isOpen ? "rotate-90" : ""}`}`.
- [ ] Step 3: Table row: icon `Table2`, hover nền + `text-fg`; selected (object đang mở) highlight bằng `bg-accent/10`. Dùng `Spinner` atom thay `Loader2` inline.
- [ ] Step 4: Nếu file > 400 dòng sau sửa → tách `ConnectionRow.tsx` nhận props từ ExplorerTree (giữ handlers truyền xuống).
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: kết nối thật/mock → expand mượt, hover/selected rõ, không vỡ ở light.

### PHASE 4 — Workspace, object view, grid, editor

### Task 9: Workspace tab bar
**Files:** Modify `src/features/workspace/Workspace.tsx`
**Mirror:** giữ logic `openObjects/activeObjectId/consoleOpen`.
- [ ] Step 1: Tab item: `rounded-t-[var(--radius-md)]`, active = `bg-bg text-fg` với indicator `border-b-2 border-accent`, inactive = `text-muted hover:text-fg hover:bg-hover`, `transition-all duration-[var(--dur-fast)]`. Nút close `X` hiện khi hover/active.
- [ ] Step 2: Vùng nội dung wrap `anim-fade` khi đổi tab (key theo `activeObjectId`/console).
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: chuyển tab có fade nhẹ; SQL Console tab hoạt động như cũ.

### Task 10: ObjectView header/tabs
**Files:** Modify `src/features/object-view/ObjectView.tsx`
**Mirror:** giữ logic subView; dùng `Tabs` mới.
- [ ] Step 1: Header `bg-surface border-b border-border`; pill tên object đổi `rounded-[var(--radius-md)] bg-elevated border border-border`.
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: Data/Structure/Indexes/DDL đọc tốt 2 theme.

### Task 11: DataGrid restyle + density
**Files:** Modify `src/features/object-view/DataGridShell.tsx`
**Mirror:** giữ logic query/hidden-cols/modal; ColumnPicker giữ outside-click pattern.
- [ ] Step 1: `thead` sticky: thêm `shadow-[var(--shadow-sm)]` + nền `bg-surface` đặc (không trong suốt) để cuộn không lẫn. Header text `text-muted font-semibold uppercase tracking-wide text-[11px]`.
- [ ] Step 2: Row: zebra nhẹ `even:bg-[var(--surface)]/40`, hover `hover:bg-hover`, border `border-b border-border/60`. Cell `text-[12px]`. NULL giữ `text-faint italic`.
- [ ] Step 3: Toolbar grid: dùng `Button variant="ghost" size="sm"` cho ColumnPicker trigger; menu popover thêm `shadow-[var(--shadow-lg)] rounded-[var(--radius-md)] anim-pop`.
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: chạy 1 table → header dính rõ, zebra/hover mượt, ẩn/hiện cột OK ở 2 theme.

### Task 12: SQL Console restyle + CodeMirror theme theo light/dark
**Files:** Modify `src/features/sql-console/SqlConsoleShell.tsx`
**Mirror:** giữ logic editor/run/AI/saved-queries; chỉ đổi theme editor + style toolbar/result.
- [ ] Step 1: Thay `oneDark` cứng bằng theme phụ thuộc resolved theme — **dùng lại** `useResolvedTheme` (Task 2), không tự derive `isDark` lại. Khi dark → `oneDark`; khi light → CodeMirror default sáng.
```tsx
import { useResolvedTheme } from "../../shared/ui/useTheme";
// trong component:
const isDark = useResolvedTheme() === "dark";
// CodeMirror props: theme={isDark ? "dark" : "light"}; extensions chỉ push oneDark khi isDark
```
- [ ] Step 2: Restyle toolbar Run/AI/Saved bằng `Button`/`IconButton` mới; vùng result restyle giống DataGrid (Task 11) nếu render bảng.
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: gõ SQL ở light → editor nền sáng, ở dark → oneDark; Run + AI generate vẫn chạy.

### PHASE 5 — Command palette + dialogs polish

### Task 13: Command Palette ⌘K
**Files:** Create `src/features/command-palette/{CommandPalette.tsx,useCommandPalette.ts}`; Modify `src/app/AppShell.tsx`, `src/app/Toolbar.tsx`
**Mirror:** overlay theo `CellDetailModal.tsx`; outside-click/escape theo ColumnPicker. **Mới:** fuzzy nav — không có sẵn.
- [ ] Step 1: `useCommandPalette.ts` — store mở/đóng + global listener:
```ts
import { useEffect } from "react";
import { create } from "zustand";

interface PaletteState { open: boolean; setOpen: (o: boolean) => void; toggle: () => void; }
export const usePaletteStore = create<PaletteState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));

export function usePaletteHotkey(): void {
  const toggle = usePaletteStore((s) => s.toggle);
  const setOpen = usePaletteStore((s) => s.setOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setOpen]);
}
```
- [ ] Step 2: `CommandPalette.tsx` — overlay `fixed inset-0 bg-[var(--overlay)] anim-fade` + panel giữa `max-w-lg mx-auto mt-[12vh] bg-elevated border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] anim-pop`. Trên cùng `Input` (autofocus). Danh sách items = (a) actions tĩnh: "New Connection", "Open Settings", "Toggle Theme"; (b) connections từ `useConnectionStore().savedConnections`; (c) tables đang load từ explorer state nếu có. Filter bằng `query.toLowerCase()` substring trên label (đủ tốt; không cần lib fuzzy). Enter chạy action item đang chọn; ↑/↓ đổi selection. Chọn table → `useWorkspaceStore().openObject(...)` + đóng.
- [ ] Step 3: `AppShell.tsx` — `usePaletteHotkey()`; render `{paletteOpen && <CommandPalette />}` (đọc `usePaletteStore`). Truyền `onOpenPalette={() => usePaletteStore.getState().setOpen(true)}` cho Toolbar (Task 6 đã có nút).
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: ⌘K mở palette (pop-in), gõ lọc, ↑/↓ + Enter mở table/chạy action, Esc đóng, click ngoài đóng.

### Task 14: Settings / ConnectionDialog / SavedQueries restyle
**Files:** Modify `src/features/settings/SettingsShell.tsx`, `src/features/connection/ConnectionDialogShell.tsx`, `src/features/saved-queries/SavedQueriesPanel.tsx`
**Mirror:** giữ toàn bộ logic form/save/load; thay input/select/button thô bằng atoms `Input`/`Select`/`Button`; overlay theo `CellDetailModal`.
- [ ] Step 1: `SettingsShell.tsx` — thay field thô bằng `Input`/`Select`; thêm mục "Theme" (`Select` light/dark/system bind `useThemeStore`). Panel `rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] anim-pop`.
- [ ] Step 2: `ConnectionDialogShell.tsx` — thay field/button bằng atoms; giữ validation & submit hiện có.
- [ ] Step 3: `SavedQueriesPanel.tsx` — list/hành động dùng `Button`/`IconButton`/token; giữ logic store.
- [ ] Verify: `bun run typecheck` → 0 errors. Dev: lưu được DeepSeek config (regression của session trước vẫn OK); mở/đóng dialog có motion; đọc tốt 2 theme.

### Task 15: Quét & diệt hardcoded color còn sót (consistency pass)
**Files:** Modify bất kỳ file live nào còn hardcode.
**Mirror:** mọi màu phải đi qua token.
- [ ] Step 1: Chạy quét:
```bash
rg -n "text-white|bg-white|bg-black|#[0-9a-fA-F]{3,6}|rgba\(255|rgba\(0," src/app src/features src/shared --glob '!**/*.css'
```
- [ ] Step 2: Với mỗi hit trong live tree → thay bằng token tương ứng (`text-on-accent` cho chữ trên nền accent, `text-fg/muted/faint`, `bg-surface/elevated`…). Bỏ qua hits thuộc `src/components/**`, `src/hooks/**` (dead).
- [ ] Verify: lệnh rg trên (sau sửa) → không còn hit trong `src/app|src/features|src/shared`. `bun run typecheck` → 0 errors. Dev: chuyển light↔dark, rà từng màn (Explorer, Workspace, Grid, SQL Console, Settings, Dialog, Palette, Toast) → không chỗ nào chữ-trùng-nền hay màu kẹt cứng.

---

## Validation
```bash
bun run typecheck      # 0 errors
bun run lint           # eslint src — không lỗi mới do redesign
# Visual smoke (theo luật dev server CLAUDE.md):
kill $(lsof -ti :1420) 2>/dev/null; bun run dev
# Mở http://localhost:1420, kiểm t:
#  - Toggle theme light↔dark↔system: toàn app đổi tức thì, không vỡ màu, reload giữ pref
#  - Explorer connect/expand/select mượt; resizer kéo + double-click reset + persist
#  - Mở table: grid sticky header + zebra/hover; ẩn/hiện cột; cell-detail modal pop-in
#  - SQL Console: editor đổi theme theo light/dark; Run + AI generate chạy
#  - ⌘K palette: lọc, ↑/↓ + Enter, Esc/click-ngoài đóng
#  - Settings: lưu DeepSeek config OK; chọn Theme; ConnectionDialog/SavedQueries render bằng atoms
# (nhớ) không để dev server chạy ngầm giữa các lần test
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| `@theme inline` + runtime var không generate đúng utility (Tailwind v4 quirk) | Medium | Task 1 verify ngay bằng đổi `data-theme` trong devtools trước khi đi tiếp; nếu lỗi, fallback dùng `@custom-variant dark` + `dark:` token (ghi rõ, không tự ý đổi hướng). |
| Light mode lộ chỗ hardcode màu (vd `text-white`, `rgba(255,…)`) | High | Task 15 quét toàn bộ; Task 4/Task 1 xử lý các chỗ đã biết (Tabs, scrollbar, shimmer). |
| CodeMirror không đổi theme runtime mượt | Medium | Task 12 chọn theme theo `isDark` lúc render; chấp nhận remount editor khi đổi theme (hiếm khi xảy ra giữa lúc gõ). |
| Phình file (ExplorerTree, DataGridShell, CommandPalette) | Medium | Tách component khi > 400 dòng (đã ghi trong task); cap 800. |
| Regression chức năng (connect, run query, save config) khi restyle | Medium | Mỗi task "giữ logic, chỉ đổi className"; verify chức năng cũ trong smoke test (đặc biệt save DeepSeek config). |
| Scope creep sang virtualization/perf data grid | Low–Med | **Out of scope** lần này (LIMIT 200 hiện tại đủ mượt). Ghi nhận là follow-up nếu cần render >1k rows. |

## Rule Tension (surfaced per skill)
- `.claude/rules/.../testing.md` yêu cầu test + 80% coverage, nhưng CLAUDE.md ghi "no frontend test runner configured; don't assume one exists". → Plan này **verify bằng `typecheck` + visual smoke**, KHÔNG tự ý dựng Vitest (tránh scope creep). Nếu muốn test, dựng runner là một task riêng ngoài plan này.

## Acceptance ("done" criteria cho /execute)
- [ ] Tất cả 15 task xong, mỗi task verify pass.
- [ ] `bun run typecheck` & `bun run lint` sạch.
- [ ] Toggle Dark↔Light↔System hoạt động toàn app, persist qua reload.
- [ ] Command palette ⌘K điều hướng được.
- [ ] Không còn hardcoded color trong `src/app|src/features|src/shared` (Task 15 rg trống).
- [ ] Patterns được mirror (atoms theo IconButton, store theo layoutStore+persist), không reinvent.
- [ ] KHÔNG đụng `src/components/**`, `src/hooks/**`, `src/stores/{connectionStore,schemaStore,viewStore}.ts`, backend.
- [ ] Chức năng cũ không regress (connect, list tables, run query, AI generate, save config, saved queries).
