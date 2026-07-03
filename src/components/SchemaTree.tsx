import { useState, useEffect } from "react";
import {
  Table,
  RefreshCw,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Key,
  Hash,
  List,
  Database,
  Layers,
} from "lucide-react";
import { useSchemaStore } from "../stores/schemaStore";
import { useConnectionStore } from "../stores/connectionStore";
import { useSchema } from "../hooks/useSchema";
import { Spinner } from "../shared/ui/Spinner";
import type { IndexInfo, ForeignKeyInfo } from "../shared/types";

export function SchemaTree() {
  const {
    databases,
    selectedDatabase,
    schemas,
    selectedSchema,
    tables,
    selectedTable,
    loading,
    error,
    tableCounts,
    tableColumns,
    tableIndexes,
    tableForeignKeys,
  } = useSchemaStore();

  // Track expanded table details data separately
  const [tableDetailsData, setTableDetailsData] = useState<Record<string, {
    columns: string[];
    indexes: IndexInfo[];
    foreignKeys: ForeignKeyInfo[];
    loading: boolean;
  }>>({});

  const { activeConnectionId, activeConnections } = useConnectionStore();
  const {
    selectTable,
    loadTables,
    loadDatabases,
    loadSchemas,
    selectSchema,
    selectDatabase,
  } = useSchema();

  const [search, setSearch] = useState("");
  const [expandedTableDetails, setExpandedTableDetails] = useState<Set<string>>(new Set());

  const activeMeta = activeConnections.find((c) => c.id === activeConnectionId);
  const isPostgres = activeMeta?.db_type === "postgres";
  const isMongo = activeMeta?.db_type === "mongodb";
  const showingDatabases = isMongo && selectedDatabase === null;
  const showingSchemas = isPostgres && selectedSchema === null;

  // Load schemas when PostgreSQL connection is active
  useEffect(() => {
    if (activeConnectionId && isPostgres && schemas.length === 0 && !loading) {
      loadSchemas(activeConnectionId);
    }
  }, [activeConnectionId, isPostgres, schemas.length, loading, loadSchemas]);

  // Load databases when MongoDB connection is active
  useEffect(() => {
    if (activeConnectionId && isMongo && databases.length === 0 && !loading) {
      loadDatabases(activeConnectionId);
    }
  }, [activeConnectionId, isMongo, databases.length, loading, loadDatabases]);

  // Load tables when database/schema is selected
  useEffect(() => {
    if (activeConnectionId && !showingDatabases && !showingSchemas && tables.length === 0 && !loading) {
      loadTables(activeConnectionId);
    }
  }, [activeConnectionId, showingDatabases, showingSchemas, tables.length, loading, loadTables]);

  const handleRefresh = () => {
    if (!activeConnectionId) return;
    if (showingDatabases) {
      loadDatabases(activeConnectionId);
    } else if (showingSchemas) {
      loadSchemas(activeConnectionId);
    } else {
      loadTables(activeConnectionId);
    }
  };

  const handleBackToDbs = () => {
    useSchemaStore.getState().setSelectedDatabase(null);
    useSchemaStore.getState().setTables([]);
    useSchemaStore.getState().setSchemas([]);
    useSchemaStore.getState().setSelectedSchema(null);
    setSearch("");
    setExpandedTableDetails(new Set());
  };

  const handleBackToSchemas = () => {
    useSchemaStore.getState().setSelectedSchema(null);
    useSchemaStore.getState().setTables([]);
    setSearch("");
    setExpandedTableDetails(new Set());
  };

  const toggleTableDetails = async (tableKey: string) => {
    const isExpanded = expandedTableDetails.has(tableKey);
    if (isExpanded) {
      setExpandedTableDetails((prev) => {
        const n = new Set(prev);
        n.delete(tableKey);
        return n;
      });
    } else {
      setExpandedTableDetails((prev) => new Set(prev).add(tableKey));
      // Load columns, indexes, foreign keys when expanding
      const tableName = tableKey.split(":")[1];
      if (tableName && !tableDetailsData[tableKey]) {
        setTableDetailsData(prev => ({
          ...prev,
          [tableKey]: { columns: [], indexes: [], foreignKeys: [], loading: true }
        }));
        try {
          const connId = activeConnectionId;
          if (!connId) return;
          const { describeTable, listIndexes, listForeignKeys } = await import("../features/explorer/schemaApi");
          const [colsResult, idxResult, fkResult] = await Promise.allSettled([
            describeTable(connId, tableName),
            listIndexes(connId, tableName),
            listForeignKeys(connId, tableName),
          ]);
          const columns: string[] = colsResult.status === "fulfilled" ? colsResult.value.map(c => c.name) : [];
          const indexes: IndexInfo[] = idxResult.status === "fulfilled" ? idxResult.value : [];
          const foreignKeys: ForeignKeyInfo[] = fkResult.status === "fulfilled" ? fkResult.value : [];
          setTableDetailsData(prev => ({
            ...prev,
            [tableKey]: { columns, indexes, foreignKeys, loading: false }
          }));
        } catch {
          setTableDetailsData(prev => ({
            ...prev,
            [tableKey]: { columns: [], indexes: [], foreignKeys: [], loading: false }
          }));
        }
      }
    }
  };

  const handleSelectTable = (tableName: string) => {
    selectTable(tableName);
  };

  const filteredDbs = databases.filter((n) =>
    n.toLowerCase().includes(search.toLowerCase())
  );
  const filteredSchemas = schemas.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );
  const listCount = showingDatabases
    ? databases.length
    : showingSchemas
    ? schemas.length
    : tables.length;
  const label = showingDatabases
    ? "Databases"
    : showingSchemas
    ? "Schemas"
    : isMongo
    ? "Collections"
    : "Tables";

  return (
    <div className="ml-4 border-l border-[#21262d] mt-0.5">
      {/* Header */}
      <div className="flex items-center justify-between pl-2 pr-1 py-1.5">
        <div className="flex items-center gap-1 min-w-0">
          {(isMongo || isPostgres) && !showingDatabases && !showingSchemas && (
            <button
              onClick={isMongo ? handleBackToDbs : handleBackToSchemas}
              title={isMongo ? "Back to databases" : "Back to schemas"}
              className="p-0.5 rounded text-[#484f58] hover:text-[#7d8590] hover:bg-[#292e36] transition-all shrink-0"
            >
              <ChevronRight size={10} className="rotate-180" />
            </button>
          )}
          <span className="text-[9px] font-bold tracking-[0.10em] text-[#7d8590] uppercase shrink-0">
            {label}
            {listCount > 0 ? ` (${listCount})` : ""}
          </span>
          {isMongo && !showingDatabases && selectedDatabase && (
            <span
              className="text-[9px] text-[#484f58] truncate ml-1"
              title={selectedDatabase}
            >
              · {selectedDatabase}
            </span>
          )}
          {isPostgres && !showingSchemas && selectedSchema && (
            <span
              className="text-[9px] text-[#484f58] truncate ml-1"
              title={selectedSchema}
            >
              · {selectedSchema}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh"
          className="p-0.5 rounded text-[#484f58] hover:text-[#7d8590] hover:bg-[#292e36] disabled:opacity-30 transition-all shrink-0"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Search — always visible when has items */}
      {listCount > 0 && (
        <div className="px-2 pb-1.5">
          <div className="relative">
            <Search
              size={9}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…"
              className="w-full bg-[#0d1117] border border-[#21262d] focus:border-[#30363d] rounded-lg pl-5 pr-5 py-1 text-[10px] text-[#e6edf3] placeholder:text-[#484f58] outline-none transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#7d8590] transition-colors"
              >
                <X size={9} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="px-2 pb-2">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <span className="text-[11px] text-red-400 break-words">
              {error}
            </span>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="pl-1 pb-1 space-y-0.5">
          {[70, 55, 85, 60, 75].map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2 py-1.5"
            >
              <div className="w-2.5 h-2.5 bg-[#21262d] rounded-sm skeleton-shimmer shrink-0" />
              <div
                className="h-2.5 bg-[#21262d] rounded-sm skeleton-shimmer"
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
        </div>
      ) : showingDatabases ? (
        filteredDbs.length === 0 ? (
          <div className="pl-3 py-2">
            <span className="text-[10px] text-[#484f58]">
              {search ? `No match for "${search}"` : "No databases found"}
            </span>
          </div>
        ) : (
          <ul className="pl-1 pb-1 space-y-0.5">
            {filteredDbs.map((dbName) => (
              <li key={dbName}>
                <button
                  onClick={() =>
                    activeConnectionId && selectDatabase(dbName, activeConnectionId)
                  }
                  className="flex items-center gap-1.5 px-1 py-1.5 rounded-lg text-left transition-all text-[#7d8590] hover:bg-[#292e36] hover:text-[#e6edf3] w-full"
                >
                  <Database size={10} className="shrink-0 opacity-60" />
                  <span className="text-[11px] truncate font-mono">
                    {dbName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : showingSchemas ? (
        filteredSchemas.length === 0 ? (
          <div className="pl-3 py-2">
            <span className="text-[10px] text-[#484f58]">
              {search ? `No match for "${search}"` : "No schemas found"}
            </span>
          </div>
        ) : (
          <ul className="pl-1 pb-1 space-y-0.5">
            {filteredSchemas.map((schema) => (
              <li key={schema.name}>
                <button
                  onClick={() => selectSchema(schema.name)}
                  className="flex items-center gap-1.5 px-1 py-1.5 rounded-lg text-left transition-all text-[#7d8590] hover:bg-[#292e36] hover:text-[#e6edf3] w-full"
                >
                  <Layers size={10} className="shrink-0 opacity-60" />
                  <span className="text-[11px] truncate font-mono">
                    {schema.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : filteredTables.length === 0 ? (
        <div className="pl-3 py-2">
          <span className="text-[10px] text-[#484f58]">
            {search
              ? `No match for "${search}"`
              : `No ${label.toLowerCase()} found`}
          </span>
        </div>
      ) : (
        <ul className="pl-1 pb-1 space-y-0.5">
          {filteredTables.map((t) => {
            const isSel = selectedTable === t.name;
            const tableKey = `table:${t.name}`;
            const isDetailsExpanded = expandedTableDetails.has(tableKey);
            const details = tableDetailsData[tableKey];
            const cols = details?.columns || tableColumns[t.name] || [];
            const idxs = details?.indexes || tableIndexes[t.name] || [];
            const fks = details?.foreignKeys || tableForeignKeys[t.name] || [];
            const isLoading = details?.loading ?? false;

            return (
              <li key={t.name}>
                <div className="flex items-center">
                  <button
                    onClick={() => toggleTableDetails(tableKey)}
                    className="p-0.5 text-[#484f58] hover:text-[#7d8590] shrink-0"
                    title="Expand details"
                  >
                    {isDetailsExpanded ? (
                      <ChevronDown size={10} />
                    ) : (
                      <ChevronRight size={10} />
                    )}
                  </button>
                  <button
                    onClick={() => handleSelectTable(t.name)}
                    className={`flex items-center gap-1.5 px-1 py-1.5 rounded-lg text-left transition-all flex-1 ${
                      isSel
                        ? "bg-blue-500/15 text-blue-300"
                        : "text-[#7d8590] hover:bg-[#292e36] hover:text-[#e6edf3]"
                    }`}
                  >
                    <Table size={10} className="shrink-0 opacity-60" />
                    <span
                      className={`text-[11px] truncate font-mono flex-1 ${
                        isSel ? "font-semibold" : ""
                      }`}
                    >
                      {t.name}
                    </span>
                    {tableCounts[t.name] !== undefined && (
                      <span className="text-[9px] text-[#484f58] font-mono shrink-0 tabular-nums">
                        {tableCounts[t.name].toLocaleString()}
                      </span>
                    )}
                  </button>
                </div>

                {/* Expanded table details */}
                {isDetailsExpanded && (
                  <div className="ml-6 pl-2 border-l border-[#21262d] space-y-1 py-1">
                    {/* Columns */}
                    <div className="flex items-center gap-1 px-1">
                      <Hash size={8} className="text-[#484f58] shrink-0" />
                      <span className="text-[9px] text-[#484f58] uppercase tracking-wider">
                        Columns
                      </span>
                      <span className="text-[8px] text-[#484f58]">
                        ({cols.length})
                      </span>
                    </div>
                    {isLoading ? (
                      <div className="pl-4 py-0.5">
                        <Spinner size={10} />
                      </div>
                    ) : (
                      <ul className="pl-4 space-y-0.5">
                        {cols.slice(0, 10).map((col) => {
                          // Check if column is a foreign key
                          const isForeignKey = fks.some(fk =>
                            fk.columns.split(',').map(c => c.trim()).includes(col)
                          );
                          return (
                            <li
                              key={col}
                              className="text-[10px] text-[#484f58] font-mono truncate flex items-center gap-1"
                            >
                              {isForeignKey && (
                                <Key size={8} className="text-blue-400 shrink-0" />
                              )}
                              <span className="truncate">{col}</span>
                            </li>
                          );
                        })}
                        {cols.length > 10 && (
                          <li className="text-[9px] text-[#484f58] italic">
                            +{cols.length - 10} more
                          </li>
                        )}
                      </ul>
                    )}

                    {/* Indexes */}
                    <div className="flex items-center gap-1 px-1 mt-1">
                      <List size={8} className="text-[#484f58] shrink-0" />
                      <span className="text-[9px] text-[#484f58] uppercase tracking-wider">
                        Indexes
                      </span>
                      <span className="text-[8px] text-[#484f58]">
                        ({idxs.length})
                      </span>
                    </div>
                    {isLoading ? (
                      <div className="pl-4 py-0.5">
                        <Spinner size={10} />
                      </div>
                    ) : idxs.length > 0 ? (
                      <ul className="pl-4 space-y-0.5">
                        {idxs.slice(0, 5).map((idx) => (
                          <li
                            key={idx.name}
                            className="text-[10px] text-[#484f58] font-mono truncate"
                            title={idx.name}
                          >
                            {idx.name}
                          </li>
                        ))}
                        {idxs.length > 5 && (
                          <li className="text-[9px] text-[#484f58] italic">
                            +{idxs.length - 5} more
                          </li>
                        )}
                      </ul>
                    ) : (
                      <span className="text-[9px] text-[#484f58] italic pl-4">
                        None
                      </span>
                    )}

                    {/* Foreign Keys */}
                    <div className="flex items-center gap-1 px-1 mt-1">
                      <Key size={8} className="text-[#484f58] shrink-0" />
                      <span className="text-[9px] text-[#484f58] uppercase tracking-wider">
                        Foreign Keys
                      </span>
                      <span className="text-[8px] text-[#484f58]">
                        ({fks.length})
                      </span>
                    </div>
                    {isLoading ? (
                      <div className="pl-4 py-0.5">
                        <Spinner size={10} />
                      </div>
                    ) : fks.length > 0 ? (
                      <ul className="pl-4 space-y-0.5">
                        {fks.slice(0, 5).map((fk, idx) => (
                          <li
                            key={`${fk.columns}_${fk.referenced_table}_${idx}`}
                            className="text-[10px] text-[#484f58] font-mono truncate"
                            title={`${fk.columns} → ${fk.referenced_table}`}
                          >
                            {fk.columns} → {fk.referenced_table}
                          </li>
                        ))}
                        {fks.length > 5 && (
                          <li className="text-[9px] text-[#484f58] italic">
                            +{fks.length - 5} more
                          </li>
                        )}
                      </ul>
                    ) : (
                      <span className="text-[9px] text-[#484f58] italic pl-4">
                        None
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
