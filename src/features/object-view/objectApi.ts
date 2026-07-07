import { invoke } from "@tauri-apps/api/core";
import type { ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, BatchEditInput } from "../../shared/types";
import { switchMongoDb } from "../explorer/schemaApi";
import type { OpenObject } from "../../stores/workspaceStore";

/**
 * The Mongo driver has a single "current database". Point it at this
 * object's database before any schema/data call so a tab from another
 * db doesn't read stale context. No-op for SQL engines.
 */
export const ensureMongoDb = async (object: Pick<OpenObject, "connId" | "engine" | "database">) => {
  if ((object.engine === "mongodb" || object.engine === "postgres") && object.database) {
    await switchMongoDb(object.connId, object.database);
  }
};

export const describeTable = (connId: string, table: string) =>
  invoke<ColumnInfo[]>("describe_table", { connId, table });

export const listIndexes = (connId: string, table: string) =>
  invoke<IndexInfo[]>("list_indexes", { connId, table });

export const listForeignKeys = (connId: string, table: string) =>
  invoke<ForeignKeyInfo[]>("list_foreign_keys", { connId, table });

export const runQuery = (connId: string, sql: string) =>
  invoke<QueryResult>("run_query", { connId, sql });

export const countRows = (connId: string, table: string) =>
  invoke<number>("count_rows", { connId, table });

export const applyBatchEdits = (connId: string, input: BatchEditInput) =>
  invoke<QueryResult>("apply_batch_edits", { connId, input });

/**
 * Fetch reference table data for a foreign key.
 * Returns the primary key and first display column for dropdown options.
 */
export const fetchForeignKeyReference = async (
  connId: string,
  table: string
): Promise<{ value: string; label: string }[]> => {
  // First get the table structure to find the primary key
  const columns = await describeTable(connId, table);
  const pkColumn = columns.find((c) => c.is_pk)?.name;

  if (!pkColumn) {
    // Fallback: just get first column
    const data = await runQuery(connId, `SELECT * FROM ${table} LIMIT 100`);
    return data.rows.map((row) => ({
      value: String(row[data.columns[0]] ?? ""),
      label: String(row[data.columns[0]] ?? ""),
    }));
  }

  // Get the PK and try to find a display column (name, title, email, etc.)
  const displayColumn = columns.find(
    (c) => c.is_pk === false && /^(name|title|email|description|label|code)$/i.test(c.name)
  )?.name;

  const selectColumns = displayColumn
    ? `${pkColumn}, ${displayColumn}`
    : pkColumn;

  const data = await runQuery(connId, `SELECT ${selectColumns} FROM ${table} LIMIT 100`);

  return data.rows.map((row) => ({
    value: String(row[pkColumn] ?? ""),
    label: displayColumn
      ? String(row[displayColumn] ?? "")
      : String(row[pkColumn] ?? ""),
  }));
};

export const importCsvData = (connId: string, table: string, filePath: string, mapping: Record<string, string>) =>
  invoke<void>("import_csv_data", { connId, table, filePath, mapping });

export const importJsonData = (connId: string, table: string, filePath: string, mapping: Record<string, string>) =>
  invoke<void>("import_json_data", { connId, table, filePath, mapping });

export const createDatabaseBackup = (connId: string, outputPath: string) =>
  invoke<void>("create_database_backup", { connId, outputPath });

export const restoreDatabaseBackup = (connId: string, filePath: string) =>
  invoke<void>("restore_database_backup", { connId, filePath });
