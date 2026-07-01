# Plan: Connection Management Wiring (foundation slice)

**Source:** User request — "Driver + connections: backend Driver trait, connect factory, AppState, typed invoke wrappers + TS boundary types, and real connection management wired to the dialog/explorer. The foundation everything else depends on."
**Complexity:** Medium

## ⚠️ Key finding from codebase grounding (read first)
The **backend foundation already exists and is fully wired** — this plan does **not** rebuild it:
- `src-tauri/src/drivers/mod.rs:13` — `Driver` trait (ping, list_databases, list_tables, describe_table, list_indexes, run_query, set_database).
- `src-tauri/src/drivers/mod.rs:38` — `connect(config) -> Arc<dyn Driver>` factory (the only engine `match`).
- `src-tauri/src/state.rs:14` — `AppState { connections: Arc<Mutex<HashMap<String, ConnectionHandle>>> }` with the lock-then-clone `driver()` accessor.
- `src-tauri/src/commands/connection.rs` — `save_connection`, `load_saved_connections`, `delete_saved_connection`, `connect`, `test_connection`, `disconnect`, `list_connections`, `switch_mongo_db` (persist to `connections.json`).
- `src-tauri/src/lib.rs:18-26` — all eight commands registered in `invoke_handler`.

**Therefore this slice is purely FRONTEND wiring**: give the new shell typed boundary types, a typed `invoke()` wrapper, a connection store, a working connection dialog, and an explorer that lists real saved/active connections. **No Rust changes.**

## Scope boundary
- **In scope:** TS boundary types (`shared/`), `connectionApi.ts` (typed invoke wrappers), a feature-owned connection store, real `ConnectionDialogShell` (test/save/connect, engine-aware fields), `ExplorerTree` sourcing real saved/active connections with connect/disconnect.
- **Out of scope (later slices):** schema navigation (tables/schemas under a connection — the explorer shows a "schema browsing — next milestone" placeholder under a connected connection), the data grid, SQL execution, editing connections, `StatusBar` real data (stays driven by the workspace, which has no openable objects yet), AI/MCP.
- **No Rust edits.** Old `src/components/*`, `src/hooks/*`, `src/stores/connectionStore.ts`, `src/types.ts` stay on disk as reference and are not imported by the new shell.

## Patterns to Mirror
| Category | Source (`file:line`) | Pattern to follow |
|---|---|---|
| Boundary types | `src/types.ts:1-44` (old, reference) + `src-tauri/src/model.rs:32-51` | `DbType` union + `ConnectionConfig`/`ConnectionMeta` interfaces + `DEFAULT_PORTS`; field names are snake_case to match Rust serde |
| invoke wrappers | `src/hooks/useConnections.ts:1-45` (old, reference) | `invoke<T>("command_name", { argObject })`; arg keys match Rust command params (`config`, `id`) |
| Connection store | `src/stores/connectionStore.ts:1-53` (old, reference) | `create<State>((set) => ({...}))`; immutable updates with spread; saved vs active lists + `activeConnectionId` |
| Dialog form logic | `src/components/ConnectionForm.tsx:20-58` | `form: ConnectionConfig` state via `useState`, `patch()` partial updater, `crypto.randomUUID()` for new id, `DEFAULT_PORTS` on engine switch, test-state machine `idle\|testing\|ok\|fail`, save→connect on submit |
| Feature store placement | `src/stores/workspaceStore.ts` (shell), CLAUDE.md "a feature owns its Zustand slice" | layout/workspace stores are cross-cutting → `src/stores/`; connection store is feature-owned → `src/features/connection/` |
| Tokens / no raw hex | `src/App.css` `@theme` + `src/features/connection/ConnectionDialogShell.tsx` (current) | use `bg-surface`, `text-muted`, `border-border`, `text-accent`, `text-ok`, `text-danger` |
| No browser dialogs | CLAUDE.md "Conventions" | errors render inline in the dialog/tree — never `alert/confirm/prompt` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `src/shared/types.ts` | CREATE | Canonical TS boundary types for the new shell, mirroring `model.rs` (single source of truth for the Rust↔TS boundary) |
| `src/features/connection/connectionApi.ts` | CREATE | The one place raw `invoke` strings for the connection feature live (CLAUDE.md rule) |
| `src/features/connection/connectionStore.ts` | CREATE | Feature-owned Zustand slice: saved + active connections, active id |
| `src/features/connection/ConnectionDialogShell.tsx` | MODIFY | Replace mock fields/disabled button with real engine-aware form + Test + Save & Connect |
| `src/features/explorer/ExplorerTree.tsx` | MODIFY | Source connections from the store (load saved on mount), connect on click, disconnect affordance, placeholder under connected connections |

