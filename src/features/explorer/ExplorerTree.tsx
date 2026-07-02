import { useEffect, useState, useMemo } from "react";
import { Database, Table2, Plug, PlugZap, Pencil, Trash2, ChevronRight, Loader2, Search } from "lucide-react";
import { useConnectionStore } from "../connection/connectionStore";
import { loadSavedConnections, connectConnection, disconnectConnection, deleteSavedConnection } from "../connection/connectionApi";
import { ENGINE_META } from "../connection/engineMeta";
import { listTables } from "./schemaApi";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { Spinner } from "../../shared/ui/Spinner";
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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [connectionErrors, setConnectionErrors] = useState<Record<string, string>>({});

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
      setTables((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setOpen((prev) => new Set(prev).add(id));
      await loadTablesForConn(id);
    } catch (e) {
      setConnectionErrors((prev) => ({ ...prev, [id]: String(e) }));
    } finally {
      setBusyId(null);
    }
  };

  const loadTablesForConn = async (id: string) => {
    if (tables[id]) return;
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

  const expandConn = (id: string) => {
    const willOpen = !open.has(id);
    toggle(id);
    if (willOpen) loadTablesForConn(id);
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
      <div className="px-3 pb-1.5">
        <span className="text-[9px] font-bold tracking-[0.12em] text-muted uppercase">Explorer</span>
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
                onClick={() => (active ? expandConn(conn.id) : handleConnect(conn.id))}
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
              <div className="shrink-0 pr-1">
                {busy ? (
                  <Spinner size={12} />
                ) : pendingDelete === conn.id ? (
                  <span className="flex items-center gap-1">
                    <button onClick={() => handleDelete(conn.id)} className="text-[10px] text-danger" title="Confirm delete">Delete?</button>
                    <button onClick={() => setPendingDelete(null)} className="text-[10px] text-muted" title="Cancel">✕</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {active
                      ? <button onClick={() => handleDisconnect(conn.id)} title="Disconnect" aria-label={`Disconnect ${conn.name}`} className="text-muted hover:text-danger transition-colors"><PlugZap size={12} /></button>
                      : <button onClick={() => handleConnect(conn.id)} title="Connect" aria-label={`Connect ${conn.name}`} className="text-muted hover:text-accent transition-colors"><Plug size={12} /></button>}
                    {onEdit && <button onClick={() => onEdit(conn)} title="Edit" aria-label={`Edit ${conn.name}`} className="text-muted hover:text-fg transition-colors"><Pencil size={12} /></button>}
                    <button onClick={() => setPendingDelete(conn.id)} title="Delete" aria-label={`Delete ${conn.name}`} className="text-muted hover:text-danger transition-colors"><Trash2 size={12} /></button>
                  </span>
                )}
              </div>
            </div>
            {connectionErrors[conn.id] && (
              <div className="pl-9 pr-2 py-1 text-[10px] text-danger break-words">
                {connectionErrors[conn.id]}
              </div>
            )}
            {active && isOpen && (
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
                        <button
                          key={objId}
                          onClick={() => openObject({ id: objId, connId: conn.id, table: t.name, label: t.name, engine: conn.db_type })}
                          className={`w-full flex items-center gap-1.5 pl-11 pr-2 py-1.5 text-xs truncate transition-colors duration-[var(--dur-fast)] rounded-[var(--radius-sm)] mx-1 ${
                            selected ? "bg-accent/10 text-fg" : "text-muted hover:bg-hover hover:text-fg"
                          }`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <Table2 size={12} />
                          <span className="truncate">{t.name}</span>
                        </button>
                      );
                    })
            )}
          </div>
        );
      })}
    </div>
  );
}
