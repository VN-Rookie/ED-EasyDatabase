import { useEffect, useState, useRef } from "react";
import { Bookmark, Trash2, Play, X, Plus, Check, Pencil } from "lucide-react";
import { useSavedQueries } from "../../hooks/useSavedQueries";
import type { SavedQuery } from "../../stores/savedQueriesStore";

interface Props {
  currentSql: string;
  onLoad: (sql: string) => void;
  onRun: (sql: string) => void;
  onClose: () => void;
}

function EditableRow({ q, onSave, onDelete, onLoad, onRun }: {
  q: SavedQuery;
  onSave: (id: string, name: string, sql: string) => Promise<unknown>;
  onDelete: (id: string) => void;
  onLoad: (sql: string) => void;
  onRun: (sql: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(q.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = async () => {
    if (name.trim() && name.trim() !== q.name) await onSave(q.id, name.trim(), q.sql);
    setEditing(false);
  };

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  return (
    <div className="group px-3 py-2 hover:bg-hover transition-colors border-b border-border/50 last:border-0">
      <div className="flex items-center gap-1.5">
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setName(q.name); setEditing(false); } }}
            onBlur={commit}
            className="flex-1 bg-elevated border border-accent rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs text-fg outline-none"
          />
        ) : (
          <button
            onClick={() => onLoad(q.sql)}
            className="flex-1 text-left text-xs text-fg font-medium truncate hover:text-accent transition-colors"
            title={q.sql}
          >
            {q.name}
          </button>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} title="Rename" className="p-0.5 rounded text-muted hover:text-fg hover:bg-elevated transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={() => onRun(q.sql)} title="Run" className="p-0.5 rounded text-muted hover:text-accent hover:bg-elevated transition-colors">
            <Play size={13} />
          </button>
          <button onClick={() => onDelete(q.id)} title="Delete" className="p-0.5 rounded text-muted hover:text-danger hover:bg-elevated transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <p className="text-xs text-faint font-mono mt-0.5 truncate">{q.sql.slice(0, 60)}{q.sql.length > 60 ? "…" : ""}</p>
    </div>
  );
}

export function SavedQueriesPanel({ currentSql, onLoad, onRun, onClose }: Props) {
  const { queries, load, save, remove, update } = useSavedQueries();
  const [saveName, setSaveName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!saveName.trim() || !currentSql.trim()) return;
    setSaving(true);
    try {
      await save(saveName.trim(), currentSql.trim());
      setSaveName("");
      setShowSaveForm(false);
    } finally {
      setSaving(false);
    }
  };

  const filtered = queries.filter((q) =>
    q.name.toLowerCase().includes(search.toLowerCase()) ||
    q.sql.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col w-56 shrink-0 border-l border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Bookmark size={14} className="text-accent" />
          <span className="text-xs font-semibold text-fg">Snippets</span>
          {queries.length > 0 && (
            <span className="text-xs text-muted bg-elevated rounded-full px-1.5 py-0.5">{queries.length}</span>
          )}
        </div>
        <button onClick={onClose} className="text-muted hover:text-fg transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Search */}
      {queries.length > 3 && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full bg-elevated border border-border rounded-[var(--radius-sm)] px-2 py-1 text-xs text-fg placeholder:text-faint outline-none focus:border-accent transition-colors"
          />
        </div>
      )}

      {/* Save current query */}
      <div className="px-2 py-2 border-b border-border shrink-0">
        {showSaveForm ? (
          <div className="space-y-1.5">
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setShowSaveForm(false); setSaveName(""); }
              }}
              placeholder="Snippet name…"
              className="w-full bg-elevated border border-border rounded-[var(--radius-sm)] px-2 py-1 text-xs text-fg placeholder:text-faint outline-none focus:border-accent transition-colors"
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleSave}
                disabled={saving || !saveName.trim()}
                className="flex-1 flex items-center justify-center gap-1 text-xs bg-accent hover:bg-accent-strong disabled:opacity-40 text-on-accent rounded-[var(--radius-sm)] py-1 transition-colors font-medium"
              >
                <Check size={13} /> Save
              </button>
              <button
                onClick={() => { setShowSaveForm(false); setSaveName(""); }}
                className="text-xs text-muted hover:text-fg px-2 py-1 rounded-[var(--radius-sm)] hover:bg-elevated transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveForm(true)}
            disabled={!currentSql.trim()}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted hover:text-fg border border-dashed border-border hover:border-fg/30 rounded-[var(--radius-sm)] py-1.5 transition-colors disabled:opacity-40"
          >
            <Plus size={13} /> Save current query
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-8">
            <Bookmark size={16} className="text-faint" />
            <p className="text-xs text-faint text-center">
              {search ? "No matches" : "No snippets yet.\nSave a query to get started."}
            </p>
          </div>
        ) : (
          filtered.map((q) => (
            <EditableRow
              key={q.id}
              q={q}
              onSave={update}
              onDelete={remove}
              onLoad={onLoad}
              onRun={onRun}
            />
          ))
        )}
      </div>
    </div>
  );
}
