import { invoke } from "@tauri-apps/api/core";
import type { SavedQuery } from "../stores/savedQueriesStore";
import { useSavedQueriesStore } from "../stores/savedQueriesStore";

export function useSavedQueries() {
  const store = useSavedQueriesStore();

  const load = async () => {
    try {
      const queries = await invoke<SavedQuery[]>("list_saved_queries");
      store.setQueries(queries);
    } catch (e) {
      console.error("Failed to load saved queries:", e);
    }
  };

  const save = async (name: string, sql: string): Promise<SavedQuery> => {
    const q = await invoke<SavedQuery>("create_saved_query", { name, sql });
    store.addQuery(q);
    return q;
  };

  const remove = async (id: string) => {
    await invoke("delete_saved_query", { id });
    store.removeQuery(id);
  };

  const update = async (id: string, name: string, sql: string): Promise<SavedQuery> => {
    const q = await invoke<SavedQuery>("update_saved_query", { id, name, sql });
    store.updateQuery(q);
    return q;
  };

  return { load, save, remove, update, queries: store.queries };
}