> `src/features/explorer/mockTree.ts` stays on disk (reference); it is no longer imported after Task 5. Leaving an unused module is fine (`tsc` only flags unused *imports*, not unused files).

---

## Tasks

### Task 1: Boundary types
**Files:** Create `src/shared/types.ts`
**Mirror:** `src/types.ts:1-44` (old) + `src-tauri/src/model.rs:32-51`. Reuse is impossible directly because the new shell must not import from the old `src/` tree (CLAUDE.md: old code is reference-only); this is the new canonical home.
- [ ] Step 1: Create the file:
```ts
export type DbType = "postgres" | "mysql" | "mongodb";

export interface ConnectionConfig {
  id: string;
  name: string;
  db_type: DbType;
  // postgres / mysql
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  // mongodb — used instead of the host/port fields above
  connection_string: string;
}

export interface ConnectionMeta {
  id: string;
  name: string;
  db_type: DbType;
}

export const DEFAULT_PORTS: Record<DbType, number> = {
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
};
```
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 2: Typed invoke wrappers
**Files:** Create `src/features/connection/connectionApi.ts`
**Mirror:** `src/hooks/useConnections.ts:1-45` (old) — same command names and arg shapes, but as plain async functions (no store coupling; callers update the store).
- [ ] Step 1: Create the file:
```ts
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionConfig, ConnectionMeta } from "../../shared/types";

export const loadSavedConnections = () =>
  invoke<ConnectionConfig[]>("load_saved_connections");

export const saveConnection = (config: ConnectionConfig) =>
  invoke<ConnectionConfig>("save_connection", { config });

export const deleteSavedConnection = (id: string) =>
  invoke<void>("delete_saved_connection", { id });

export const connectConnection = (config: ConnectionConfig) =>
  invoke<ConnectionMeta>("connect", { config });

export const testConnection = (config: ConnectionConfig) =>
  invoke<boolean>("test_connection", { config });

export const disconnectConnection = (id: string) =>
  invoke<void>("disconnect", { id });

export const listConnections = () =>
  invoke<ConnectionMeta[]>("list_connections");
```
- [ ] Verify: `bun run typecheck` → exit 0 (confirms `@tauri-apps/api/core` resolves — it is already a dependency, used by `src/hooks/useConnections.ts` and `src/lib/schemaContext.ts`).

