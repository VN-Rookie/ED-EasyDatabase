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
