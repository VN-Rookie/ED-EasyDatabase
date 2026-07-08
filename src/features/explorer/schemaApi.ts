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

export interface TableSchemaInfo {
  table_name: string;
  columns: ColumnInfo[];
}

export const describeSchema = (connId: string) =>
  invoke<TableSchemaInfo[]>("describe_schema", { connId });

export const listIndexes = (connId: string, table: string) =>
  invoke<IndexInfo[]>("list_indexes", { connId, table });

export const listForeignKeys = (connId: string, table: string) =>
  invoke<ForeignKeyInfo[]>("list_foreign_keys", { connId, table });

export interface DependencyInfo {
  object_name: string;
  object_type: string;
  old_definition: string;
  new_definition: string;
}

export interface RefactorPreview {
  dependencies: DependencyInfo[];
  generated_ddl: string;
}

export const getRefactorPreview = (
  connId: string,
  table: string,
  column: string | null,
  newName: string
) => invoke<RefactorPreview>("get_refactor_preview", { connId, table, column, newName });

export const executeRefactor = (connId: string, ddl: string) =>
  invoke<any>("execute_refactor", { connId, ddl });