### Task 3: Feature connection store
**Files:** Create `src/features/connection/connectionStore.ts`
**Mirror:** `src/stores/connectionStore.ts:1-53` (old) — reproduce verbatim except the import path points at the new `shared/types`.
- [ ] Step 1: Create the file:
```ts
import { create } from "zustand";
import type { ConnectionConfig, ConnectionMeta } from "../../shared/types";

interface ConnectionStore {
  savedConnections: ConnectionConfig[];
  activeConnections: ConnectionMeta[];
  activeConnectionId: string | null;

  setSavedConnections: (configs: ConnectionConfig[]) => void;
  upsertSavedConnection: (config: ConnectionConfig) => void;
  removeSavedConnection: (id: string) => void;

  addActiveConnection: (meta: ConnectionMeta) => void;
  removeActiveConnection: (id: string) => void;
  setActiveConnectionId: (id: string | null) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  savedConnections: [],
  activeConnections: [],
  activeConnectionId: null,

  setSavedConnections: (configs) => set({ savedConnections: configs }),

  upsertSavedConnection: (config) =>
    set((s) => {
      const exists = s.savedConnections.some((c) => c.id === config.id);
      return {
        savedConnections: exists
          ? s.savedConnections.map((c) => (c.id === config.id ? config : c))
          : [...s.savedConnections, config],
      };
    }),

  removeSavedConnection: (id) =>
    set((s) => ({
      savedConnections: s.savedConnections.filter((c) => c.id !== id),
    })),

  addActiveConnection: (meta) =>
    set((s) => ({
      activeConnections: s.activeConnections.some((c) => c.id === meta.id)
        ? s.activeConnections
        : [...s.activeConnections, meta],
    })),

  removeActiveConnection: (id) =>
    set((s) => ({
      activeConnections: s.activeConnections.filter((c) => c.id !== id),
    })),

  setActiveConnectionId: (id) => set({ activeConnectionId: id }),
}));
```
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 4: Real connection dialog
**Files:** Modify `src/features/connection/ConnectionDialogShell.tsx` (full rewrite of the file body)
**Mirror:** form logic from `src/components/ConnectionForm.tsx:20-58`; keep the current dialog's token-styled modal markup (overlay `fixed inset-0 bg-black/50`, card, header with `X`, `labelCls`/`inputCls`). Engine picker stays 3-way; fields become engine-aware (mongo → `connection_string`; relational → host/port/database/username/password). Test + Save & Connect call `connectionApi` and update `connectionStore`. Errors render inline (no browser dialogs).
- [ ] Step 1: Replace the file with:
```tsx
import { useState } from "react";
import { X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { ConnectionConfig, DbType } from "../../shared/types";
import { DEFAULT_PORTS } from "../../shared/types";
import { saveConnection, connectConnection, testConnection } from "./connectionApi";
import { useConnectionStore } from "./connectionStore";

interface ConnectionDialogShellProps {
  onClose: () => void;
}

interface EngineOption { id: DbType; label: string; }
const ENGINES: EngineOption[] = [
  { id: "postgres", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "mongodb", label: "MongoDB" },
];

type TestState = "idle" | "testing" | "ok" | "fail";

const labelCls = "block text-[11px] font-medium text-muted mb-1.5";
const inputCls = "w-full bg-bg border border-border focus:border-accent rounded-xl px-3 py-2 text-xs text-fg outline-none transition-colors";

function makeNew(): ConnectionConfig {
  return {
    id: crypto.randomUUID(), name: "", db_type: "postgres",
    host: "localhost", port: DEFAULT_PORTS.postgres,
    database: "", username: "", password: "",
    connection_string: "mongodb://localhost:27017",
  };
}

export function ConnectionDialogShell({ onClose }: ConnectionDialogShellProps) {
  const { upsertSavedConnection, addActiveConnection, setActiveConnectionId } = useConnectionStore();
  const [form, setForm] = useState<ConnectionConfig>(makeNew());
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patch = (f: Partial<ConnectionConfig>) => setForm((p) => ({ ...p, ...f }));
  const isMongo = form.db_type === "mongodb";

  const handleEngine = (db_type: DbType) => {
    patch(db_type === "mongodb" ? { db_type } : { db_type, port: DEFAULT_PORTS[db_type] });
    setTestState("idle");
  };

  const handleTest = async () => {
    setTestState("testing"); setTestError("");
    try { await testConnection(form); setTestState("ok"); }
    catch (e) { setTestState("fail"); setTestError(String(e)); }
  };

  const handleSubmit = async () => {
    setError(""); setSaving(true);
    try {
      const saved = await saveConnection(form);
      upsertSavedConnection(saved);
      const meta = await connectConnection(saved);
      addActiveConnection(meta);
      setActiveConnectionId(meta.id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-2xl w-[500px] shadow-2xl shadow-black/60 overflow-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-[15px] text-fg">New Connection</h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-hover transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className={labelCls}>Database Type</label>
            <div className="grid grid-cols-3 gap-2">
              {ENGINES.map((e) => (
                <button key={e.id} type="button" onClick={() => handleEngine(e.id)}
                  className={`py-3 rounded-xl border-2 text-xs font-medium transition-all ${
                    form.db_type === e.id
                      ? "border-accent text-fg bg-accent/10"
                      : "border-border text-muted hover:text-fg hover:bg-hover"
                  }`}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Name</label>
            <input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="My connection" className={inputCls} />
          </div>

          {isMongo ? (
            <div>
              <label className={labelCls}>Connection String</label>
              <input value={form.connection_string} onChange={(e) => patch({ connection_string: e.target.value })} className={inputCls} />
              <p className="mt-1.5 text-[11px] text-muted">Supports replica sets, TLS, SRV, and auth options</p>
              <label className={`${labelCls} mt-3`}>Database</label>
              <input value={form.database} onChange={(e) => patch({ database: e.target.value })} placeholder="test" className={inputCls} />
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Host</label>
                  <input value={form.host} onChange={(e) => patch({ host: e.target.value })} className={inputCls} />
                </div>
                <div className="w-24">
                  <label className={labelCls}>Port</label>
                  <input type="number" value={form.port} onChange={(e) => patch({ port: Number(e.target.value) })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Database</label>
                <input value={form.database} onChange={(e) => patch({ database: e.target.value })} className={inputCls} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Username</label>
                  <input value={form.username} onChange={(e) => patch({ username: e.target.value })} className={inputCls} />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Password</label>
                  <input type="password" value={form.password} onChange={(e) => patch({ password: e.target.value })} className={inputCls} />
                </div>
              </div>
            </>
          )}

          {testState === "ok" && (
            <div className="flex items-center gap-2 text-xs text-ok bg-ok/10 border border-ok/20 rounded-xl px-3 py-2">
              <CheckCircle2 size={13} className="shrink-0" /> Connected successfully
            </div>
          )}
          {testState === "fail" && (
            <div className="flex items-start gap-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">
              <XCircle size={13} className="mt-0.5 shrink-0" /><span className="break-words">{testError}</span>
            </div>
          )}
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 break-words">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button type="button" onClick={handleTest} disabled={testState === "testing"}
            className="flex items-center gap-1.5 text-xs text-fg bg-elevated hover:bg-hover border border-border rounded-xl px-4 py-2 transition-all disabled:opacity-50">
            {testState === "testing" ? <Loader2 size={12} className="animate-spin" /> : null}
            Test Connection
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="text-xs text-fg bg-elevated hover:bg-hover border border-border rounded-xl px-4 py-2 transition-all">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="flex items-center gap-1.5 text-xs text-white bg-accent hover:bg-accent-strong border border-accent/30 rounded-xl px-4 py-2 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              Save & Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```
- [ ] Verify: `bun run typecheck` → exit 0.

