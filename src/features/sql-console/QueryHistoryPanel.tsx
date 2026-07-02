import { useState } from "react";
import { History, Trash2, Play, X, Search } from "lucide-react";
import { useViewStore } from "../../stores/viewStore";

interface Props {
  onLoad: (sql: string) => void;
  onRun: (sql: string) => void;
  onClose: () => void;
}

function HistoryRow({ sql, onLoad, onRun }: {
  sql: string;
  onLoad: (sql: string) => void;
  onRun: (sql: string) => void;
}) {
  return (
    <div className="group px-3 py-2 hover:bg-hover transition-colors border-b border-border/50 last:border-0">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onLoad(sql)}
          className="flex-1 text-left text-xs text-fg font-mono truncate hover:text-accent transition-colors"
          title={sql}
        >
          {sql.slice(0, 50)}{sql.length > 50 ? "…" : ""}
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onRun(sql)} title="Run" className="p-0.5 rounded text-muted hover:text-accent hover:bg-elevated transition-colors">
            <Play size={9} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function QueryHistoryPanel({ onLoad, onRun, onClose }: Props) {
  const { queryHistory, pushHistory } = useViewStore();
  const [search, setSearch] = useState("");

  const filtered = queryHistory.filter((sql) =>
    sql.toLowerCase().includes(search.toLowerCase())
  );

  const handleClearHistory = () => {
    queryHistory.forEach(() => pushHistory("")); // Clear by setting empty
    // Actually reset to empty array
    localStorage.setItem("tool-sql:query-history", "[]");
    window.location.reload(); // Simple way to reset store
  };

  return (
    <div className="flex flex-col w-56 shrink-0 border-l border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <History size={11} className="text-accent" />
          <span className="text-xs font-semibold text-fg">History</span>
          {queryHistory.length > 0 && (
            <span className="text-[9px] text-muted bg-elevated rounded-full px-1.5 py-0.5">{queryHistory.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {queryHistory.length > 0 && (
            <button
              onClick={handleClearHistory}
              title="Clear history"
              className="text-muted hover:text-danger transition-colors"
            >
              <Trash2 size={11} />
            </button>
          )}
          <button onClick={onClose} className="text-muted hover:text-fg transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Search */}
      {queryHistory.length > 3 && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <div className="relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-elevated border border-border rounded-[var(--radius-sm)] pl-6 pr-2 py-1 text-xs text-fg placeholder:text-faint outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-8">
            <History size={16} className="text-faint" />
            <p className="text-[10px] text-faint text-center">
              {search ? "No matches" : "No query history yet.\nRun a query to get started."}
            </p>
          </div>
        ) : (
          filtered.map((sql, index) => (
            <HistoryRow
              key={index}
              sql={sql}
              onLoad={onLoad}
              onRun={onRun}
            />
          ))
        )}
      </div>
    </div>
  );
}
