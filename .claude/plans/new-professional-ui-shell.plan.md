# Plan: New Professional UI Shell (DataGrip-style)

**Source:** User request — "implement new professional ui, easy to use, like DataGrip (99% same function), for MongoDB + MySQL + PostgreSQL. Make a basic step-by-step plan for the UI; each function gets its own plan later."
**Complexity:** Large

## Goal
Build a new, navigable, professional UI **shell** in a feature-based structure: DataGrip-style layout regions (toolbar, resizable database-explorer tree, tabbed workspace, object viewer, SQL console, status bar) rendered as **presentational skeletons with mock data**, on a real design-token system. Success: `bun run dev` shows a polished DataGrip-like app you can click through (expand tree, open object tabs, switch Data/Structure/Indexes/DDL sub-tabs, see the SQL console) — **with no backend wiring**. Each region's real behavior is a separate follow-up plan.

## Scope boundary (read before executing)
- **In scope:** layout, navigation, design tokens, shared UI primitives, presentational components fed by mock data, layout/workspace state in Zustand, swapping `App.tsx` to render the new shell.
- **Out of scope (deferred to per-function plans):** any `invoke()` / Tauri wiring, real query execution, editable grid cells, real connection logic, AI box, MCP. Components expose typed props now; the data that fills them is mocked.
- Old `src/components/*`, `src/hooks/*`, old stores **stay on disk as reference** (CLAUDE.md: old code is reference-only). Nothing old is deleted in this plan. The only old file modified is `src/App.tsx` (Task 12) and `src/App.css` (Task 1).

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Component naming | `src/components/MainPanel.tsx`, `src/components/ConnectionList.tsx` | PascalCase `.tsx` files, one component per file, named export `export function X()` |
| State store | `src/stores/viewStore.ts:1`, `src/stores/connectionStore.ts:1` | `create<State>((set, get) => ({...}))` Zustand stores under `src/stores/` |
| Dark palette | `src/App.tsx:52`, `MainPanel.tsx:236` | Existing GitHub-dark hex set — promoted to tokens in Task 1, then referenced as utilities |
| Tab bar | `src/components/MainPanel.tsx:238-251` | Active tab = `border-b-2 border-blue-500 text-white`; inactive = muted + hover |
| Empty state | `src/components/MainPanel.tsx:161-173` | Icon in rounded bordered box + title + subtitle, centered |
| Icons | throughout (`lucide-react`) | `import { X } from "lucide-react"`, `size={n}` |
| No browser dialogs | CLAUDE.md "Conventions"; smell at `MainPanel.tsx:385` (`window.prompt`) | Use in-app inputs/inline editors — never `alert`/`confirm`/`prompt` |
| Props typing | `.claude` TS rules + `src/components/DataGrid.tsx` props | Named `interface XProps`, explicit callback types, no `React.FC`, no `any` |

> **No test pattern exists** — `package.json` has no `test` script and no runner is installed. UI-shell verification is `typecheck` + `lint` + visual check via the dev server. Adding a test runner is out of scope here.

## Target file structure (all CREATE unless noted)
```
src/
  app/
    AppShell.tsx            # layout root: Toolbar + Split(Explorer | Workspace) + StatusBar
    Toolbar.tsx             # top bar: run/refresh/new-connection icon buttons (presentational)
    StatusBar.tsx           # bottom bar: engine, connection, selected object, row count
  shared/ui/
    IconButton.tsx          # square icon button with tooltip + active/disabled states
    ResizableSplit.tsx      # 2-pane horizontal split with draggable divider (persists width)
    Tabs.tsx                # generic underline tab bar (mirrors MainPanel tab styling)
    EmptyState.tsx          # icon-box + title + subtitle (mirrors MainPanel empty state)
  features/
    explorer/
      ExplorerTree.tsx      # DataGrip-style tree: connection > db > schema > tables/views/indexes
      mockTree.ts           # mock tree data for the 3 engines
    workspace/
      Workspace.tsx         # open-object tab strip + active object area + welcome empty state
    object-view/
      ObjectView.tsx        # sub-tabs: Data | Structure | Indexes | DDL
      DataGridShell.tsx     # presentational grid skeleton (sticky header, type badges, mock rows)
      StructureShell.tsx    # column list table (mirrors MainPanel structure tab markup)
      IndexesShell.tsx      # index list table (presentational)
      DdlShell.tsx          # read-only CREATE statement view (mock)
      mockData.ts           # mock columns/rows/indexes/ddl per object
    sql-console/
      SqlConsoleShell.tsx   # CodeMirror editor + result-grid placeholder + run bar
    connection/
      ConnectionDialogShell.tsx  # modal form skeleton (engine picker, fields) — no real connect
  stores/
    layoutStore.ts          # explorer width, sidebar collapsed
    workspaceStore.ts       # open object tabs, active tab, active object sub-view
src/App.css                 # MODIFY: add @theme design tokens (Task 1)
src/App.tsx                 # MODIFY (Task 12): render <AppShell/> instead of old layout
```

