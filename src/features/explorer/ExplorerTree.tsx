import { useEffect, useState, useMemo } from "react";
import { Database, Table2, Plug, PlugZap, Pencil, Trash2, ChevronRight, Loader2, Search, RefreshCw, Download, Upload, MoreVertical, Copy, Terminal, GitFork, Layers } from "lucide-react";
import { useConnectionStore } from "../connection/connectionStore";
import { loadSavedConnections, connectConnection, disconnectConnection, deleteSavedConnection } from "../connection/connectionApi";
import { ENGINE_META } from "../connection/engineMeta";
import { listTables, listDatabases, switchMongoDb } from "./schemaApi";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { Spinner } from "../../shared/ui/Spinner";
import { restoreDatabaseBackup } from "../object-view/objectApi";
import { save as nativeSave, open as nativeOpen } from "@tauri-apps/plugin-dialog";
import { useToast } from "../../components/Toast";
import { ImportModal } from "../object-view/ImportModal";
import { BackupModal } from "./BackupModal";
import { BackupJobsModal } from "./BackupJobsModal";
import { useBackupStore } from "../../stores/backupStore";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionConfig, TableInfo } from "../../shared/types";

interface ExplorerTreeProps {
  onEdit?: (config: ConnectionConfig) => void;
}

export function ExplorerTree({ onEdit }: ExplorerTreeProps) {
  const {
    savedConnections, activeConnections, setSavedConnections,
    addActiveConnection, removeActiveConnection, removeSavedConnection, setActiveConnectionId,
  } = useConnectionStore();
  const openObject = useWorkspaceStore((s) => s.openObject);
  const activeObjectId = useWorkspaceStore((s) => s.activeObjectId);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tables, setTables] = useState<Record<string, TableInfo[]>>({});
  const [tablesBusy, setTablesBusy] = useState<string | null>(null);
  // MongoDB only: databases per connection, expanded db nodes ("connId:db"),
  // and collections stored in `tables` under the "connId:db" key.
  const [databases, setDatabases] = useState<Record<string, string[]>>({});
  const [openDbs, setOpenDbs] = useState<Set<string>>(new Set());
  const [dbBusy, setDbBusy] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [connectionErrors, setConnectionErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<{ connId: string; table: string } | null>(null);
  const [backupTarget, setBackupTarget] = useState<{ connId: string; dbName?: string; engine: string } | null>(null);
  const [showBackupsList, setShowBackupsList] = useState(false);
  const runningJobsCount = useBackupStore((s) => s.jobs.filter((j) => j.status === "running").length);
  const [pendingTableAction, setPendingTableAction] = useState<{ type: "clear" | "drop"; tableId: string } | null>(null);

  const toggleDropdown = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setActiveDropdown((prev) => (prev === key ? null : key));
  };

  const getTableIcon = (engine: string) => {
    switch (engine) {
      case "mongodb":
        return <Layers size={12} className="text-emerald-400 shrink-0" />;
      case "redis":
        return <Database size={12} className="text-red-400 shrink-0" />;
      case "postgres":
        return <Table2 size={12} className="text-sky-400 shrink-0" />;
      case "mysql":
        return <Table2 size={12} className="text-orange-400 shrink-0" />;
      default:
        return <Table2 size={12} className="text-muted shrink-0" />;
    }
  };

  useEffect(() => {
    if (!activeDropdown) return;
    const handler = () => setActiveDropdown(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeDropdown]);


  const handleRestore = async (conn: ConnectionConfig) => {
    try {
      const ext = conn.db_type === "mongodb" ? "json" : "sql";
      const selected = await nativeOpen({
        multiple: false,
        filters: [
          { name: "Backup File", extensions: [ext] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!selected || typeof selected !== "string") return;

      setBusyId(conn.id);
      await restoreDatabaseBackup(conn.id, selected);
      toast("Restore completed successfully!", "success");
      refreshConn(conn);
    } catch (e) {
      toast(`Restore failed: ${e}`, "error");
    } finally {
      setBusyId(null);
    }
  };


  const handleRestoreDb = async (connId: string, engine: string, db: string) => {
    try {
      const ext = engine === "mongodb" ? "json" : "sql";
      const selected = await nativeOpen({
        multiple: false,
        filters: [
          { name: "Backup File", extensions: [ext] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!selected || typeof selected !== "string") return;

      setBusyId(`${connId}:${db}`);
      if (engine === "mongodb" || engine === "postgres") {
        await switchMongoDb(connId, db);
      }
      await restoreDatabaseBackup(connId, selected);
      toast(`Restore of database "${db}" completed successfully!`, "success");
      refreshDb(connId, db);
    } catch (e) {
      toast(`Restore failed: ${e}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleExportTable = async (connId: string, engine: string, table: string, db?: string) => {
    try {
      if (engine === "mongodb" && db) {
        await switchMongoDb(connId, db);
      }
      const quoteIdent = (ident: string) => engine === "mysql" ? `\`${ident}\`` : `"${ident}"`;
      const query = engine === "mongodb" ? `db.${table}.find({})` : `SELECT * FROM ${quoteIdent(table)}`;
      
      setBusyId(`${connId}:${table}`);
      const result = await invoke<any>("run_query", { connId, sql: query });
      if (!result || result.rows.length === 0) {
        toast("Table is empty, nothing to export", "info");
        return;
      }

      // Build CSV
      const header = result.columns.join(",");
      const csvRows = result.rows.map((row: any) =>
        result.columns
          .map((col: string) => {
            const val = row[col];
            const str = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
            return `"${str.replace(/"/g, '""').replace(/\n/g, " ").replace(/\r/g, "")}"`;
          })
          .join(",")
      );
      const csvContent = [header, ...csvRows].join("\n");

      const filePath = await nativeSave({
        defaultPath: `${table}_export.csv`,
        filters: [
          { name: "CSV", extensions: ["csv"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!filePath) return;

      await invoke("save_to_file", { path: filePath, content: csvContent });
      toast(`Successfully exported to ${filePath.split(/[/\\]/).pop()}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const executeClearTable = async (connId: string, engine: string, table: string, db?: string) => {
    try {
      if ((engine === "mongodb" || engine === "redis") && db) {
        await switchMongoDb(connId, db);
      }
      const quoteIdent = (ident: string) => engine === "mysql" ? `\`${ident}\`` : `"${ident}"`;
      const query = engine === "mongodb"
        ? `db.${table}.deleteMany({})`
        : engine === "redis"
        ? `DEL ${table}`
        : `DELETE FROM ${quoteIdent(table)}`;
      
      setBusyId(`${connId}:${table}`);
      await invoke("run_query", { connId, sql: query });
      toast(`Successfully cleared all data in "${table}"`, "success");
    } catch (e) {
      toast(`Failed to clear table: ${e}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const executeDropTable = async (connId: string, engine: string, table: string, db?: string) => {
    try {
      if ((engine === "mongodb" || engine === "redis") && db) {
        await switchMongoDb(connId, db);
      }
      const quoteIdent = (ident: string) => engine === "mysql" ? `\`${ident}\`` : `"${ident}"`;
      const query = engine === "mongodb"
        ? `db.${table}.drop()`
        : engine === "redis"
        ? `DEL ${table}`
        : `DROP TABLE ${quoteIdent(table)}`;
      
      setBusyId(`${connId}:${table}`);
      await invoke("run_query", { connId, sql: query });
      toast(`Successfully dropped "${table}"`, "success");
      if (db) {
        refreshDb(connId, db);
      } else {
        loadTablesForConn(connId, true);
      }
    } catch (e) {
      toast(`Failed to drop table: ${e}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const filteredConnections = useMemo(() => {
    if (!filter.trim()) return savedConnections;
    const q = filter.toLowerCase();
    return savedConnections.filter((c) => c.name.toLowerCase().includes(q));
  }, [savedConnections, filter]);

  useEffect(() => {
    loadSavedConnections()
      .then(setSavedConnections)
      .catch((e) => setLoadError(String(e)));
  }, [setSavedConnections]);

  const isActive = (id: string) => activeConnections.some((c) => c.id === id);

  const toggle = (id: string) => setOpen((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleConnect = async (id: string) => {
    const config = savedConnections.find((c) => c.id === id);
    if (!config) return;
    setBusyId(id);
    setConnectionErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
    try {
      const meta = await connectConnection(config);
      addActiveConnection(meta);
      setActiveConnectionId(meta.id);
      setTables((prev) => {
        const n = Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id && !k.startsWith(`${id}:`)));
        return n;
      });
      setDatabases((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setOpen((prev) => new Set(prev).add(id));
      await loadChildrenForConn(config);
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [id]: String(e) }));
    } finally {
      setBusyId(null);
    }
  };

  const loadTablesForConn = async (id: string, force = false) => {
    if (!force && tables[id]) return;
    setTablesBusy(id);
    try {
      const list = await listTables(id);
      setTables((prev) => ({ ...prev, [id]: list }));
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [id]: String(e) }));
    } finally {
      setTablesBusy(null);
    }
  };

  const loadDatabasesForConn = async (id: string, force = false) => {
    if (!force && databases[id]) return;
    setTablesBusy(id);
    try {
      const list = await listDatabases(id);
      setDatabases((prev) => ({ ...prev, [id]: list }));
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [id]: String(e) }));
    } finally {
      setTablesBusy(null);
    }
  };

  // MongoDB & Redis get a Server > Database > Collection hierarchy; SQL engines
  // keep the flat Connection > Table list.
  const loadChildrenForConn = (conn: ConnectionConfig, force = false) =>
    (conn.db_type === "mongodb" || conn.db_type === "postgres" || conn.db_type === "redis") ? loadDatabasesForConn(conn.id, force) : loadTablesForConn(conn.id, force);

  const expandConn = (conn: ConnectionConfig) => {
    const willOpen = !open.has(conn.id);
    toggle(conn.id);
    if (willOpen) loadChildrenForConn(conn);
  };

  const loadCollectionsForDb = async (connId: string, db: string) => {
    const key = `${connId}:${db}`;
    setDbBusy(key);
    try {
      await switchMongoDb(connId, db);
      const list = await listTables(connId);
      setTables((prev) => ({ ...prev, [key]: list }));
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [connId]: String(e) }));
    } finally {
      setDbBusy(null);
    }
  };

  const toggleDb = async (connId: string, db: string) => {
    const key = `${connId}:${db}`;
    const willOpen = !openDbs.has(key);
    setOpenDbs((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
    if (!willOpen || tables[key]) return;
    await loadCollectionsForDb(connId, db);
  };

  const refreshConn = (conn: ConnectionConfig) => {
    setTables((prev) => Object.fromEntries(
      Object.entries(prev).filter(([k]) => k !== conn.id && !k.startsWith(`${conn.id}:`))
    ));
    setDatabases((prev) => { const n = { ...prev }; delete n[conn.id]; return n; });
    setOpenDbs((prev) => new Set([...prev].filter((k) => !k.startsWith(`${conn.id}:`))));
    loadChildrenForConn(conn, true);
  };

  const refreshDb = (connId: string, db: string) => {
    setTables((prev) => { const n = { ...prev }; delete n[`${connId}:${db}`]; return n; });
    loadCollectionsForDb(connId, db);
  };

  const openMongoCollection = async (conn: ConnectionConfig, db: string, table: string) => {
    try {
      // The Mongo driver has a single "current database" — make sure it points
      // at this collection's database before the data grid queries it.
      await switchMongoDb(conn.id, db);
      openObject({ id: `${conn.id}:${db}:${table}`, connId: conn.id, table, label: table, engine: conn.db_type, database: db });
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [conn.id]: String(e) }));
    }
  };

  const openRedisKey = async (conn: ConnectionConfig, db: string, key: string) => {
    try {
      await switchMongoDb(conn.id, db);
      openObject({ id: `${conn.id}:${db}:${key}`, connId: conn.id, table: key, label: key, engine: conn.db_type, database: db });
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [conn.id]: String(e) }));
    }
  };

  const handleDisconnect = async (id: string) => {
    setBusyId(id);
    setConnectionErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
    try {
      await disconnectConnection(id);
      removeActiveConnection(id);
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [id]: String(e) }));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDelete(null);
    setConnectionErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
    try {
      if (isActive(id)) { await disconnectConnection(id); removeActiveConnection(id); }
      await deleteSavedConnection(id);
      removeSavedConnection(id);
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [id]: String(e) }));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto py-2">
      <div className="px-3 pb-1.5 flex items-center justify-between">
        <span className="text-[9px] font-bold tracking-[0.12em] text-muted uppercase">Explorer</span>
        <button
          onClick={() => setShowBackupsList(true)}
          className="text-[10px] font-semibold text-muted hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
        >
          <Download size={10} className={runningJobsCount > 0 ? "animate-bounce text-accent" : ""} />
          <span>Backups {runningJobsCount > 0 ? `(${runningJobsCount})` : ""}</span>
        </button>
      </div>

      {savedConnections.length > 0 && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-elevated border border-border rounded-[var(--radius-sm)]">
            <Search size={12} className="text-faint shrink-0" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter connections..."
              className="flex-1 bg-transparent text-xs text-fg placeholder:text-faint outline-none"
            />
          </div>
        </div>
      )}

      {loadError && <div className="px-3 py-2 text-[11px] text-danger">{loadError}</div>}
      {!loadError && savedConnections.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-muted">No connections yet — use "New Connection".</div>
      )}
      {!loadError && savedConnections.length > 0 && filteredConnections.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-muted">No matches</div>
      )}

      {filteredConnections.map((conn) => {
        const active = isActive(conn.id);
        const isOpen = open.has(conn.id);
        const busy = busyId === conn.id;
        const meta = ENGINE_META[conn.db_type];
        const EngineIcon = meta.icon;
        return (
          <div key={conn.id}>
            <div className="group w-full flex items-center gap-1.5 px-1 py-0.5">
              <button
                onClick={() => (active ? expandConn(conn) : handleConnect(conn.id))}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(conn);
                }}
                className="flex items-center gap-1.5 flex-1 min-w-0 py-1.5 px-1.5 rounded-[var(--radius-sm)] hover:bg-hover text-xs text-fg transition-colors duration-[var(--dur-fast)]"
              >
                <ChevronRight
                  size={12}
                  className={`text-muted transition-transform duration-[var(--dur-fast)] ${active && isOpen ? "rotate-90" : ""} ${!active ? "opacity-0" : ""}`}
                />
                <Database size={13} className={active ? "text-accent" : "text-muted"} />
                <span className="truncate min-w-0">{conn.name}</span>
                <span
                  title={meta.label}
                  className={`shrink-0 flex items-center gap-1 px-1 py-0.5 rounded-[var(--radius-sm)] border ${meta.border} ${meta.bg}`}
                >
                  <EngineIcon size={9} className={meta.color} />
                </span>
              </button>
              <div className="shrink-0 pr-1 relative">
                {busy ? (
                  <Spinner size={12} />
                ) : pendingDelete === conn.id ? (
                  <span className="flex items-center gap-1">
                    <button onClick={() => handleDelete(conn.id)} className="text-[10px] text-danger font-medium hover:underline cursor-pointer" title="Confirm delete">Delete?</button>
                    <button onClick={() => setPendingDelete(null)} className="text-[10px] text-muted hover:text-fg cursor-pointer" title="Cancel">✕</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {active && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          refreshConn(conn);
                        }}
                        title={`Refresh ${conn.name}`}
                        className="p-1 rounded text-muted hover:text-accent hover:bg-hover transition-colors cursor-pointer"
                      >
                        <RefreshCw size={11} />
                      </button>
                    )}
                    <button
                      onClick={(e) => toggleDropdown(e, `conn:${conn.id}`)}
                      title="Actions"
                      className={`p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer ${
                        activeDropdown === `conn:${conn.id}` ? "bg-hover text-fg" : ""
                      }`}
                    >
                      <MoreVertical size={12} />
                    </button>

                    {activeDropdown === `conn:${conn.id}` && (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 z-50 bg-elevated border border-border rounded-[var(--radius-md)] shadow-lg anim-pop py-1 w-[150px]"
                      >
                        {active && (
                          <>
                            <button
                              onClick={() => {
                                openObject({
                                  id: `console:${conn.id}:${conn.db_type === "postgres" ? "public" : "default"}`,
                                  connId: conn.id,
                                  table: "",
                                  label: `Console: ${conn.name}`,
                                  engine: conn.db_type,
                                  type: "sql-console",
                                });
                                setActiveDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                            >
                              <Terminal size={11} className="shrink-0 text-accent" />
                              <span>SQL Console</span>
                            </button>
                            <button
                              onClick={() => {
                                openObject({
                                  id: `er:${conn.id}`,
                                  connId: conn.id,
                                  table: "",
                                  label: `ER Diagram: ${conn.name}`,
                                  engine: conn.db_type,
                                  type: "er-diagram",
                                });
                                setActiveDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                            >
                              <GitFork size={11} className="shrink-0 text-accent rotate-90" />
                              <span>ER Diagram</span>
                            </button>
                            <div className="my-1 border-t border-border"></div>
                          </>
                        )}
                        {active ? (
                          <button
                            onClick={() => handleDisconnect(conn.id)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-danger hover:bg-hover transition-colors text-left cursor-pointer"
                          >
                            <PlugZap size={11} className="shrink-0" />
                            <span>Disconnect</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConnect(conn.id)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                          >
                            <Plug size={11} className="shrink-0" />
                            <span>Connect</span>
                          </button>
                        )}
                        {onEdit && (
                          <button
                            onClick={() => onEdit(conn)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                          >
                            <Pencil size={11} className="shrink-0" />
                            <span>Edit Connection</span>
                          </button>
                        )}
                        <button
                          onClick={() => setPendingDelete(conn.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-danger hover:bg-hover transition-colors text-left cursor-pointer"
                        >
                          <Trash2 size={11} className="shrink-0" />
                          <span>Delete</span>
                        </button>
                        {active && (conn.db_type !== "mongodb" && conn.db_type !== "postgres") && (
                          <>
                            <div className="my-1 border-t border-border"></div>
                            <button
                              onClick={() => {
                                setBackupTarget({ connId: conn.id, engine: conn.db_type });
                                setActiveDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                            >
                              <Download size={11} className="shrink-0" />
                              <span>Backup DB</span>
                            </button>
                            <button
                              onClick={() => handleRestore(conn)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                            >
                              <Upload size={11} className="shrink-0" />
                              <span>Restore Backup</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </span>
                )}
              </div>
            </div>
            {connectionErrors[conn.id] && (
              <div className="pl-9 pr-2 py-1 text-[10px] text-danger break-words">
                {connectionErrors[conn.id]}
              </div>
            )}
            {active && isOpen && (conn.db_type === "mongodb" || conn.db_type === "postgres" || conn.db_type === "redis") && (
              tablesBusy === conn.id
                ? (
                  <div className="pl-9 pr-2 py-1.5 text-[11px] text-muted flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" /> Loading…
                  </div>
                )
                : (databases[conn.id]?.length ?? 0) === 0
                  ? <div className="pl-9 pr-2 py-1.5 text-[11px] text-faint italic">{conn.db_type === "postgres" ? "No schemas" : "No databases"}</div>
                  : databases[conn.id]!.map((db) => {
                      const dbKey = `${conn.id}:${db}`;
                      const dbOpen = openDbs.has(dbKey);
                      return (
                        <div key={dbKey}>
                          <div className="group/db w-full flex items-center pr-1 relative">
                            <button
                              onClick={() => toggleDb(conn.id, db)}
                              className="flex-1 min-w-0 flex items-center gap-1.5 pl-7 pr-2 py-1.5 text-xs truncate text-muted hover:bg-hover hover:text-fg transition-colors duration-[var(--dur-fast)] rounded-[var(--radius-sm)] ml-1"
                            >
                              <ChevronRight
                                size={11}
                                className={`shrink-0 text-muted transition-transform duration-[var(--dur-fast)] ${dbOpen ? "rotate-90" : ""}`}
                              />
                              <EngineIcon size={12} className={`shrink-0 ${meta.color}`} />
                              <span className="truncate">{db}</span>
                            </button>
                            <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/db:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  refreshDb(conn.id, db);
                                }}
                                title={`Refresh ${db}`}
                                className="p-0.5 rounded text-muted hover:text-accent hover:bg-hover transition-colors cursor-pointer"
                              >
                                <RefreshCw size={11} />
                              </button>
                              <button
                                onClick={(e) => toggleDropdown(e, `db:${conn.id}:${db}`)}
                                title="Actions"
                                className={`p-0.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer ${
                                  activeDropdown === `db:${conn.id}:${db}` ? "bg-hover text-fg" : ""
                                }`}
                              >
                                <MoreVertical size={11} />
                              </button>
                              
                              {activeDropdown === `db:${conn.id}:${db}` && (
                                <div
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="absolute right-0 top-full mt-0.5 z-50 bg-elevated border border-border rounded-[var(--radius-md)] shadow-lg anim-pop py-1 w-[150px]"
                                >
                                  <button
                                    onClick={() => {
                                      openObject({
                                        id: `console:${conn.id}:${db}`,
                                        connId: conn.id,
                                        table: "",
                                        label: `Console: ${db}`,
                                        engine: conn.db_type,
                                        type: "sql-console",
                                      });
                                      setActiveDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                  >
                                    <Terminal size={11} className="shrink-0 text-accent" />
                                    <span>SQL Console</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      openObject({
                                        id: `er:${conn.id}:${db}`,
                                        connId: conn.id,
                                        table: "",
                                        label: `ER Diagram: ${db}`,
                                        engine: conn.db_type,
                                        type: "er-diagram",
                                      });
                                      setActiveDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                  >
                                    <GitFork size={11} className="shrink-0 text-accent rotate-90" />
                                    <span>ER Diagram</span>
                                  </button>
                                  <div className="my-1 border-t border-border"></div>
                                  <button
                                    onClick={() => {
                                      refreshDb(conn.id, db);
                                      setActiveDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                  >
                                    <RefreshCw size={11} className="shrink-0" />
                                    <span>Refresh</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(db);
                                      toast("Copied database name", "success");
                                      setActiveDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                  >
                                    <Copy size={11} className="shrink-0" />
                                    <span>Copy Name</span>
                                  </button>
                                  <div className="my-1 border-t border-border"></div>
                                  <button
                                    onClick={() => {
                                      setBackupTarget({ connId: conn.id, dbName: db, engine: conn.db_type });
                                      setActiveDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                  >
                                    <Download size={11} className="shrink-0" />
                                    <span>Backup DB</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleRestoreDb(conn.id, conn.db_type, db);
                                      setActiveDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                  >
                                    <Upload size={11} className="shrink-0" />
                                    <span>Restore Backup</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {dbOpen && (
                            dbBusy === dbKey
                              ? (
                                <div className="pl-14 pr-2 py-1.5 text-[11px] text-muted flex items-center gap-1.5">
                                  <Loader2 size={11} className="animate-spin" /> Loading…
                                </div>
                              )
                              : (tables[dbKey]?.length ?? 0) === 0
                                ? <div className="pl-14 pr-2 py-1.5 text-[11px] text-faint italic">{conn.db_type === "postgres" ? "No tables" : conn.db_type === "redis" ? "No keys" : "No collections"}</div>
                                : tables[dbKey]!.map((t) => {
                                    const objId = `${conn.id}:${db}:${t.name}`;
                                    const selected = activeObjectId === objId;
                                    return (
                                      <div key={objId} className="group/tbl w-full flex items-center pr-1 relative">
                                        {pendingTableAction?.tableId === objId ? (
                                          <div className="flex-1 flex items-center justify-between pl-14 pr-2 py-1 bg-danger/10 text-danger rounded-[var(--radius-sm)] ml-1">
                                            <span className="text-[10px] font-semibold uppercase">{pendingTableAction.type} collection?</span>
                                            <span className="flex items-center gap-1.5">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (pendingTableAction.type === "clear") {
                                                    executeClearTable(conn.id, conn.db_type, t.name, db);
                                                  } else {
                                                    executeDropTable(conn.id, conn.db_type, t.name, db);
                                                  }
                                                  setPendingTableAction(null);
                                                }}
                                                className="text-[10px] text-danger font-bold hover:underline cursor-pointer"
                                              >
                                                Yes
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setPendingTableAction(null);
                                                }}
                                                className="text-[10px] text-muted hover:text-fg font-bold cursor-pointer"
                                              >
                                                No
                                              </button>
                                            </span>
                                          </div>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => {
                                                if (conn.db_type === "redis") {
                                                  openRedisKey(conn, db, t.name);
                                                } else {
                                                  openMongoCollection(conn, db, t.name);
                                                }
                                              }}
                                              className={`flex-1 flex items-center gap-1.5 pl-14 pr-2 py-1.5 text-xs truncate transition-colors duration-[var(--dur-fast)] rounded-[var(--radius-sm)] ml-1 ${
                                                selected ? "bg-accent/10 text-fg font-medium" : "text-muted hover:bg-hover hover:text-fg"
                                              }`}
                                            >
                                              {getTableIcon(conn.db_type)}
                                              <span className="truncate">{t.name}</span>
                                            </button>
                                            <div className="shrink-0 opacity-0 group-hover/tbl:opacity-100 focus-within:opacity-100 transition-opacity">
                                              <button
                                                onClick={(e) => toggleDropdown(e, `tbl:${objId}`)}
                                                title="Actions"
                                                className={`p-0.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer ${
                                                  activeDropdown === `tbl:${objId}` ? "bg-hover text-fg" : ""
                                                }`}
                                              >
                                                <MoreVertical size={11} />
                                              </button>
                                              
                                              {activeDropdown === `tbl:${objId}` && (
                                                <div
                                                  onMouseDown={(e) => e.stopPropagation()}
                                                  className="absolute right-0 top-full mt-0.5 z-50 bg-elevated border border-border rounded-[var(--radius-md)] shadow-lg anim-pop py-1 w-[140px]"
                                                >
                                                  <button
                                                    onClick={() => {
                                                      if (conn.db_type === "redis") {
                                                        openRedisKey(conn, db, t.name);
                                                      } else {
                                                        openMongoCollection(conn, db, t.name);
                                                      }
                                                      setActiveDropdown(null);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                                  >
                                                    <Table2 size={11} className="shrink-0" />
                                                    <span>Open</span>
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      navigator.clipboard.writeText(t.name);
                                                      toast("Copied name", "success");
                                                      setActiveDropdown(null);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                                  >
                                                    <Copy size={11} className="shrink-0" />
                                                    <span>Copy Name</span>
                                                  </button>
                                                  
                                                  {conn.db_type !== "redis" && (
                                                    <>
                                                      <div className="my-1 border-t border-border"></div>
                                                      <button
                                                        onClick={() => {
                                                          setImportTarget({ connId: conn.id, table: t.name });
                                                          setActiveDropdown(null);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                                      >
                                                        <Upload size={11} className="shrink-0" />
                                                        <span>Import Data</span>
                                                      </button>
                                                      <button
                                                        onClick={() => {
                                                          handleExportTable(conn.id, conn.db_type, t.name, db);
                                                          setActiveDropdown(null);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                                      >
                                                        <Download size={11} className="shrink-0" />
                                                        <span>Export CSV</span>
                                                      </button>
                                                    </>
                                                  )}
                                                  
                                                  <div className="my-1 border-t border-border"></div>
                                                  {conn.db_type !== "redis" && (
                                                    <button
                                                      onClick={() => {
                                                        setPendingTableAction({ type: "clear", tableId: objId });
                                                        setActiveDropdown(null);
                                                      }}
                                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-danger hover:bg-hover transition-colors text-left cursor-pointer"
                                                    >
                                                      <Trash2 size={11} className="shrink-0 text-danger" />
                                                      <span>Clear Data</span>
                                                    </button>
                                                  )}
                                                  <button
                                                    onClick={() => {
                                                      setPendingTableAction({ type: "drop", tableId: objId });
                                                      setActiveDropdown(null);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-danger hover:bg-hover transition-colors text-left cursor-pointer"
                                                  >
                                                    <Trash2 size={11} className="shrink-0 text-danger" />
                                                    <span>{conn.db_type === "redis" ? "Delete Key" : "Drop Collection"}</span>
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })
                          )}
                        </div>
                      );
                    })
            )}
            {active && isOpen && (conn.db_type !== "mongodb" && conn.db_type !== "postgres" && conn.db_type !== "redis") && (
              tablesBusy === conn.id
                ? (
                  <div className="pl-9 pr-2 py-1.5 text-[11px] text-muted flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" /> Loading…
                  </div>
                )
                : (tables[conn.id]?.length ?? 0) === 0
                  ? <div className="pl-9 pr-2 py-1.5 text-[11px] text-faint italic">No tables</div>
                  : tables[conn.id]!.map((t) => {
                      const objId = `${conn.id}:${t.name}`;
                      const selected = activeObjectId === objId;
                      return (
                        <div key={objId} className="group/tbl w-full flex items-center pr-1 relative">
                          {pendingTableAction?.tableId === objId ? (
                            <div className="flex-1 flex items-center justify-between pl-11 pr-2 py-1 bg-danger/10 text-danger rounded-[var(--radius-sm)] ml-1">
                              <span className="text-[10px] font-semibold uppercase">{pendingTableAction.type} table?</span>
                              <span className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (pendingTableAction.type === "clear") {
                                      executeClearTable(conn.id, conn.db_type, t.name, undefined);
                                    } else {
                                      executeDropTable(conn.id, conn.db_type, t.name, undefined);
                                    }
                                    setPendingTableAction(null);
                                  }}
                                  className="text-[10px] text-danger font-bold hover:underline cursor-pointer"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPendingTableAction(null);
                                  }}
                                  className="text-[10px] text-muted hover:text-fg font-bold cursor-pointer"
                                >
                                  No
                                </button>
                              </span>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => openObject({ id: objId, connId: conn.id, table: t.name, label: t.name, engine: conn.db_type })}
                                className={`flex-1 flex items-center gap-1.5 pl-11 pr-2 py-1.5 text-xs truncate transition-colors duration-[var(--dur-fast)] rounded-[var(--radius-sm)] ml-1 ${
                                  selected ? "bg-accent/10 text-fg font-medium" : "text-muted hover:bg-hover hover:text-fg"
                                }`}
                              >
                                {getTableIcon(conn.db_type)}
                                <span className="truncate">{t.name}</span>
                              </button>
                              <div className="shrink-0 opacity-0 group-hover/tbl:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => toggleDropdown(e, `tbl:${objId}`)}
                                  title="Actions"
                                  className={`p-0.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer ${
                                    activeDropdown === `tbl:${objId}` ? "bg-hover text-fg" : ""
                                  }`}
                                >
                                  <MoreVertical size={11} />
                                </button>
                                
                                {activeDropdown === `tbl:${objId}` && (
                                  <div
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-full mt-0.5 z-50 bg-elevated border border-border rounded-[var(--radius-md)] shadow-lg anim-pop py-1 w-[140px]"
                                  >
                                    <button
                                      onClick={() => {
                                        openObject({ id: objId, connId: conn.id, table: t.name, label: t.name, engine: conn.db_type });
                                        setActiveDropdown(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                    >
                                      <Table2 size={11} className="shrink-0" />
                                      <span>Open</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(t.name);
                                        toast("Copied name", "success");
                                        setActiveDropdown(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                    >
                                      <Copy size={11} className="shrink-0" />
                                      <span>Copy Name</span>
                                    </button>
                                    <div className="my-1 border-t border-border"></div>
                                    <button
                                      onClick={() => {
                                        setImportTarget({ connId: conn.id, table: t.name });
                                        setActiveDropdown(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                    >
                                      <Upload size={11} className="shrink-0" />
                                      <span>Import Data</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleExportTable(conn.id, conn.db_type, t.name, undefined);
                                        setActiveDropdown(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                                    >
                                      <Download size={11} className="shrink-0" />
                                      <span>Export CSV</span>
                                    </button>
                                    <div className="my-1 border-t border-border"></div>
                                    <button
                                      onClick={() => {
                                        setPendingTableAction({ type: "clear", tableId: objId });
                                        setActiveDropdown(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-danger hover:bg-hover transition-colors text-left cursor-pointer"
                                    >
                                      <Trash2 size={11} className="shrink-0 text-danger" />
                                      <span>Clear Data</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setPendingTableAction({ type: "drop", tableId: objId });
                                        setActiveDropdown(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-danger hover:bg-hover transition-colors text-left cursor-pointer"
                                    >
                                      <Trash2 size={11} className="shrink-0 text-danger" />
                                      <span>Drop Table</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
            )}
          </div>
        );
      })}
      {importTarget && (
        <ImportModal
          connId={importTarget.connId}
          table={importTarget.table}
          onClose={() => setImportTarget(null)}
          onSuccess={() => {}}
        />
      )}
      {backupTarget && (
        <BackupModal
          connId={backupTarget.connId}
          dbName={backupTarget.dbName}
          engine={backupTarget.engine}
          onClose={() => setBackupTarget(null)}
          onSuccess={() => {}}
        />
      )}
      {showBackupsList && (
        <BackupJobsModal
          onClose={() => setShowBackupsList(false)}
        />
      )}
    </div>
  );
}
