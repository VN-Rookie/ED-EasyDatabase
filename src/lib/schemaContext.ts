import { invoke } from "@tauri-apps/api/core";
import type { ColumnInfo } from "../types";

const MAX_TABLES = 50;

/**
 * Build a compact schema context string for AI prompts.
 * Loads column info for up to MAX_TABLES tables in parallel.
 *
 * PRIVACY: Only schema metadata (table/column names + types) — no row data.
 */
export async function buildSchemaContext(
  connId: string,
  tableNames: string[]
): Promise<string> {
  const capped = tableNames.slice(0, MAX_TABLES);
  const overflow = tableNames.length - MAX_TABLES;

  const lines = await Promise.all(
    capped.map(async (table) => {
      try {
        const cols = await invoke<ColumnInfo[]>("describe_table", { connId, table });
        const colParts = cols.map((c) => {
          let s = `${c.name} ${c.data_type}`;
          if (c.is_pk) s += " [PK]";
          else if (!c.nullable) s += " NOT NULL";
          return s;
        });
        return `- ${table} (${colParts.join(", ")})`;
      } catch {
        return `- ${table}`;
      }
    })
  );

  const body = lines.join("\n");
  return overflow > 0 ? `${body}\n... (${overflow} more tables not shown)` : body;
}
