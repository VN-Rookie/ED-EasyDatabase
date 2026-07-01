import { useState } from "react";
import { Table, FolderOpen, RefreshCw, Search, X, ChevronLeft } from "lucide-react";
import { useSchemaStore } from "../stores/schemaStore";
import { useConnectionStore } from "../stores/connectionStore";
import { useSchema } from "../hooks/useSchema";

export function SchemaTree() {
  const { databases, selectedDatabase, tables, selectedTable, loading, tableCounts } = useSchemaStore();
  const { activeConnectionId, activeConnections } = useConnectionStore();
  const { selectTable, loadTables, loadDatabases, selectDatabase } = useSchema();
  const [search, setSearch] = useState("");

  const activeMeta       = activeConnections.find(c => c.id === activeConnectionId);
  const isMongo          = activeMeta?.db_type === "mongodb";
  const showingDatabases = isMongo && selectedDatabase === null;

  const handleRefresh = () => {
    if (!activeConnectionId) return;
    showingDatabases ? loadDatabases(activeConnectionId) : loadTables(activeConnectionId);
  };

  const handleBackToDbs = () => {
    useSchemaStore.getState().setSelectedDatabase(null);
    useSchemaStore.getState().setTables([]);
    setSearch("");
  };

  const filteredDbs    = databases.filter(n => n.toLowerCase().includes(search.toLowerCase()));
  const filteredTables = tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  const listCount      = showingDatabases ? databases.length : tables.length;
  const label          = showingDatabases ? "Databases" : (isMongo ? "Collections" : "Tables");

  return (
    <div className="ml-4 border-l border-[#21262d] mt-0.5">
      {/* Header */}
      <div className="flex items-center justify-between pl-2 pr-1 py-1.5">
        <div className="flex items-center gap-1 min-w-0">
          {isMongo && !showingDatabases && (
            <button onClick={handleBackToDbs} title="Back to databases"
              className="p-0.5 rounded text-[#484f58] hover:text-[#7d8590] hover:bg-[#292e36] transition-all shrink-0">
              <ChevronLeft size={10} />
            </button>
          )}
          <span className="text-[9px] font-bold tracking-[0.10em] text-[#7d8590] uppercase shrink-0">
            {label}{listCount > 0 ? ` (${listCount})` : ""}
          </span>
          {isMongo && !showingDatabases && selectedDatabase && (
            <span className="text-[9px] text-[#484f58] truncate ml-1" title={selectedDatabase}>· {selectedDatabase}</span>
          )}
        </div>
        <button onClick={handleRefresh} disabled={loading} title={`Refresh`}
          className="p-0.5 rounded text-[#484f58] hover:text-[#7d8590] hover:bg-[#292e36] disabled:opacity-30 transition-all shrink-0">
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Search — always visible when has items (UI-8) */}
      {listCount > 0 && (
        <div className="px-2 pb-1.5">
          <div className="relative">
            <Search size={9} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
              className="w-full bg-[#0d1117] border border-[#21262d] focus:border-[#30363d] rounded-lg pl-5 pr-5 py-1 text-[10px] text-[#e6edf3] placeholder:text-[#484f58] outline-none transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#7d8590] transition-colors">
                <X size={9} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading skeleton (UI-10) */}
      {loading ? (
        <div className="pl-1 pb-1 space-y-0.5">
          {[70, 55, 85, 60, 75].map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1.5">
              <div className="w-2.5 h-2.5 bg-[#21262d] rounded-sm skeleton-shimmer shrink-0" />
              <div className="h-2.5 bg-[#21262d] rounded-sm skeleton-shimmer" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ) : showingDatabases ? (
        filteredDbs.length === 0 ? (
          <div className="pl-3 py-2">
            <span className="text-[10px] text-[#484f58]">{search ? `No match for "${search}"` : "No databases found"}</span>
          </div>
        ) : (
          <ul className="pl-1 pb-1 space-y-0.5">
            {filteredDbs.map(dbName => (
              <li key={dbName}>
                <button onClick={() => activeConnectionId && selectDatabase(dbName, activeConnectionId)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all text-[#7d8590] hover:bg-[#292e36] hover:text-[#e6edf3]">
                  <FolderOpen size={10} className="shrink-0 opacity-60" />
                  <span className="text-[11px] truncate font-mono flex-1">{dbName}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        filteredTables.length === 0 ? (
          <div className="pl-3 py-2">
            <span className="text-[10px] text-[#484f58]">{search ? `No match for "${search}"` : `No ${label.toLowerCase()} found`}</span>
          </div>
        ) : (
          <ul className="pl-1 pb-1 space-y-0.5">
            {filteredTables.map(t => {
              const isSel = selectedTable === t.name;
              return (
                <li key={t.name}>
                  <button onClick={() => selectTable(t.name)}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all ${
                      isSel ? "bg-blue-500/15 text-blue-300" : "text-[#7d8590] hover:bg-[#292e36] hover:text-[#e6edf3]"
                    }`}>
                    <Table size={10} className="shrink-0 opacity-60" />
                    <span className={`text-[11px] truncate font-mono flex-1 ${isSel ? "font-semibold" : ""}`}>{t.name}</span>
                    {tableCounts[t.name] !== undefined && (
                      <span className="text-[9px] text-[#484f58] font-mono shrink-0 tabular-nums">
                        {tableCounts[t.name].toLocaleString()}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
