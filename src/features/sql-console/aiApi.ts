import { invoke } from "@tauri-apps/api/core";

export const generateSql = (prompt: string, schemaContext: string) =>
  invoke<string>("generate_sql", { prompt, schemaContext });
