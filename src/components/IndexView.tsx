import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, RefreshCw, Shield, Key, Zap } from "lucide-react";

interface IndexInfo {
  name: string;
  columns: string;
  is_unique: boolean;
  index_type: string;
}

interface Props {
  connId: string;
  table: string;
}

export function IndexView({ connId, table }: Props) {
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<IndexInfo[]>("list_indexes", { connId, table });
      setIndexes(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [connId, table]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#7d8590] gap-2">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading indexes…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-4">
        <pre className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded p-3 whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  if (indexes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#7d8590] text-sm gap-1">
        No indexes found for <span className="font-mono text-[#7d8590]">{table}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#7d8590]">{indexes.length} index{indexes.length !== 1 ? "es" : ""}</span>
        <button onClick={load} disabled={loading} title="Refresh"
          className="p-1 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] transition-colors disabled:opacity-30">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[#30363d]/50">
            {["#", "Name", "Columns / Keys", "Type", "Flags"].map((h, i) => (
              <th key={i} className="px-3 py-2.5 text-[10px] font-semibold text-[#7d8590] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx, i) => {
            const isPrimary = idx.name === "PRIMARY" || idx.name.endsWith("_pkey") || idx.columns === "_id: asc";
            return (
              <tr key={idx.name} className={`border-b border-[#30363d] hover:bg-[#21262d]/40 transition-colors ${i % 2 === 0 ? "" : "bg-[#21262d]/10"}`}>
                <td className="px-3 py-2 text-xs text-[#484f58] font-mono w-8">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {isPrimary && <Key size={11} className="text-yellow-400 shrink-0" />}
                    {idx.is_unique && !isPrimary && <Shield size={11} className="text-blue-400 shrink-0" />}
                    <span className="text-xs font-mono text-[#e6edf3]">{idx.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 max-w-[320px]">
                  <span className="text-xs font-mono text-[#7d8590] truncate block" title={idx.columns}>{idx.columns}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="text-[10px] font-mono text-sky-400/80 bg-sky-900/20 border border-sky-800/30 rounded px-1.5 py-0.5">
                    {idx.index_type || "btree"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    {isPrimary && (
                      <span className="text-[10px] text-yellow-500 bg-yellow-900/20 border border-yellow-700/30 rounded px-1.5 py-0.5">
                        PRIMARY
                      </span>
                    )}
                    {idx.is_unique && (
                      <span className="flex items-center gap-0.5 text-[10px] text-blue-400 bg-blue-900/20 border border-blue-800/30 rounded px-1.5 py-0.5">
                        <Zap size={9} />UNIQUE
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
