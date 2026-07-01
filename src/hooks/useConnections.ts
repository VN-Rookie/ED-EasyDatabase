import { invoke } from "@tauri-apps/api/core";
import type { ConnectionConfig, ConnectionMeta } from "../types";
import { useConnectionStore } from "../stores/connectionStore";

export function useConnections() {
  const store = useConnectionStore();

  const loadSaved = async () => {
    const configs = await invoke<ConnectionConfig[]>("load_saved_connections");
    store.setSavedConnections(configs);
    return configs;
  };

  const save = async (config: ConnectionConfig) => {
    const saved = await invoke<ConnectionConfig>("save_connection", { config });
    store.upsertSavedConnection(saved);
    return saved;
  };

  const deleteSaved = async (id: string) => {
    await invoke("delete_saved_connection", { id });
    store.removeSavedConnection(id);
  };

  const connect = async (config: ConnectionConfig) => {
    const meta = await invoke<ConnectionMeta>("connect", { config });
    store.addActiveConnection(meta);
    store.setActiveConnectionId(meta.id);
    return meta;
  };

  const testConnection = async (config: ConnectionConfig) => {
    return invoke<boolean>("test_connection", { config });
  };

  const disconnect = async (id: string) => {
    await invoke("disconnect", { id });
    store.removeActiveConnection(id);
    if (store.activeConnectionId === id) {
      store.setActiveConnectionId(null);
    }
  };

  return { loadSaved, save, deleteSaved, connect, testConnection, disconnect };
}