### Task 5: Explorer sources real connections
**Files:** Modify `src/features/explorer/ExplorerTree.tsx` (full rewrite of the file body)
**Mirror:** current `ExplorerTree.tsx` markup/density (header label, `hover:bg-hover`, chevron + icon rows); load-on-mount via `useEffect` calling `connectionApi.loadSavedConnections`; connect/disconnect via `connectionApi` + `connectionStore`. Schema under a connected connection is deferred → render a single muted placeholder row.
- [ ] Step 1: Replace the file with:
```tsx
import { useEffect, useState } from "react";
import { Database, Plug, PlugZap, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { useConnectionStore } from "../connection/connectionStore";
import { loadSavedConnections, connectConnection, disconnectConnection } from "../connection/connectionApi";

export function ExplorerTree() {
  const {
    savedConnections, activeConnections, setSavedConnections,
    addActiveConnection, removeActiveConnection, setActiveConnectionId,
  } = useConnectionStore();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [connectError, setConnectError] = useState("");

  useEffect(() => {
    loadSavedConnections()
      .then(setSavedConnections)
      .catch((e) => setLoadError(String(e)));
  }, [setSavedConnections]);

  const isActive = (id: string) => activeConnections.some((c) => c.id === id);

  const handleConnect = async (id: string) => {
    const config = savedConnections.find((c) => c.id === id);
    if (!config) return;
    setBusyId(id); setConnectError("");
    try {
      const meta = await connectConnection(config);
      addActiveConnection(meta);
      setActiveConnectionId(meta.id);
      setOpen((prev) => new Set(prev).add(id));
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    setBusyId(id);
    try {
      await disconnectConnection(id);
      removeActiveConnection(id);
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggle = (id: string) => setOpen((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="flex-1 overflow-y-auto py-2">
      <div className="px-3 pb-1.5"><span className="text-[9px] font-bold tracking-[0.12em] text-muted uppercase">Explorer</span></div>

      {loadError && <div className="px-3 py-2 text-[11px] text-danger">{loadError}</div>}
      {connectError && <div className="px-3 py-2 text-[11px] text-danger break-words">{connectError}</div>}
      {!loadError && savedConnections.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-muted">No connections yet — use “New Connection”.</div>
      )}

      {savedConnections.map((conn) => {
        const active = isActive(conn.id);
        const isOpen = open.has(conn.id);
        const busy = busyId === conn.id;
        return (
          <div key={conn.id}>
            <div className="group w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-fg hover:bg-hover">
              <button onClick={() => (active ? toggle(conn.id) : handleConnect(conn.id))} className="flex items-center gap-1.5 flex-1 min-w-0">
                {active
                  ? (isOpen ? <ChevronDown size={12} className="text-muted" /> : <ChevronRight size={12} className="text-muted" />)
                  : <span className="w-3" />}
                <Database size={13} className={active ? "text-accent" : "text-muted"} />
                <span className="truncate">{conn.name}</span>
                <span className="text-[9px] uppercase text-faint tracking-wide">{conn.db_type}</span>
              </button>
              {busy
                ? <Loader2 size={12} className="text-muted animate-spin" />
                : active
                  ? <button onClick={() => handleDisconnect(conn.id)} title="Disconnect" aria-label={`Disconnect ${conn.name}`} className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-opacity"><PlugZap size={12} /></button>
                  : <button onClick={() => handleConnect(conn.id)} title="Connect" aria-label={`Connect ${conn.name}`} className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent transition-opacity"><Plug size={12} /></button>}
            </div>
            {active && isOpen && (
              <div className="pl-9 pr-2 py-1.5 text-[11px] text-faint italic">Schema browsing — next milestone</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```
