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
