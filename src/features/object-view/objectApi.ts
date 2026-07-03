import { invoke } from "@tauri-apps/api/core";
import type { ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult } from "../../shared/types";

export const describeTable = (connId: string, table: string) =>
  invoke<ColumnInfo[]>("describe_table", { connId, table });

export const listIndexes = (connId: string, table: string) =>
  invoke<IndexInfo[]>("list_indexes", { connId, table });

export const listForeignKeys = (connId: string, table: string) =>
  invoke<ForeignKeyInfo[]>("list_foreign_keys", { connId, table });

export const runQuery = (connId: string, sql: string) =>
  invoke<QueryResult>("run_query", { connId, sql });

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
