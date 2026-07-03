import { invoke } from "@tauri-apps/api/core";
import type { QueryResult } from "../../shared/types";

interface InsertRowInput {
  table: string;
  values: Record<string, unknown>;
}

interface UpdateRowInput {
  table: string;
  pk_column: string;
  pk_value: unknown;
  values: Record<string, unknown>;
}

interface DeleteRowInput {
  table: string;
  pk_column: string;
  pk_value: unknown;
}

export const insertRow = (connId: string, input: InsertRowInput) =>
  invoke<QueryResult>("insert_row", { connId, input });

export const updateRow = (connId: string, input: UpdateRowInput) =>
  invoke<QueryResult>("update_row", { connId, input });

export const deleteRow = (connId: string, input: DeleteRowInput) =>
  invoke<QueryResult>("delete_row", { connId, input });