- [ ] Step 2: Confirm `MOCK_TREE`/`mockTree` is no longer imported anywhere in the new shell: `rg -n "mockTree|MOCK_TREE" src/app src/features src/shared` → only the (now-unused) `src/features/explorer/mockTree.ts` definition itself, no importers.
- [ ] Verify: `bun run typecheck` → exit 0.

---

## Validation
```bash
bun run typecheck            # tsc --noEmit → exit 0
bun run build                # tsc && vite build → exits 0, bundles
# Visual — MUST use the full Tauri app (invoke() needs the Tauri runtime; plain `bun run dev` in a
# browser cannot call invoke). Kill any stale Vite first per the Dev Server Rule:
kill $(lsof -ti :1420) 2>/dev/null; bun run tauri dev
```
**Manual acceptance walkthrough (`bun run tauri dev`):**
1. App loads → explorer shows "No connections yet" (or previously-saved connections from `connections.json`).
2. Toolbar **＋** opens the dialog → switch engine to MySQL/MongoDB and confirm fields change (mongo shows Connection String; relational shows host/port/user/pass) and port prefills.
3. **Test Connection** with no/invalid DB → inline red error (proves the invoke round-trips to the backend). With a real local DB → green "Connected successfully".
4. **Save & Connect**: with a reachable DB → dialog closes, the connection appears in the explorer marked connected (chevron + accent icon) and expands to the "Schema browsing — next milestone" placeholder. With an unreachable DB → connection is still saved (appears as a disconnected row) and an inline error shows.
5. Hover a connected connection → **disconnect** icon; click → it returns to disconnected. Hover a disconnected one → **connect** icon.

> Full success in steps 3–4 needs the Rust toolchain and a reachable database; without a DB the error/disconnected states still validate that the wiring is correct end-to-end.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Reviewer expects backend work | High | Backend already exists (see top finding); plan is explicit that it's frontend-only. No Rust files touched. |
| `invoke()` throws in plain `bun run dev` (browser) | High (if mis-verified) | Validation mandates `bun run tauri dev` for the visual pass; `typecheck`/`build` are the static gates that don't need Tauri. |
| `noUnusedLocals` trips on a leftover `MOCK_TREE` import after Task 5 | Medium | Task 5 fully rewrites `ExplorerTree.tsx` (no mockTree import) and Step 2 greps to confirm no importers remain. |
| `Array.at()` / ES2022 APIs fail (lib is ES2020) | Low | No `.at()` used; `new Set(prev).add(id)` and `.find/.some/.filter` are ES2020-safe. |
| Two connection stores (old `src/stores/connectionStore.ts` + new feature store) confuse | Low | New shell imports only the feature store; old one is untouched reference. Distinct paths, no collision. |
| Scope creep into schema/table loading | Medium | Hard boundary: connected connection shows a placeholder, not tables. Schema nav is the next slice. |

## Acceptance ("done" criteria for /execute)
- [ ] All 5 tasks complete
- [ ] `bun run typecheck` and `bun run build` exit 0
- [ ] Manual walkthrough passes under `bun run tauri dev`
- [ ] No Rust/`src-tauri` changes; no edits to old `src/components`, `src/hooks`, `src/stores`, `src/types.ts`
- [ ] No raw `invoke` strings outside `connectionApi.ts`; no `window.alert/confirm/prompt`
- [ ] No change beyond the listed scope (schema/grid/SQL/editing untouched)
