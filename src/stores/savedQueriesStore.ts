import { create } from "zustand";

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  created_at: string;
}

interface SavedQueriesStore {
  queries: SavedQuery[];
  setQueries: (q: SavedQuery[]) => void;
  addQuery: (q: SavedQuery) => void;
  removeQuery: (id: string) => void;
  updateQuery: (q: SavedQuery) => void;
}

export const useSavedQueriesStore = create<SavedQueriesStore>((set) => ({
  queries: [],
  setQueries: (queries) => set({ queries }),
  addQuery: (q) => set((s) => ({ queries: [...s.queries, q] })),
  removeQuery: (id) => set((s) => ({ queries: s.queries.filter(q => q.id !== id) })),
  updateQuery: (updated) => set((s) => ({
    queries: s.queries.map(q => q.id === updated.id ? updated : q),
  })),
}));
