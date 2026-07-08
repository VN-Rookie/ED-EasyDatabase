import { create } from "zustand";
import type { DbType } from "../shared/types";

export type ObjectSubView = "data" | "structure" | "indexes" | "ddl";

export interface OpenObject {
  id: string;          // unique key, e.g. "conn1:users"
  connId: string;      // active connection id (= conn_id for schema/query commands)
  table: string;       // raw table/collection name for backend calls
  label: string;       // display name
  engine: DbType;
  database?: string;   // database scope
  type?: "table" | "er-diagram" | "sql-console";
}

interface WorkspaceState {
  openObjects: OpenObject[];
  activeObjectId: string | null;
  subView: ObjectSubView;
  pendingFilters: Map<string, string>; // objectId -> filter string
  dataViewModes: Map<string, "table" | "tree" | "text">; // objectId -> view mode
  openObject: (obj: OpenObject) => void;
  closeObject: (id: string) => void;
  setActiveObject: (id: string) => void;
  setSubView: (v: ObjectSubView) => void;
  setPendingFilter: (objectId: string, filter: string) => void;
  getPendingFilter: (objectId: string) => string | undefined;
  clearPendingFilter: (objectId: string) => void;
  setDataViewMode: (objectId: string, mode: "table" | "tree" | "text") => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  openObjects: [],
  activeObjectId: null,
  subView: "data",
  pendingFilters: new Map(),
  dataViewModes: new Map(),
  openObject: (obj) => {
    const exists = get().openObjects.some((o) => o.id === obj.id);
    set({
      openObjects: exists ? get().openObjects : [...get().openObjects, obj],
      activeObjectId: obj.id,
    });
  },
  closeObject: (id) => {
    const remaining = get().openObjects.filter((o) => o.id !== id);
    const active = get().activeObjectId === id ? (remaining[remaining.length - 1]?.id ?? null) : get().activeObjectId;
    set({ openObjects: remaining, activeObjectId: active });
  },
  setActiveObject: (id) => set({ activeObjectId: id }),
  setSubView: (v) => set({ subView: v }),
  setPendingFilter: (objectId, filter) => {
    set((state) => {
      const next = new Map(state.pendingFilters);
      next.set(objectId, filter);
      return { pendingFilters: next };
    });
  },
  getPendingFilter: (objectId) => {
    return get().pendingFilters.get(objectId);
  },
  clearPendingFilter: (objectId) => {
    set((state) => {
      const next = new Map(state.pendingFilters);
      next.delete(objectId);
      return { pendingFilters: next };
    });
  },
  setDataViewMode: (objectId, mode) => {
    set((state) => {
      const next = new Map(state.dataViewModes);
      next.set(objectId, mode);
      return { dataViewModes: next };
    });
  },
}));