---

## Tasks

### Task 1: Design tokens (fix hardcoded-hex smell)
**Files:** Modify `src/App.css`
**Mirror:** existing palette at `src/App.tsx:52` / `MainPanel.tsx:236` — promote those exact hex values to Tailwind v4 `@theme` tokens so components use semantic utilities (`bg-surface`, `text-muted`) instead of raw hex.
- [ ] Step 1: After the `@import "tailwindcss";` line in `src/App.css`, add the token block:
```css
@theme {
  --color-bg:            #0d1117;
  --color-surface:       #161b22;
  --color-elevated:      #21262d;
  --color-hover:         #292e36;
  --color-border:        #30363d;
  --color-border-strong: #484f58;
  --color-fg:            #e6edf3;
  --color-muted:         #7d8590;
  --color-faint:         #484f58;
  --color-accent:        #3b82f6;
  --color-accent-strong: #2563eb;
  --color-ok:            #10b981;
  --color-warn:          #f59e0b;
  --color-danger:        #ef4444;
}
```
- [ ] Step 2: Keep the existing shimmer/toast/scrollbar CSS below it unchanged.
- [ ] Verify: `bun run typecheck` → exit 0 (CSS change doesn't break TS; confirms nothing else broke). Tokens become available as `bg-bg`, `bg-surface`, `text-fg`, `text-muted`, `border-border`, `text-accent`, etc.

### Task 2: Shared UI primitives
**Files:** Create `src/shared/ui/IconButton.tsx`, `src/shared/ui/EmptyState.tsx`, `src/shared/ui/Tabs.tsx`, `src/shared/ui/ResizableSplit.tsx`
**Mirror:** tab styling from `MainPanel.tsx:238-251`; empty-state markup from `MainPanel.tsx:161-173`; icon usage from existing components.
- [ ] Step 1: `IconButton.tsx`:
```tsx
import type { ElementType } from "react";

interface IconButtonProps {
  icon: ElementType;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}

export function IconButton({ icon: Icon, label, onClick, active, disabled, size = 14 }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "text-accent bg-accent/10 border border-accent/20" : "text-muted hover:text-fg hover:bg-hover"
      }`}
    >
      <Icon size={size} />
    </button>
  );
}
```
- [ ] Step 2: `EmptyState.tsx`:
```tsx
import type { ElementType } from "react";

