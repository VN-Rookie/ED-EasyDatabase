import { invoke } from "@tauri-apps/api/core";
import type { ColumnInfo, IndexInfo, QueryResult } from "../../shared/types";

export const describeTable = (connId: string, table: string) =>
  invoke<ColumnInfo[]>("describe_table", { connId, table });

export const listIndexes = (connId: string, table: string) =>
  invoke<IndexInfo[]>("list_indexes", { connId, table });

export const runQuery = (connId: string, sql: string) =>
  invoke<QueryResult>("run_query", { connId, sql });
