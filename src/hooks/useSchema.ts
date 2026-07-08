import { invoke } from "@tauri-apps/api/core";
import type { TableInfo, ColumnInfo, QueryResult } from "../shared/types";
import { useSchemaStore } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import { useConnectionStore } from "../stores/connectionStore";
import { listSchemas, listIndexes, listForeignKeys } from "../features/explorer/schemaApi";

export const PAGE_SIZE = 50;

export function useSchema() {
  const loadDatabases = async (connId: string) => {
    const schemaStore = useSchemaStore.getState();
    schemaStore.setLoading(true);
    schemaStore.setError(null);
    try {
      const dbs = await invoke<string[]>("list_databases", { connId });
      schemaStore.setDatabases(dbs);
      schemaStore.setSelectedDatabase(null);
    } catch (e) {
      const errorMsg = String(e);
      console.error("Failed to list databases:", e);
      schemaStore.setDatabases([]);
      schemaStore.setError(errorMsg);
    } finally {
      schemaStore.setLoading(false);
    }
  };

  const loadSchemas = async (connId: string) => {
    const schemaStore = useSchemaStore.getState();
    schemaStore.setLoading(true);
    schemaStore.setError(null);
    try {
      const schemas = await listSchemas(connId);
      schemaStore.setSchemas(schemas);
    } catch (e) {
      const errorMsg = String(e);
      console.error("Failed to list schemas:", e);
      schemaStore.setSchemas([]);
      schemaStore.setError(errorMsg);
    } finally {
      schemaStore.setLoading(false);
    }
  };

  const selectSchema = async (schemaName: string) => {
    useSchemaStore.getState().setSelectedSchema(schemaName);
  };

  const selectDatabase = async (dbName: string, connId: string) => {
    await invoke("switch_mongo_db", { connId, dbName });
    useSchemaStore.getState().setSelectedDatabase(dbName);
    await loadTables(connId);
  };

  const loadTables = async (connId: string) => {
    const schemaStore = useSchemaStore.getState();
    schemaStore.setLoading(true);
    schemaStore.setError(null);
    try {
      const tables = await invoke<TableInfo[]>("list_tables", { connId });
      schemaStore.setTables(tables);
      const names = tables.map(t => t.name);
      const meta = useConnectionStore.getState().activeConnections.find(c => c.id === connId);
      loadAllColumnsBackground(connId, names);
      // Skip SQL COUNT(*) for MongoDB — not supported
      if (meta?.db_type !== "mongodb") {
        loadTableCountsBackground(connId, names);
      }
    } catch (e) {
      const errorMsg = String(e);
      console.error("Failed to list tables:", e);
      schemaStore.setTables([]);
      schemaStore.setError(errorMsg);
    } finally {
      schemaStore.setLoading(false);
    }
  };

  const loadTableCountsBackground = async (connId: string, tableNames: string[]) => {
    const capped = tableNames.slice(0, 20);
    for (let i = 0; i < capped.length; i += 5) {
      const batch = capped.slice(i, i + 5);
      await Promise.allSettled(batch.map(async (table) => {
        try {
          const result = await invoke<QueryResult>("run_query", {
            connId,
            sql: `SELECT COUNT(*) AS c FROM "${table}"`,
          });
          const count = Number(result.rows[0]?.c ?? result.rows[0]?.C ?? 0);
          useSchemaStore.getState().setTableCount(table, count);
        } catch { /* ignore */ }
      }));
    }
  };

  const loadAllColumnsBackground = async (connId: string, tableNames: string[]) => {
    const capped = tableNames.slice(0, 30);
    const results = await Promise.allSettled(
      capped.map(async (table) => {
        const cols = await invoke<ColumnInfo[]>("describe_table", { connId, table });
        return { table, cols };
      })
    );
    const tableColumns: Record<string, string[]> = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        tableColumns[r.value.table] = r.value.cols.map(c => c.name);
      }
    }
    useSchemaStore.getState().setTableColumns(tableColumns);
  };

  const loadTableData = async (
    table: string,
    page: number,
    sortCol: string | null,
    sortDir: "asc" | "desc",
    filters?: import("../stores/viewStore").FilterCondition[]
  ) => {
    const connId = useConnectionStore.getState().activeConnectionId;
    if (!connId) return;

    const vs = useViewStore.getState();
    vs.setTableLoading(true);
    vs.setTableError(null);

    const meta = useConnectionStore.getState().activeConnections.find(c => c.id === connId);
    const isMongo = meta?.db_type === "mongodb";
    const pageSize = vs.pageSize ?? PAGE_SIZE;

    try {
      if (isMongo) {
        // Native MongoDB — use query_collection with MQL filter and advanced options
        const limitVal = vs.mongoLimit > 0 ? vs.mongoLimit : pageSize;
        const skipVal = vs.mongoSkip > 0 ? vs.mongoSkip : page * limitVal;
        const result = await invoke<QueryResult>("query_collection", {
          connId,
          collection: table,
          filterJson: vs.mongoFilter.trim() || "{}",
          projectJson: vs.mongoProject.trim() || null,
          sortJson: vs.mongoSort.trim() || null,
          sortField: sortCol ?? null,
          sortAsc: sortDir === "asc",
          limit: limitVal,
          skip: skipVal,
        });
        vs.setTableResult(result);

        const total = await invoke<number>("count_documents", {
          connId,
          collection: table,
          filterJson: vs.mongoFilter.trim() || "{}",
        });
        vs.setTableTotalCount(total);
      } else {
        // SQL path — Postgres / MySQL
        const activeFilters = (filters ?? vs.tableFilters).filter(f => f.column);
        const whereClause = activeFilters.length
          ? " WHERE " + activeFilters.map(f => {
              const col = `"${f.column.replace(/"/g, '""')}"`;
              if (f.operator === "IS NULL")     return `${col} IS NULL`;
              if (f.operator === "IS NOT NULL") return `${col} IS NOT NULL`;
              if (f.operator === "LIKE" || f.operator === "ILIKE") {
                const esc = f.value.replace(/'/g, "''");
                return `${col} ${f.operator} '${esc}'`;
              }
              const val = isNaN(Number(f.value)) || f.value.trim() === ""
                ? `'${f.value.replace(/'/g, "''")}'`
                : f.value;
              return `${col} ${f.operator} ${val}`;
            }).join(" AND ")
          : "";
        const orderClause = sortCol ? ` ORDER BY "${sortCol}" ${sortDir.toUpperCase()}` : "";
        const sql = `SELECT * FROM "${table}"${whereClause}${orderClause} LIMIT ${pageSize} OFFSET ${page * pageSize}`;
        const result = await invoke<QueryResult>("run_query", { connId, sql });
        vs.setTableResult(result);

        const countSql = `SELECT COUNT(*) AS c FROM "${table}"${whereClause}`;
        const countResult = await invoke<QueryResult>("run_query", { connId, sql: countSql });
        const total = Number(countResult.rows[0]?.c ?? countResult.rows[0]?.C ?? 0);
        vs.setTableTotalCount(total);
      }
    } catch (e) {
      vs.setTableError(String(e));
      vs.setTableResult(null);
      vs.setTableTotalCount(null);
    } finally {
      vs.setTableLoading(false);
    }
  };

  const selectTable = async (name: string) => {
    const schemaStore = useSchemaStore.getState();
    const vs = useViewStore.getState();
    schemaStore.setSelectedTable(name);
    vs.setPage(0);
    vs.setSortCol(null);
    vs.setSortDir("asc");
    vs.setActiveView("table");
    await loadTableData(name, 0, null, "asc");
  };

  const loadColumns = async (table: string) => {
    const connId = useConnectionStore.getState().activeConnectionId;
    if (!connId) return;
    const schemaStore = useSchemaStore.getState();
    // Check cache first
    if (schemaStore.tableColumns[table]) {
      const cached = schemaStore.tableColumns[table];
      const columns: ColumnInfo[] = cached.map(name => ({ name, data_type: "unknown", nullable: true, is_pk: false }));
      schemaStore.setColumns(columns);
      return;
    }
    schemaStore.setColumnsLoading(true);
    schemaStore.setError(null);
    try {
      const columns = await invoke<ColumnInfo[]>("describe_table", { connId, table });
      schemaStore.setColumns(columns);
      // Cache in tableColumns
      schemaStore.setTableColumns({ ...schemaStore.tableColumns, [table]: columns.map(c => c.name) });
    } catch (e) {
      const errorMsg = String(e);
      console.error("Failed to describe table:", e);
      schemaStore.setColumns([]);
      schemaStore.setError(errorMsg);
    } finally {
      schemaStore.setColumnsLoading(false);
    }
  };

  const loadIndexes = async (table: string) => {
    const connId = useConnectionStore.getState().activeConnectionId;
    if (!connId) return;
    const schemaStore = useSchemaStore.getState();
    // Check cache first
    if (schemaStore.tableIndexes[table]) {
      schemaStore.setIndexes(schemaStore.tableIndexes[table]);
      return;
    }
    schemaStore.setIndexesLoading(true);
    schemaStore.setError(null);
    try {
      const indexes = await listIndexes(connId, table);
      schemaStore.setIndexes(indexes);
      // Cache in tableIndexes
      schemaStore.setTableIndexes({ ...schemaStore.tableIndexes, [table]: indexes });
    } catch (e) {
      const errorMsg = String(e);
      console.error("Failed to list indexes:", e);
      schemaStore.setIndexes([]);
      schemaStore.setError(errorMsg);
    } finally {
      schemaStore.setIndexesLoading(false);
    }
  };

  const loadForeignKeys = async (table: string) => {
    const connId = useConnectionStore.getState().activeConnectionId;
    if (!connId) return;
    const schemaStore = useSchemaStore.getState();
    // Check cache first
    if (schemaStore.tableForeignKeys[table]) {
      schemaStore.setForeignKeys(schemaStore.tableForeignKeys[table]);
      return;
    }
    schemaStore.setForeignKeysLoading(true);
    schemaStore.setError(null);
    try {
      const foreignKeys = await listForeignKeys(connId, table);
      schemaStore.setForeignKeys(foreignKeys);
      // Cache in tableForeignKeys
      schemaStore.setTableForeignKeys({ ...schemaStore.tableForeignKeys, [table]: foreignKeys });
    } catch (e) {
      const errorMsg = String(e);
      console.error("Failed to list foreign keys:", e);
      schemaStore.setForeignKeys([]);
      schemaStore.setError(errorMsg);
    } finally {
      schemaStore.setForeignKeysLoading(false);
    }
  };

  return {
    loadDatabases,
    loadSchemas,
    selectSchema,
    selectDatabase,
    loadTables,
    loadTableData,
    selectTable,
    loadColumns,
    loadIndexes,
    loadForeignKeys,
  };
}
