import { create } from "zustand";
import type { QueryResult } from "../types";

const HISTORY_KEY = "tool-sql:query-history";
const MAX_HISTORY = 50;

function loadHistory(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveHistory(h: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

// ── Query tab ─────────────────────────────────────────────────────────────────
export interface QueryTab {
  id: string;
  label: string;
  sql: string;
  result: QueryResult | null;
  loading: boolean;
  error: string | null;
}

let tabCounter = 1;
export function newTab(label?: string): QueryTab {
  return { id: crypto.randomUUID(), label: label ?? `Query ${tabCounter++}`, sql: "", result: null, loading: false, error: null };
}

// ── Filter condition (used by table view) ─────────────────────────────────────
export interface FilterCondition {
  id: string;
  column: string;
  operator: string;
  value: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface ViewStore {
  activeView: "table" | "document" | "query" | "structure" | "indexes";

  // Table / Document view
  tableResult: QueryResult | null;
  tableLoading: boolean;
  tableError: string | null;
  page: number;
  pageSize: number;
  sortCol: string | null;
  sortDir: "asc" | "desc";
  tableFilters: FilterCondition[];
  mongoFilter: string;

  // Query editor — multi-tab
  queryTabs: QueryTab[];
  activeTabId: string;
  queryHistory: string[];

  setActiveView: (v: "table" | "document" | "query" | "structure" | "indexes") => void;

  setTableResult:  (r: QueryResult | null) => void;
  setTableLoading: (l: boolean) => void;
  setTableError:   (e: string | null) => void;
  setPage:         (p: number) => void;
  setPageSize:     (n: number) => void;
  setSortCol:      (c: string | null) => void;
  setSortDir:      (d: "asc" | "desc") => void;
  setTableFilters: (f: FilterCondition[]) => void;
  setMongoFilter:  (f: string) => void;

  // Tab management
  addTab:          () => void;
  closeTab:        (id: string) => void;
  setActiveTab:    (id: string) => void;
  renameTab:       (id: string, label: string) => void;

  // Active-tab helpers (used by useQuery + MainPanel)
  setTabSql:     (id: string, sql: string) => void;
  setTabLoading: (id: string, loading: boolean) => void;
  setTabResult:  (id: string, result: QueryResult | null) => void;
  setTabError:   (id: string, error: string | null) => void;

  // Compat shims — operate on the currently active tab
  get sql(): string;
  get queryResult(): QueryResult | null;
  get queryLoading(): boolean;
  get queryError(): string | null;
  setSql:          (s: string) => void;
  setQueryResult:  (r: QueryResult | null) => void;
  setQueryLoading: (l: boolean) => void;
  setQueryError:   (e: string | null) => void;

  pushHistory: (sql: string) => void;
  reset:       () => void;
}

const firstTab = newTab();

function patchTab(tabs: QueryTab[], id: string, patch: Partial<QueryTab>): QueryTab[] {
  return tabs.map(t => t.id === id ? { ...t, ...patch } : t);
}

export const useViewStore = create<ViewStore>((set, get) => ({
  activeView: "table",

  tableResult: null,
  tableLoading: false,
  tableError: null,
  page: 0,
  pageSize: 50,
  sortCol: null,
  sortDir: "asc",
  tableFilters: [],
  mongoFilter: "",

  queryTabs: [firstTab],
  activeTabId: firstTab.id,
  queryHistory: loadHistory(),

  setActiveView: (activeView) => set({ activeView }),

  setTableResult:  (tableResult)  => set({ tableResult }),
  setTableLoading: (tableLoading) => set({ tableLoading }),
  setTableError:   (tableError)   => set({ tableError }),
  setPage:         (page)         => set({ page }),
  setPageSize:     (pageSize)     => set({ pageSize }),
  setSortCol:      (sortCol)      => set({ sortCol }),
  setSortDir:      (sortDir)      => set({ sortDir }),
  setTableFilters: (tableFilters) => set({ tableFilters }),
  setMongoFilter:  (mongoFilter)  => set({ mongoFilter }),

  // ── Tab management ────────────────────────────────────────────────────────
  addTab: () => set(s => {
    const tab = newTab();
    return { queryTabs: [...s.queryTabs, tab], activeTabId: tab.id };
  }),

  closeTab: (id) => set(s => {
    if (s.queryTabs.length <= 1) return {}; // keep at least one tab
    const tabs = s.queryTabs.filter(t => t.id !== id);
    const activeTabId = s.activeTabId === id
      ? tabs[Math.max(0, s.queryTabs.findIndex(t => t.id === id) - 1)].id
      : s.activeTabId;
    return { queryTabs: tabs, activeTabId };
  }),

  setActiveTab:  (activeTabId) => set({ activeTabId }),
  renameTab: (id, label) => set(s => ({ queryTabs: patchTab(s.queryTabs, id, { label }) })),

  setTabSql:     (id, sql)     => set(s => ({ queryTabs: patchTab(s.queryTabs, id, { sql }) })),
  setTabLoading: (id, loading) => set(s => ({ queryTabs: patchTab(s.queryTabs, id, { loading }) })),
  setTabResult:  (id, result)  => set(s => ({ queryTabs: patchTab(s.queryTabs, id, { result }) })),
  setTabError:   (id, error)   => set(s => ({ queryTabs: patchTab(s.queryTabs, id, { error }) })),

  // ── Compat shims ──────────────────────────────────────────────────────────
  get sql()         { return get().queryTabs.find(t => t.id === get().activeTabId)?.sql ?? ""; },
  get queryResult() { return get().queryTabs.find(t => t.id === get().activeTabId)?.result ?? null; },
  get queryLoading(){ return get().queryTabs.find(t => t.id === get().activeTabId)?.loading ?? false; },
  get queryError()  { return get().queryTabs.find(t => t.id === get().activeTabId)?.error ?? null; },

  setSql:          (sql)    => { const id = get().activeTabId; set(s => ({ queryTabs: patchTab(s.queryTabs, id, { sql }) })); },
  setQueryResult:  (result) => { const id = get().activeTabId; set(s => ({ queryTabs: patchTab(s.queryTabs, id, { result }) })); },
  setQueryLoading: (loading)=> { const id = get().activeTabId; set(s => ({ queryTabs: patchTab(s.queryTabs, id, { loading }) })); },
  setQueryError:   (error)  => { const id = get().activeTabId; set(s => ({ queryTabs: patchTab(s.queryTabs, id, { error }) })); },

  pushHistory: (sql) => set(s => {
    if (s.queryHistory[0] === sql) return {};
    const next = [sql, ...s.queryHistory].slice(0, MAX_HISTORY);
    saveHistory(next);
    return { queryHistory: next };
  }),

  reset: () => {
    const tab = newTab("Query 1");
    tabCounter = 2;
    set({ activeView: "table", tableResult: null, tableLoading: false, tableError: null, page: 0, pageSize: 50, sortCol: null, sortDir: "asc", tableFilters: [], mongoFilter: "", queryTabs: [tab], activeTabId: tab.id });
  },
}));
