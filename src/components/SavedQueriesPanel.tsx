import { useState } from "react";
import { Bookmark, Trash2, Play, X, Plus, Check } from "lucide-react";
import { useSavedQueries } from "../hooks/useSavedQueries";

interface Props {
  currentSql: string;
  onLoad: (sql: string) => void;
  onRun: (sql: string) => void;
  onClose: () => void;
}

export function SavedQueriesPanel({ currentSql, onLoad, onRun, onClose }: Props) {
  const { queries, save, remove } = useSavedQueries();
  const [savingName, setSavingName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  const handleSave = async () => {
    if (!savingName.trim() || !currentSql.trim()) return;
    setSaving(true);
    try {
      const q = await save(savingName.trim(), currentSql.trim());
      setFlashId(q.id);
      setTimeout(() => setFlashId(null), 2000);
      setSavingName("");
      setShowSaveForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#161b22] border-l border-[#30363d] w-56 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-1.5">
          <Bookmark size={14} className="text-[#7d8590]" />
          <span className="text-xs font-medium text-[#e6edf3]">Saved</span>
          {queries.length > 0 && (
            <span className="text-xs text-[#7d8590] bg-[#21262d] rounded-full px-1.5 py-0.5">{queries.length}</span>
          )}
        </div>
        <button onClick={onClose}
          className="text-[#7d8590] hover:text-[#e6edf3] p-0.5 rounded hover:bg-[#292e36] transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Save current SQL form */}
      <div className="px-2.5 py-2 border-b border-[#30363d] shrink-0">
        {showSaveForm ? (
          <div className="space-y-1.5">
            <input
              autoFocus
              value={savingName}
              onChange={e => setSavingName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setShowSaveForm(false); setSavingName(""); }
              }}
              placeholder="Query name…"
              className="w-full bg-[#21262d] border border-[#30363d] focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-[#e6edf3] outline-none placeholder:text-[#484f58] transition-colors"
            />
            <div className="flex gap-1.5">
              <button onClick={handleSave} disabled={saving || !savingName.trim()}
                className="flex-1 flex items-center justify-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-md py-1 transition-colors font-medium">
                <Check size={13} /> Save
              </button>
              <button onClick={() => { setShowSaveForm(false); setSavingName(""); }}
                className="text-xs text-[#7d8590] hover:text-[#e6edf3] px-2 py-1 rounded-md hover:bg-[#292e36] transition-colors">
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveForm(true)}
            disabled={!currentSql.trim()}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-[#7d8590] hover:text-[#e6edf3] border border-dashed border-[#30363d]/60 hover:border-[#484f58] rounded-md py-1.5 transition-colors disabled:opacity-30"
          >
            <Plus size={13} /> Save current query
          </button>
        )}
      </div>

      {/* Query list */}
      <div className="flex-1 overflow-y-auto">
        {queries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4 py-6">
            <Bookmark size={18} className="text-[#484f58]" />
            <p className="text-xs text-[#7d8590] leading-relaxed">No saved queries yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#30363d]/30">
            {queries.map(q => (
              <li key={q.id}
                className={`group px-2.5 py-2 transition-colors ${
                  flashId === q.id ? "bg-blue-900/10" : "hover:bg-[#21262d]/40"
                }`}>
                <div className="flex items-center justify-between gap-1">
                  <button onClick={() => onLoad(q.sql)}
                    className="text-xs text-[#e6edf3] font-medium text-left hover:text-blue-300 transition-colors flex-1 truncate"
                    title={q.sql}>
                    {q.name}
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onRun(q.sql)} title="Run query"
                      className="p-0.5 rounded hover:bg-[#292e36] text-[#7d8590] hover:text-green-400 transition-colors">
                      <Play size={13} />
                    </button>
                    <button onClick={() => remove(q.id)} title="Delete"
                      className="p-0.5 rounded hover:bg-[#292e36] text-[#7d8590] hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[#7d8590] font-mono mt-0.5 truncate" title={q.sql}>
                  {q.sql.slice(0, 50)}{q.sql.length > 50 ? "…" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
