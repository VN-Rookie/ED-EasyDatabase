import { invoke } from "@tauri-apps/api/core";

export const generateSql = (prompt: string, schemaContext: string) =>
  invoke<string>("generate_sql", { prompt, schemaContext });

export const fixSqlError = (sql: string, error: string, schemaContext: string) =>
  invoke<string>("fix_sql_error", { sql, error, schemaContext });

