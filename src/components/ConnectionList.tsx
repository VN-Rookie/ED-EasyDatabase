import { Trash2, Pencil, Plug2, PlugZap, Database, Layers } from "lucide-react";
import type { ConnectionConfig, ConnectionMeta } from "../types";
import { useConnectionStore } from "../stores/connectionStore";
import { useConnections } from "../hooks/useConnections";
import { SchemaTree } from "./SchemaTree";

interface Props { onEdit: (config: ConnectionConfig) => void; }

const DB_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  postgres: { icon: Database, color: "text-sky-400",     bg: "bg-sky-500/[0.12]"     },
  mysql:    { icon: Database, color: "text-orange-400",  bg: "bg-orange-500/[0.12]"  },
  mongodb:  { icon: Layers,   color: "text-emerald-400", bg: "bg-emerald-500/[0.12]" },
};

export function ConnectionList({ onEdit }: Props) {
  const { savedConnections, activeConnections, activeConnectionId } = useConnectionStore();
  const { connect, disconnect, deleteSaved } = useConnections();

  const isActive   = (id: string) => activeConnections.some((c: ConnectionMeta) => c.id === id);
  const isSelected = (id: string) => activeConnectionId === id;

  const handleClick = async (config: ConnectionConfig) => {
    if (isActive(config.id)) {
      useConnectionStore.getState().setActiveConnectionId(config.id);
    } else {
      try { await connect(config); } catch (e) { console.error(e); }
    }
  };

  if (savedConnections.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="w-10 h-10 rounded-2xl bg-[#161b22] border border-[#30363d] flex items-center justify-center mx-auto mb-3">
          <Plug2 size={16} className="text-[#7d8590]" />
        </div>
        <p className="text-xs text-[#7d8590] font-medium">No connections yet</p>
        <p className="text-[10px] text-[#484f58] mt-1">Click "New Connection" below</p>
      </div>
    );
  }

  return (
    <ul className="px-2 space-y-0.5 pb-1">
      {savedConnections.map(config => {
        const active   = isActive(config.id);
        const selected = isSelected(config.id);
        const dbm      = DB_META[config.db_type] ?? DB_META.postgres;
        const Icon     = dbm.icon;

        return (
          <li key={config.id}>
            <button
              onClick={() => handleClick(config)}
              className={`w-full flex items-center gap-2.5 rounded-xl text-left group transition-all duration-150 ${
                selected ? "" : "hover:bg-[#292e36] border border-transparent hover:border-[#30363d]"
              }`}
              style={selected ? {
                padding: "0.5rem 0.625rem 0.5rem calc(0.625rem - 2px)",
                borderLeft: "2px solid #3b82f6",
                borderTop: "1px solid rgba(255,255,255,0.07)",
                borderRight: "1px solid rgba(255,255,255,0.07)",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "0.75rem",
                background: "linear-gradient(to right, rgba(59,130,246,0.09), rgba(59,130,246,0.03))",
              } : { padding: "0.5rem 0.625rem" }}>

              {/* DB type icon */}
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${dbm.bg}`}
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <Icon size={13} className={dbm.color} />
              </span>

              {/* Connection name */}
              <span className={`text-xs truncate flex-1 transition-colors ${
                selected ? "text-white font-semibold" : active ? "text-[#e6edf3] font-medium" : "text-[#7d8590]"
              }`}>
                {config.name}
              </span>

              {/* Status + hover actions */}
              <span className="flex items-center gap-1 shrink-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0 ${active ? "bg-emerald-400" : "bg-[#30363d]"}`}
                  style={active ? { boxShadow: "0 0 0 3px rgba(52,211,153,0.14)" } : {}}
                />
                <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-0.5 transition-opacity">
                  {active && (
                    <span onClick={e => { e.stopPropagation(); disconnect(config.id); }}
                      className="p-1 rounded-lg hover:bg-[#292e36] text-[#7d8590] hover:text-amber-400 transition-all cursor-pointer">
                      <PlugZap size={11} />
                    </span>
                  )}
                  <span onClick={e => { e.stopPropagation(); onEdit(config); }}
                    className="p-1 rounded-lg hover:bg-[#292e36] text-[#7d8590] hover:text-blue-400 transition-all cursor-pointer">
                    <Pencil size={11} />
                  </span>
                  <span onClick={async e => {
                    e.stopPropagation();
                    if (active) await disconnect(config.id);
                    await deleteSaved(config.id);
                  }}
                    className="p-1 rounded-lg hover:bg-[#292e36] text-[#7d8590] hover:text-rose-400 transition-all cursor-pointer">
                    <Trash2 size={11} />
                  </span>
                </span>
              </span>
            </button>

            {selected && active && <SchemaTree />}
          </li>
        );
      })}
    </ul>
  );
}