interface EmptyStateProps {
  icon: ElementType;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center flex-col gap-3">
      <div className="w-14 h-14 rounded-2xl bg-elevated border border-border flex items-center justify-center">
        <Icon size={24} className="text-muted" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-fg text-sm font-medium">{title}</p>
        {subtitle && <p className="text-muted text-xs">{subtitle}</p>}
      </div>
    </div>
  );
}
```
- [ ] Step 3: `Tabs.tsx` (generic underline tab bar):
```tsx
import type { ElementType } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: ElementType;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function Tabs({ tabs, activeId, onSelect }: TabsProps) {
  return (
    <div className="flex -mb-px">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium transition-all border-b-2 ${
            activeId === id
              ? "border-accent text-white"
              : "border-transparent text-muted hover:text-fg hover:bg-hover"
          }`}
        >
          {Icon && <Icon size={11} className={activeId === id ? "text-accent" : ""} />}
          {label}
        </button>
      ))}
    </div>
  );
}
```
- [ ] Step 4: `ResizableSplit.tsx` (left pane fixed-width + draggable divider + right pane fills; width controlled by props):
```tsx
import { useCallback, useRef, type ReactNode } from "react";

interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  leftWidth: number;
  onLeftWidthChange: (width: number) => void;
  min?: number;
  max?: number;
}

export function ResizableSplit({ left, right, leftWidth, onLeftWidthChange, min = 200, max = 520 }: ResizableSplitProps) {
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => { dragging.current = true; }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const w = Math.min(max, Math.max(min, e.clientX));
    onLeftWidthChange(w);
  }, [min, max, onLeftWidthChange]);
  const stop = useCallback(() => { dragging.current = false; }, []);

  return (
    <div className="flex flex-1 overflow-hidden" onMouseMove={onMouseMove} onMouseUp={stop} onMouseLeave={stop}>
      <div style={{ width: leftWidth }} className="flex-shrink-0 flex flex-col border-r border-border bg-surface overflow-hidden">
        {left}
      </div>
      <div onMouseDown={onMouseDown} className="w-1 cursor-col-resize bg-transparent hover:bg-accent/40 transition-colors" />
      <div className="flex-1 flex flex-col overflow-hidden bg-bg">{right}</div>
    </div>
  );
}
```
- [ ] Verify: `bun run typecheck` → exit 0; `bun run lint` → no errors in `src/shared`.

### Task 3: Layout + workspace state stores
**Files:** Create `src/stores/layoutStore.ts`, `src/stores/workspaceStore.ts`
**Mirror:** `src/stores/viewStore.ts:1` Zustand `create((set, get) => ({...}))` style.
- [ ] Step 1: `layoutStore.ts`:
```ts
import { create } from "zustand";

interface LayoutState {
  explorerWidth: number;
  setExplorerWidth: (w: number) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  explorerWidth: 280,
  setExplorerWidth: (w) => set({ explorerWidth: w }),
}));
```
- [ ] Step 2: `workspaceStore.ts` (open object tabs + active sub-view). `ObjectSubView` mirrors the engine-aware tab set already in `MainPanel.tsx:192-205`:
```ts
import { create } from "zustand";

export type ObjectSubView = "data" | "structure" | "indexes" | "ddl";

export interface OpenObject {
  id: string;          // unique key, e.g. "conn1:public.users"
  label: string;       // display name, e.g. "users"
  engine: "postgres" | "mysql" | "mongodb";
}

interface WorkspaceState {
  openObjects: OpenObject[];
  activeObjectId: string | null;
  subView: ObjectSubView;
  openObject: (obj: OpenObject) => void;
  closeObject: (id: string) => void;
  setActiveObject: (id: string) => void;
  setSubView: (v: ObjectSubView) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  openObjects: [],
  activeObjectId: null,
  subView: "data",
  openObject: (obj) => {
    const exists = get().openObjects.some((o) => o.id === obj.id);
    set({
      openObjects: exists ? get().openObjects : [...get().openObjects, obj],
      activeObjectId: obj.id,
    });
  },
  closeObject: (id) => {
    const remaining = get().openObjects.filter((o) => o.id !== id);
    const active = get().activeObjectId === id ? (remaining.at(-1)?.id ?? null) : get().activeObjectId;
    set({ openObjects: remaining, activeObjectId: active });
  },
  setActiveObject: (id) => set({ activeObjectId: id }),
  setSubView: (v) => set({ subView: v }),
}));
```
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 4: App shell layout
**Files:** Create `src/app/AppShell.tsx`, `src/app/Toolbar.tsx`, `src/app/StatusBar.tsx`
**Mirror:** outer flex/`h-screen` container from `src/App.tsx:52`; uses `ResizableSplit` (Task 2) and `useLayoutStore` (Task 3).
- [ ] Step 1: `Toolbar.tsx` (presentational top bar):
```tsx
import { DatabaseZap, Play, RefreshCw, Plus, Settings } from "lucide-react";
import { IconButton } from "../shared/ui/IconButton";

interface ToolbarProps {
  onNewConnection?: () => void;
  onOpenSettings?: () => void;
}

export function Toolbar({ onNewConnection, onOpenSettings }: ToolbarProps) {
  return (
    <header className="h-11 flex-shrink-0 flex items-center gap-2 px-3 border-b border-border bg-surface">
      <div className="flex items-center gap-2 pr-2">
        <DatabaseZap size={16} className="text-accent" />
        <span className="font-bold text-sm text-fg tracking-tight">tool-sql</span>
      </div>
      <div className="w-px h-5 bg-border" />
      <IconButton icon={Play} label="Run (⌘↵)" />
      <IconButton icon={RefreshCw} label="Refresh" />
      <div className="ml-auto flex items-center gap-1">
        <IconButton icon={Plus} label="New Connection" onClick={onNewConnection} />
        <IconButton icon={Settings} label="Settings (⌘,)" onClick={onOpenSettings} />
      </div>
    </header>
  );
}
```
- [ ] Step 2: `StatusBar.tsx` (presentational bottom bar, props-driven):
```tsx
interface StatusBarProps {
  engine?: string;
  connection?: string;
  object?: string;
  rowCount?: number;
}

export function StatusBar({ engine, connection, object, rowCount }: StatusBarProps) {
  return (
    <footer className="h-6 flex-shrink-0 flex items-center gap-3 px-3 border-t border-border bg-surface text-[11px] text-muted">
      {connection && <span>{connection}</span>}
      {engine && <span className="text-faint">·</span>}
      {engine && <span className="uppercase tracking-wide">{engine}</span>}
      {object && <><span className="text-faint">·</span><span className="font-mono">{object}</span></>}
      {typeof rowCount === "number" && <span className="ml-auto tabular-nums">{rowCount} rows</span>}
    </footer>
  );
}
```
- [ ] Step 3: `AppShell.tsx` (composes everything; mock connection meta for the status bar for now):
```tsx
import { useState } from "react";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { ResizableSplit } from "../shared/ui/ResizableSplit";
import { ExplorerTree } from "../features/explorer/ExplorerTree";
import { Workspace } from "../features/workspace/Workspace";
import { ConnectionDialogShell } from "../features/connection/ConnectionDialogShell";
import { useLayoutStore } from "../stores/layoutStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

export function AppShell() {
  const { explorerWidth, setExplorerWidth } = useLayoutStore();
  const active = useWorkspaceStore((s) => s.openObjects.find((o) => o.id === s.activeObjectId));
  const [showConnDialog, setShowConnDialog] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-bg text-fg select-none overflow-hidden">
      <Toolbar onNewConnection={() => setShowConnDialog(true)} />
      <ResizableSplit
        leftWidth={explorerWidth}
        onLeftWidthChange={setExplorerWidth}
        left={<ExplorerTree />}
        right={<Workspace />}
      />
      <StatusBar engine={active?.engine} connection={active ? "mock-connection" : undefined} object={active?.label} rowCount={active ? 42 : undefined} />
      {showConnDialog && <ConnectionDialogShell onClose={() => setShowConnDialog(false)} />}
    </div>
  );
}
```
- [ ] Verify: `bun run typecheck` → exit 0 (imports of Tasks 5–7 + 11 components must exist; do those tasks before re-running, or stub-create empty exports first). Recommended order: create Tasks 5, 6, 11 component files before re-running typecheck.

### Task 5: Database Explorer tree (DataGrip-style)
**Files:** Create `src/features/explorer/ExplorerTree.tsx`, `src/features/explorer/mockTree.ts`
**Mirror:** old tree behavior in `src/components/SchemaTree.tsx` (expand/collapse, engine-aware levels) — but presentational with mock data and clicking a table calls `useWorkspaceStore.openObject`.
- [ ] Step 1: `mockTree.ts` — define a typed mock for all 3 engines (Postgres: db→schema→tables; MySQL: db→tables; MongoDB: db→collections):
```ts
import type { OpenObject } from "../../stores/workspaceStore";

export interface TreeLeaf { id: string; label: string; engine: OpenObject["engine"]; kind: "table" | "view" | "collection"; }
export interface TreeGroup { label: string; leaves: TreeLeaf[]; }
export interface TreeConnection { id: string; label: string; engine: OpenObject["engine"]; groups: TreeGroup[]; }

export const MOCK_TREE: TreeConnection[] = [
  { id: "pg", label: "local-postgres", engine: "postgres", groups: [
    { label: "public", leaves: [
      { id: "pg:public.users", label: "users", engine: "postgres", kind: "table" },
      { id: "pg:public.orders", label: "orders", engine: "postgres", kind: "table" },
      { id: "pg:public.active_users", label: "active_users", engine: "postgres", kind: "view" },
    ]},
  ]},
  { id: "my", label: "local-mysql", engine: "mysql", groups: [
    { label: "shop", leaves: [
      { id: "my:shop.products", label: "products", engine: "mysql", kind: "table" },
      { id: "my:shop.carts", label: "carts", engine: "mysql", kind: "table" },
    ]},
  ]},
  { id: "mg", label: "atlas-mongo", engine: "mongodb", groups: [
    { label: "analytics", leaves: [
      { id: "mg:analytics.events", label: "events", engine: "mongodb", kind: "collection" },
      { id: "mg:analytics.sessions", label: "sessions", engine: "mongodb", kind: "collection" },
    ]},
  ]},
];
```
- [ ] Step 2: `ExplorerTree.tsx` — render connections → groups → leaves with chevron expand/collapse (local `useState<Set<string>>`), engine icon, and `onClick` → `openObject`. Use lucide `Database`, `Folder`, `Table2`, `FileText`, `ChevronRight`/`ChevronDown`, `Eye` (view). Active leaf highlights when `activeObjectId` matches. Header row "EXPLORER" label mirrors the sidebar section label at `App.tsx:76-77`.
```tsx
import { useState } from "react";
import { Database, Folder, Table2, FileText, Eye, ChevronRight, ChevronDown } from "lucide-react";
import { MOCK_TREE, type TreeLeaf } from "./mockTree";
import { useWorkspaceStore } from "../../stores/workspaceStore";

const engineIcon = { postgres: Database, mysql: Database, mongodb: Database } as const;
function leafIcon(kind: TreeLeaf["kind"]) { return kind === "view" ? Eye : kind === "collection" ? FileText : Table2; }

export function ExplorerTree() {
  const [open, setOpen] = useState<Set<string>>(new Set(["pg", "pg:public"]));
  const { openObject, activeObjectId } = useWorkspaceStore();
  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="flex-1 overflow-y-auto py-2">
      <div className="px-3 pb-1.5"><span className="text-[9px] font-bold tracking-[0.12em] text-muted uppercase">Explorer</span></div>
      {MOCK_TREE.map((conn) => {
        const ConnIcon = engineIcon[conn.engine];
        const connOpen = open.has(conn.id);
        return (
          <div key={conn.id}>
            <button onClick={() => toggle(conn.id)} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-fg hover:bg-hover">
              {connOpen ? <ChevronDown size={12} className="text-muted" /> : <ChevronRight size={12} className="text-muted" />}
              <ConnIcon size={13} className="text-accent" /><span className="truncate">{conn.label}</span>
            </button>
            {connOpen && conn.groups.map((g) => {
              const gid = `${conn.id}:${g.label}`;
              const gOpen = open.has(gid);
              return (
                <div key={gid}>
                  <button onClick={() => toggle(gid)} className="w-full flex items-center gap-1.5 pl-6 pr-2 py-1.5 text-xs text-muted hover:bg-hover">
                    {gOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Folder size={12} /><span className="truncate">{g.label}</span>
                  </button>
                  {gOpen && g.leaves.map((leaf) => {
                    const LeafIcon = leafIcon(leaf.kind);
                    return (
                      <button key={leaf.id}
                        onClick={() => openObject({ id: leaf.id, label: leaf.label, engine: leaf.engine })}
                        className={`w-full flex items-center gap-1.5 pl-11 pr-2 py-1.5 text-xs truncate hover:bg-hover ${activeObjectId === leaf.id ? "text-white bg-accent/10" : "text-muted"}`}>
                        <LeafIcon size={12} /><span className="truncate">{leaf.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```
- [ ] Verify: `bun run typecheck` → exit 0; `bun run lint` → clean for `src/features/explorer`.

### Task 6: Workspace (open-object tab strip + routing to ObjectView / SQL console)
**Files:** Create `src/features/workspace/Workspace.tsx`
**Mirror:** open-tab strip + close button from `MainPanel.tsx:374-400` (but use in-app rename later, never `window.prompt`); welcome empty state from `MainPanel.tsx:161-173` via `EmptyState`.
- [ ] Step 1: `Workspace.tsx` — render a tab strip from `useWorkspaceStore.openObjects` with close (`✕`) buttons, a welcome `EmptyState` when none are open, and the active object's `ObjectView` below. Include a persistent "SQL Console" pseudo-tab that renders `SqlConsoleShell`.
```tsx
import { Table2, Terminal, X } from "lucide-react";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ObjectView } from "../object-view/ObjectView";
import { SqlConsoleShell } from "../sql-console/SqlConsoleShell";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useState } from "react";

export function Workspace() {
  const { openObjects, activeObjectId, setActiveObject, closeObject } = useWorkspaceStore();
  const [consoleOpen, setConsoleOpen] = useState(false);
  const active = openObjects.find((o) => o.id === activeObjectId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center border-b border-border bg-surface px-2 shrink-0 overflow-x-auto">
        {openObjects.map((o) => (
          <div key={o.id} className={`group flex items-center shrink-0 border-b-2 -mb-px ${o.id === activeObjectId && !consoleOpen ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}>
            <button onClick={() => { setActiveObject(o.id); setConsoleOpen(false); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap"><Table2 size={11} />{o.label}</button>
            <button onClick={() => closeObject(o.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-fg pr-1.5 transition-opacity"><X size={11} /></button>
          </div>
        ))}
        <button onClick={() => setConsoleOpen(true)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium shrink-0 border-b-2 -mb-px ${consoleOpen ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}><Terminal size={11} />SQL Console</button>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {consoleOpen ? <SqlConsoleShell />
          : active ? <ObjectView object={active} />
          : <EmptyState icon={Table2} title="No object open" subtitle="Pick a table or collection from the Explorer to begin" />}
      </div>
    </div>
  );
}
```
- [ ] Verify: `bun run typecheck` → exit 0 (requires Tasks 7 + 9 files to exist).

### Task 7: Object viewer + Data grid skeleton
**Files:** Create `src/features/object-view/ObjectView.tsx`, `DataGridShell.tsx`, `StructureShell.tsx`, `IndexesShell.tsx`, `DdlShell.tsx`, `mockData.ts`
**Mirror:** sub-tab set from `MainPanel.tsx:192-205` (engine-aware: MongoDB shows Document-ish via Data; relational shows Data/Structure/Indexes/DDL); Structure table markup from `MainPanel.tsx:449-484`; grid header/cell density from `DataGrid.tsx`. **Functional editing/sorting/pagination is OUT OF SCOPE** — render mock rows only.
- [ ] Step 1: `mockData.ts` — export mock `columns`, `rows`, `indexes`, `ddl` for a generic object:
```ts
export interface MockColumn { name: string; type: string; nullable: boolean; pk: boolean; }
export const MOCK_COLUMNS: MockColumn[] = [
  { name: "id", type: "int8", nullable: false, pk: true },
  { name: "email", type: "text", nullable: false, pk: false },
  { name: "created_at", type: "timestamptz", nullable: true, pk: false },
];
export const MOCK_ROWS: Record<string, unknown>[] = [
  { id: 1, email: "ada@example.com", created_at: "2024-01-01T10:00:00Z" },
  { id: 2, email: "alan@example.com", created_at: "2024-02-15T09:30:00Z" },
  { id: 3, email: null, created_at: null },
];
export const MOCK_INDEXES = [
  { name: "users_pkey", columns: "id", type: "btree", unique: true },
  { name: "users_email_idx", columns: "email", type: "btree", unique: true },
];
export const MOCK_DDL = `CREATE TABLE public.users (\n  id        bigint PRIMARY KEY,\n  email     text NOT NULL,\n  created_at timestamptz\n);`;
```
- [ ] Step 2: `DataGridShell.tsx` — sticky header with column name + type badge, mock rows, NULL rendered as muted italic `NULL`. Presentational only.
```tsx
import { MOCK_COLUMNS, MOCK_ROWS } from "./mockData";

export function DataGridShell() {
  return (
    <div className="flex-1 overflow-auto">
      <table className="text-left border-collapse w-full">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border">
            {MOCK_COLUMNS.map((c) => (
              <th key={c.name} className="px-3 py-2 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  {c.pk && <span title="Primary key" className="text-warn text-[10px]">🔑</span>}
                  <span className="text-xs font-semibold text-fg">{c.name}</span>
                  <span className="text-[10px] font-mono text-accent/80">{c.type}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_ROWS.map((row, i) => (
            <tr key={i} className="border-b border-elevated hover:bg-hover">
              {MOCK_COLUMNS.map((c) => (
                <td key={c.name} className="px-3 py-1.5 text-xs font-mono text-fg/90 whitespace-nowrap">
                  {row[c.name] === null ? <span className="text-faint italic">NULL</span> : String(row[c.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```
- [ ] Step 3: `StructureShell.tsx` — port the column table markup from `MainPanel.tsx:449-484` to use `MOCK_COLUMNS` + token classes (`text-fg`, `border-border`, etc.).
- [ ] Step 4: `IndexesShell.tsx` — simple table over `MOCK_INDEXES` (Name / Columns / Type / Unique), token-styled.
- [ ] Step 5: `DdlShell.tsx` — `<pre>` showing `MOCK_DDL` in monospace, read-only, with a Copy `IconButton`.
- [ ] Step 6: `ObjectView.tsx` — header breadcrumb badge (mirrors `MainPanel.tsx:255-262`) + `Tabs` (Data/Structure/Indexes/DDL) bound to `useWorkspaceStore.subView`, rendering the matching shell. MongoDB engine relabels "Data" → "Documents" and hides "DDL".
```tsx
import { Table2, ListTree, Hash, FileCode } from "lucide-react";
import { Tabs, type TabItem } from "../../shared/ui/Tabs";
import { DataGridShell } from "./DataGridShell";
import { StructureShell } from "./StructureShell";
import { IndexesShell } from "./IndexesShell";
import { DdlShell } from "./DdlShell";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { OpenObject } from "../../stores/workspaceStore";

export function ObjectView({ object }: { object: OpenObject }) {
  const { subView, setSubView } = useWorkspaceStore();
  const isMongo = object.engine === "mongodb";
  const tabs: TabItem[] = [
    { id: "data", label: isMongo ? "Documents" : "Data", icon: Table2 },
    { id: "structure", label: "Structure", icon: ListTree },
    { id: "indexes", label: "Indexes", icon: Hash },
    ...(isMongo ? [] : [{ id: "ddl", label: "DDL", icon: FileCode }]),
  ];
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center border-b border-border px-3 bg-surface">
        <Tabs tabs={tabs} activeId={subView} onSelect={(v) => setSubView(v as never)} />
        <span className="ml-auto text-[11px] font-mono text-muted bg-elevated border border-border rounded-lg px-2 py-0.5">{object.label}</span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {subView === "data" && <DataGridShell />}
        {subView === "structure" && <StructureShell />}
        {subView === "indexes" && <IndexesShell />}
        {subView === "ddl" && !isMongo && <DdlShell />}
      </div>
    </div>
  );
}
```
- [ ] Verify: `bun run typecheck` → exit 0; `bun run lint` → clean for `src/features/object-view`.

### Task 8: (folded into Task 7) — Structure / Indexes / DDL shells
Covered by Task 7 Steps 3–5. No separate task.

### Task 9: SQL console shell
**Files:** Create `src/features/sql-console/SqlConsoleShell.tsx`
**Mirror:** CodeMirror usage from `src/components/SqlEditor.tsx` (`@uiw/react-codemirror`, `@codemirror/lang-sql`, `@codemirror/theme-one-dark`); run bar from `MainPanel.tsx` query area. **No execution** — Run button is presentational; result area is an `EmptyState`.
- [ ] Step 1: `SqlConsoleShell.tsx`:
```tsx
import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { Play, TableProperties } from "lucide-react";
import { IconButton } from "../../shared/ui/IconButton";
import { EmptyState } from "../../shared/ui/EmptyState";

export function SqlConsoleShell() {
  const [value, setValue] = useState("SELECT * FROM users LIMIT 50;");
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface">
        <IconButton icon={Play} label="Run (⌘↵)" />
        <span className="text-[11px] text-muted">SQL Console — execution wired in a later plan</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeMirror value={value} onChange={setValue} theme={oneDark} extensions={[sql()]} height="100%" />
      </div>
      <div className="h-48 border-t border-border flex flex-col">
        <EmptyState icon={TableProperties} title="No results yet" subtitle="Run a query to see results here" />
      </div>
    </div>
  );
}
```
- [ ] Verify: `bun run typecheck` → exit 0; `bun run dev` then visually confirm the editor renders (kill port first per Dev Server Rule).

### Task 10: (folded into Task 4) — Status bar
Covered by Task 4 Step 2. No separate task.

### Task 11: Connection dialog shell
**Files:** Create `src/features/connection/ConnectionDialogShell.tsx`
**Mirror:** modal overlay + field layout from `src/components/ConnectionForm.tsx`. Engine picker for the 3 supported engines. **No real connect/test** — buttons are presentational, dialog only opens/closes.
- [ ] Step 1: `ConnectionDialogShell.tsx` — centered modal overlay (`fixed inset-0 bg-black/50`), card with: name input, engine select (PostgreSQL / MySQL / MongoDB), host, port, database, user, password fields (token-styled), and "Cancel" / "Save (later)" buttons. `onClose` prop closes it. No `invoke`.
- [ ] Verify: `bun run typecheck` → exit 0; clicking the Toolbar "New Connection" (after Task 12) opens/closes the dialog.

### Task 12: Swap App.tsx to render the new shell
**Files:** Modify `src/App.tsx`
**Mirror:** keep `ToastProvider` wrapper from current `App.tsx:51` and `import "./App.css"`.
- [ ] Step 1: Replace the body of `App.tsx` so it renders the new shell, preserving the toast provider and css import. Old components are no longer imported by `App.tsx` but remain on disk as reference:
```tsx
import { ToastProvider } from "./components/Toast";
import { AppShell } from "./app/AppShell";
import "./App.css";

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
```
- [ ] Step 2: Confirm no remaining import in `src/app`, `src/features`, `src/shared` points at the old `src/components/*` (except `Toast`, intentionally reused).
- [ ] Verify: `bun run typecheck` → exit 0; `bun run lint` → exit 0; then per Dev Server Rule: `kill $(lsof -ti :1420) 2>/dev/null; bun run dev` → open the app and confirm: toolbar + explorer tree expands + clicking a table opens an object tab + Data/Structure/Indexes/DDL sub-tabs switch + SQL Console tab shows the editor + status bar shows engine/object + New Connection opens the dialog.

## Validation
```bash
bun run typecheck            # tsc --noEmit → exit 0, no type errors
bun run lint                 # eslint src --ext ts,tsx → exit 0
kill $(lsof -ti :1420) 2>/dev/null; bun run dev   # manual visual pass of the full shell (Dev Server Rule)
```
Manual acceptance walkthrough (no backend needed): expand all three mock connections → open one table from each engine → verify MongoDB shows "Documents" + no "DDL", relational shows "Data/Structure/Indexes/DDL" → switch sub-tabs → open SQL Console → drag the explorer divider to resize → open & close the New Connection dialog.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Tailwind v4 `@theme` tokens not picked up → utilities like `bg-surface` don't apply | Medium | Task 1 verified first; if a utility is missing, confirm `@tailwindcss/vite` is active (it is, per `vite.config.ts`) and that token names map to `--color-*`. Fallback: keep raw hex for that one class. |
| `ResizableSplit` mouse-drag math feels off across the divider | Low | Width derived from `e.clientX` clamped to [min,max]; divider is thin. Refine only if visibly wrong — it's a shell, not final. |
| Two parallel UIs (old components + new shell) cause confusion | Low | Only `App.tsx` swaps; old files are untouched reference per CLAUDE.md. Deleting old code is a separate cleanup once functions are ported. |
| Typecheck fails mid-plan due to forward imports (Task 4 imports Tasks 5–7/11) | Medium | Create component files (even minimal exports) before re-running typecheck; recommended task order is 1→2→3→5→7→9→11→6→4→12. |
| Scope creep into real wiring | Medium | Hard scope boundary stated up top; every component is mock-fed. Any `invoke()` belongs to a later per-function plan. |

## Acceptance ("done" criteria for /execute)
- [ ] All tasks complete (Tasks 8 & 10 are folded, not skipped)
- [ ] `bun run typecheck` and `bun run lint` both exit 0
- [ ] Manual visual walkthrough passes (see Validation)
- [ ] New code lives under `src/app`, `src/shared`, `src/features`, `src/stores`; design tokens in `src/App.css`
- [ ] No `invoke()`, no real DB logic, no `window.alert/confirm/prompt` introduced
- [ ] Old `src/components/*` (except `Toast`) untouched and unreferenced by the new shell
- [ ] No change beyond the listed scope
```
