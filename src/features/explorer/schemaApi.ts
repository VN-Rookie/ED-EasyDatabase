import { invoke } from "@tauri-apps/api/core";
import type { TableInfo, ColumnInfo, ForeignKeyInfo, SchemaInfo, IndexInfo } from "../../shared/types";

export const listDatabases = (connId: string) =>
  invoke<string[]>("list_databases", { connId });

export const switchMongoDb = (connId: string, dbName: string) =>
  invoke<void>("switch_mongo_db", { connId, dbName });

export const listSchemas = (connId: string) =>
  invoke<SchemaInfo[]>("list_schemas", { connId });

export const listTables = (connId: string) =>
  invoke<TableInfo[]>("list_tables", { connId });

export const describeTable = (connId: string, table: string) =>
  invoke<ColumnInfo[]>("describe_table", { connId, table });

export const listIndexes = (connId: string, table: string) =>
  invoke<IndexInfo[]>("list_indexes", { connId, table });

export const listForeignKeys = (connId: string, table: string) =>
  invoke<ForeignKeyInfo[]>("list_foreign_keys", { connId, table });
