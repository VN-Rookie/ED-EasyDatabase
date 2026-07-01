import { create } from "zustand";

export type ObjectSubView = "data" | "structure" | "indexes" | "ddl";

export interface OpenObject {
  id: string;          // unique key, e.g. "conn1:users"
  connId: string;      // active connection id (= conn_id for schema/query commands)
  table: string;       // raw table/collection name for backend calls
  label: string;       // display name
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
    const active = get().activeObjectId === id ? (remaining[remaining.length - 1]?.id ?? null) : get().activeObjectId;
    set({ openObjects: remaining, activeObjectId: active });
  },
  setActiveObject: (id) => set({ activeObjectId: id }),
  setSubView: (v) => set({ subView: v }),
}));
