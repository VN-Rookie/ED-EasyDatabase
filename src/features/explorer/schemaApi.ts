import { invoke } from "@tauri-apps/api/core";
import type { TableInfo, ColumnInfo } from "../../shared/types";

export const listDatabases = (connId: string) =>
  invoke<string[]>("list_databases", { connId });

export const listTables = (connId: string) =>
  invoke<TableInfo[]>("list_tables", { connId });

export const describeTable = (connId: string, table: string) =>
  invoke<ColumnInfo[]>("describe_table", { connId, table });
