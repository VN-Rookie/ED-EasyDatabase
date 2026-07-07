import { useState, useEffect } from "react";
import { Loader2, ChevronRight, ChevronDown, Trash2, Copy, Check, AlertTriangle, Pencil, X, ChevronLeft, Download } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save as nativeSave } from "@tauri-apps/plugin-dialog";
import type { QueryResult, ColumnInfo } from "../../shared/types";
import type { OpenObject } from "../../stores/workspaceStore";
import { FilterBar } from "../../components/FilterBar";
import { ensureMongoDb, describeTable, countRows, runQuery } from "./objectApi";
import { useToast } from "../../components/Toast";

// ── JSON tree ─────────────────────────────────────────────────────────────────

function detectBsonType(value: unknown): string | null {
  if (typeof value === "string") {
    if (/^[0-9a-f]{24}$/.test(value)) return "ObjectId";
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(value)) return "Date";
  }
  return null;
}

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);

  if (value === null || value === undefined)
    return <span className="text-[10px] text-muted italic select-none">null</span>;
  if (typeof value === "boolean")
    return <span className={`font-mono text-[11px] ${value ? "text-emerald-400" : "text-rose-400"}`}>{String(value)}</span>;
  if (typeof value === "number")
    return <span className="text-amber-300 font-mono text-[11px]">{value}</span>;
  if (typeof value === "string") {
    const display = value.length > 90 ? `${value.slice(0, 90)}…` : value;
    return <span className="text-emerald-400 font-mono text-[11px] break-all" title={value.length > 90 ? value : undefined}>&quot;{display}&quot;</span>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-muted font-mono text-[11px]">[]</span>;
    return (
      <span>
        <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-0.5 text-muted hover:text-fg font-mono text-[11px] cursor-pointer">
          {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          <span className="text-faint ml-0.5">Array({value.length})</span>
        </button>
        {open && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
            {value.map((item, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <span className="text-faint font-mono text-[10px] shrink-0 mt-0.5">{i}</span>
                <JsonNode value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return <span className="text-muted font-mono text-[11px]">{"{}"}</span>;
    return (
      <span>
        <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-0.5 text-muted hover:text-fg font-mono text-[11px] cursor-pointer">
          {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          <span className="text-faint ml-0.5">Object({entries.length})</span>
        </button>
        {open && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
            {entries.map(([k, v]) => (
              <div key={k} className="flex gap-1.5 items-start">
                <span className="text-sky-400/80 font-mono text-[10px] shrink-0 mt-0.5">{k}:</span>
                <JsonNode value={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span className="text-fg font-mono text-[11px]">{String(value)}</span>;
}

// ── Document delete modal ─────────────────────────────────────────────────────

function DocDeleteModal({ doc, index, onConfirm, onCancel }: {
  doc: Record<string, unknown>; index: number;
  onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") onConfirm(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div className="bg-elevated border border-border rounded-2xl w-[340px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-fg">Delete document #{index + 1}?</h3>
            <p className="text-xs text-muted mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <div className="mx-5 mb-4 bg-surface border border-border rounded-xl px-3 py-2.5 space-y-1">
          {Object.entries(doc).slice(0, 3).map(([k, v]) => (
            <div key={k} className="flex gap-2 items-baseline">
              <span className="text-[10px] text-muted font-mono shrink-0 w-20 truncate">{k}</span>
              <span className="text-[11px] text-fg truncate">{String(v ?? "null").slice(0, 40)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button onClick={onCancel} className="text-xs text-muted hover:text-fg px-4 py-2 rounded-xl hover:bg-hover transition-all cursor-pointer">Cancel</button>
          <button onClick={onConfirm} autoFocus className="text-xs text-white font-semibold px-5 py-2 rounded-xl focus:outline-none cursor-pointer"
            style={{ background: "linear-gradient(135deg,#f43f5e,#e11d48)", boxShadow: "0 4px 12px rgba(244,63,94,0.25)" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk delete modal ─────────────────────────────────────────────────────────

function BulkDeleteModal({ count, onConfirm, onCancel }: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") onConfirm(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div className="bg-elevated border border-border rounded-2xl w-[340px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-fg">Delete {count} documents?</h3>
            <p className="text-xs text-muted mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button onClick={onCancel} className="text-xs text-muted hover:text-fg px-4 py-2 rounded-xl hover:bg-hover transition-all cursor-pointer">Cancel</button>
          <button onClick={onConfirm} autoFocus className="text-xs text-white font-semibold px-5 py-2 rounded-xl focus:outline-none cursor-pointer"
            style={{ background: "linear-gradient(135deg,#f43f5e,#e11d48)", boxShadow: "0 4px 12px rgba(244,63,94,0.25)" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit document JSON modal ──────────────────────────────────────────────

function EditDocumentModal({ doc, onSave, onCancel }: {
  doc: Record<string, unknown>;
  onSave: (idHex: string, json: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [json, setJson] = useState(() => JSON.stringify(doc, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isValid = (() => { try { JSON.parse(json); return true; } catch { return false; } })();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);

  const handleSave = async () => {
    if (!isValid) { setError("Fix JSON syntax before saving"); return; }
    const idHex = String(doc._id ?? "");
    setError(null); setLoading(true);
    try { await onSave(idHex, json); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div className="bg-elevated border border-border rounded-2xl w-[580px] max-w-[95vw] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-fg">Edit Document</h3>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-mono ${isValid ? "text-emerald-400" : "text-rose-400"}`}>
              {isValid ? "✓ valid JSON" : "✗ invalid JSON"}
            </span>
            <button onClick={onCancel} className="text-muted hover:text-fg transition-colors cursor-pointer p-1"><X size={14} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
          <textarea value={json} onChange={e => { setJson(e.target.value); setError(null); }}
            rows={16} spellCheck={false}
            className={`flex-1 min-h-0 bg-surface border rounded-xl px-4 py-3 text-[12px] font-mono text-fg outline-none resize-none transition-colors ${
              isValid ? "border-border focus:border-blue-500/60" : "border-rose-500/40"
            }`}
          />
          {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5 shrink-0">
          <button onClick={onCancel} className="text-xs text-muted hover:text-fg px-4 py-2 rounded-xl hover:bg-hover transition-all cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={!isValid || loading}
            className="flex items-center gap-1.5 text-xs text-white font-semibold px-5 py-2 rounded-xl disabled:opacity-50 cursor-pointer"
            style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 4px 12px rgba(37,99,235,0.25)" }}>
            {loading && <Loader2 size={11} className="animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  index,
  onDelete,
  onEdit,
  onUpdateField,
  selectedIds,
  setSelectedIds,
}: {
  doc: Record<string, unknown>;
  index: number;
  onDelete?: (doc: Record<string, unknown>) => Promise<void>;
  onEdit?: (idHex: string, json: string) => Promise<void>;
  onUpdateField?: (idHex: string, key: string, newValue: unknown) => Promise<void>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cardExpanded, setCardExpanded] = useState(false);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValueText, setEditValueText] = useState("");
  const [fieldUpdating, setFieldUpdating] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleDelete = async () => {
    setShowDeleteModal(false);
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(doc); }
    finally { setDeleting(false); }
  };

  const handleSaveField = async (key: string) => {
    if (!onUpdateField) return;
    const idHex = doc._id ? String(doc._id) : "";
    if (!idHex) return;

    let parsedVal: unknown;
    try {
      parsedVal = JSON.parse(editValueText);
    } catch {
      if (editValueText === "true") parsedVal = true;
      else if (editValueText === "false") parsedVal = false;
      else if (!isNaN(Number(editValueText)) && editValueText.trim() !== "") parsedVal = Number(editValueText);
      else parsedVal = editValueText;
    }

    setFieldUpdating(true);
    try {
      await onUpdateField(idHex, key, parsedVal);
      setEditingField(null);
    } catch (e) {
      console.error(e);
    } finally {
      setFieldUpdating(false);
    }
  };

  const entries = Object.entries(doc);
  const idVal = doc._id !== undefined ? String(doc._id) : null;
  const isSelected = idVal ? selectedIds.has(idVal) : false;

  const displayEntries = cardExpanded ? entries : entries.slice(0, 5);

  return (
    <>
      <div className={`bg-surface/30 border rounded-xl hover:border-muted transition-colors group/card ${isSelected ? "border-accent/40 bg-accent/5" : "border-border"}`}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            {idVal && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(idVal)) next.delete(idVal);
                    else next.add(idVal);
                    return next;
                  });
                }}
                className="rounded border-border text-accent focus:ring-accent accent-accent bg-elevated cursor-pointer"
              />
            )}
            <button
              onClick={() => setCardExpanded((v) => !v)}
              className="p-0.5 text-muted hover:text-fg hover:bg-hover rounded transition-colors cursor-pointer"
              title={cardExpanded ? "Collapse card" : "Expand card"}
            >
              {cardExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            <span className="text-[10px] text-muted font-mono shrink-0">#{index + 1}</span>
            {idVal && (
              <span className="text-[10px] text-muted font-mono truncate" title={idVal}>
                {idVal.length > 30 ? `${idVal.slice(0, 30)}…` : idVal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
            <button
              onClick={handleCopy}
              title="Copy as JSON"
              className="p-1 rounded-lg text-muted hover:text-blue-400 hover:bg-hover transition-all cursor-pointer"
            >
              {copied ? <Check size={11} className="text-blue-400" /> : <Copy size={11} />}
            </button>
            {onEdit && (
              <button
                onClick={() => setShowEditModal(true)}
                title="Edit document JSON"
                className="p-1 rounded-lg text-muted hover:text-emerald-400 hover:bg-hover transition-all cursor-pointer"
              >
                <Pencil size={11} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={deleting}
                title="Delete document"
                className="p-1 rounded-lg text-muted hover:text-rose-400 hover:bg-hover transition-all cursor-pointer disabled:opacity-50"
              >
                {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              </button>
            )}
          </div>
        </div>
        <div className="px-3 py-2 space-y-1">
          {displayEntries.map(([key, value]) => {
            const badge = detectBsonType(value);
            const isEditing = editingField === key;

            return (
              <div key={key} className="flex gap-2 items-start group/field min-h-5">
                <div className="flex items-center gap-1 shrink-0 w-32">
                  <span className="text-[11px] font-mono text-sky-400/80 truncate" title={key}>
                    {key}
                  </span>
                  {badge && <span className="text-[9px] text-muted bg-border/50 px-1 rounded shrink-0">{badge}</span>}
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="text"
                      value={editValueText}
                      onChange={(e) => setEditValueText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveField(key);
                        if (e.key === "Escape") setEditingField(null);
                      }}
                      className="bg-elevated border border-border rounded px-1.5 py-0.5 text-[11px] font-mono text-fg outline-none flex-1 focus:border-accent"
                      autoFocus
                      disabled={fieldUpdating}
                    />
                    <button
                      onClick={() => handleSaveField(key)}
                      disabled={fieldUpdating}
                      className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors cursor-pointer"
                      title="Save"
                    >
                      {fieldUpdating ? <Loader2 size={10} className="animate-spin" /> : <Check size={11} />}
                    </button>
                    <button
                      onClick={() => setEditingField(null)}
                      disabled={fieldUpdating}
                      className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                      title="Cancel"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <JsonNode value={value} depth={0} />
                    </div>
                    {key !== "_id" && onUpdateField && (
                      <button
                        onClick={() => {
                          setEditingField(key);
                          setEditValueText(typeof value === "object" ? JSON.stringify(value) : String(value));
                        }}
                        className="opacity-0 group-hover/field:opacity-100 p-0.5 rounded hover:bg-hover text-muted hover:text-fg transition-all cursor-pointer shrink-0"
                        title="Edit value inline"
                      >
                        <Pencil size={9} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!cardExpanded && entries.length > 5 && (
            <button
              onClick={() => setCardExpanded(true)}
              className="text-[10px] text-accent hover:underline pl-32 font-medium cursor-pointer"
            >
              + {entries.length - 5} more fields…
            </button>
          )}
          {cardExpanded && entries.length > 5 && (
            <button
              onClick={() => setCardExpanded(false)}
              className="text-[10px] text-accent hover:underline pl-32 font-medium cursor-pointer"
            >
              Show less
            </button>
          )}
        </div>
      </div>
      {showDeleteModal && (
        <DocDeleteModal doc={doc} index={index} onConfirm={handleDelete} onCancel={() => setShowDeleteModal(false)} />
      )}
      {showEditModal && onEdit && (
        <EditDocumentModal
          doc={doc}
          onSave={async (id, json) => {
            await onEdit(id, json);
            setShowEditModal(false);
          }}
          onCancel={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}

// ── Insert document form ──────────────────────────────────────────────────────

function InsertDocumentForm({ onInsert, onCancel }: {
  onInsert: (json: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [json, setJson] = useState('{\n  \n}');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isValid = (() => { try { JSON.parse(json); return true; } catch { return false; } })();

  const handleSubmit = async () => {
    if (!isValid) { setError("Invalid JSON — fix syntax before inserting"); return; }
    setError(null); setLoading(true);
    try { await onInsert(json); setJson('{\n  \n}'); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="border border-dashed border-border rounded-xl p-3 space-y-2 bg-surface/20">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-fg font-medium">New document</span>
        <span className={`text-[10px] font-mono ${isValid ? "text-emerald-500" : "text-rose-400"}`}>
          {isValid ? "✓ valid JSON" : "✗ invalid JSON"}
        </span>
      </div>
      <textarea value={json} onChange={e => { setJson(e.target.value); setError(null); }}
        rows={6} spellCheck={false}
        className={`w-full bg-surface border rounded-xl px-3 py-2 text-[11px] font-mono text-fg outline-none resize-y transition-colors ${
          isValid ? "border-border focus:border-emerald-500/50" : "border-rose-500/40"
        }`}
      />
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={!isValid || loading}
          className="flex items-center gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 cursor-pointer transition-colors">
          {loading && <Loader2 size={11} className="animate-spin" />} Insert document
        </button>
        <button onClick={onCancel} className="text-xs text-muted hover:text-fg px-3 py-1.5 rounded-lg hover:bg-hover cursor-pointer transition-all">Cancel</button>
      </div>
    </div>
  );
}

// ── DocumentView ──────────────────────────────────────────────────────────────

export function DocumentView({ object }: { object: OpenObject }) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [mongoFilter, setMongoFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showInsert, setShowInsert] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const { toast } = useToast();

  // Reset pagination/filters/selections when switching collections
  useEffect(() => {
    setPage(0);
    setMongoFilter("");
    setAppliedFilter("");
    setResult(null);
    setSelectedIds(new Set());
  }, [object.id]);

  // Fetch metadata: columns structure and count
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        await ensureMongoDb(object);
        const [cols, total] = await Promise.all([
          describeTable(object.connId, object.table),
          countRows(object.connId, object.table),
        ]);
        setColumns(cols);
        setTotalRows(total);
      } catch (e) {
        console.error("Failed to load MongoDB metadata:", e);
      }
    };
    fetchMeta();
  }, [object.connId, object.table, refreshKey]);

  // Load documents
  useEffect(() => {
    setLoading(true);
    setError(null);
    const fetchPage = async () => {
      try {
        await ensureMongoDb(object);
        const filterStr = appliedFilter.trim();
        const filterJson = filterStr || "{}";
        const queryStr = `db.${object.table}.find(${filterJson}).limit(${pageSize}).skip(${page * pageSize})`;
        const data = await runQuery(object.connId, queryStr);
        setResult(data);
        // Clear old selections when new page loads
        setSelectedIds(new Set());
      } catch (e) {
        setError(String(e));
        setResult(null);
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
  }, [object.connId, object.table, page, pageSize, appliedFilter, refreshKey]);

  const handleInsert = async (json: string) => {
    const document = JSON.parse(json);
    await invoke("insert_document", {
      connId: object.connId,
      input: {
        collection: object.table,
        document,
      }
    });
    setRefreshKey(k => k + 1);
  };

  const handleEdit = async (idHex: string, json: string) => {
    const replacement = JSON.parse(json);
    await invoke("replace_document", {
      connId: object.connId,
      input: {
        collection: object.table,
        filter: { _id: idHex },
        replacement,
      }
    });
    setRefreshKey(k => k + 1);
  };

  const handleUpdateField = async (idHex: string, key: string, newValue: unknown) => {
    await invoke("update_row", {
      connId: object.connId,
      input: {
        table: object.table,
        pk_column: "_id",
        pk_value: idHex,
        values: { [key]: newValue },
      }
    });
    setRefreshKey(k => k + 1);
  };

  const handleDelete = async (doc: Record<string, unknown>) => {
    const idHex = doc._id ? String(doc._id) : "";
    if (!idHex) return;
    await invoke("delete_documents", {
      connId: object.connId,
      input: {
        collection: object.table,
        filter: { _id: idHex },
      }
    });
    setRefreshKey(k => k + 1);
  };

  const handleBulkDelete = async () => {
    setShowBulkDelete(false);
    if (selectedIds.size === 0) return;
    setLoading(true);
    try {
      const promises = Array.from(selectedIds).map(async (idHex) => {
        await invoke("delete_documents", {
          connId: object.connId,
          input: {
            collection: object.table,
            filter: { _id: idHex },
          }
        });
      });
      await Promise.all(promises);
      setSelectedIds(new Set());
      setRefreshKey(k => k + 1);
      toast(`Successfully deleted ${promises.length} documents`, "success");
    } catch (e) {
      toast(`Delete failed: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!result || result.rows.length === 0) return;

    // Collect all unique keys in the current batch
    const uniqueKeys = new Set<string>();
    result.rows.forEach((row) => {
      Object.keys(row).forEach((k) => uniqueKeys.add(k));
    });
    const headerCols = Array.from(uniqueKeys);

    const header = headerCols.join(",");
    const csvRows = result.rows.map((row) =>
      headerCols
        .map((col) => {
          const val = (row as Record<string, unknown>)[col];
          const str = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""').replace(/\n/g, " ").replace(/\r/g, "")}"`;
        })
        .join(",")
    );
    const csvContent = [header, ...csvRows].join("\n");

    try {
      const filePath = await nativeSave({
        defaultPath: `${object.table}_export.csv`,
        filters: [
          { name: "CSV", extensions: ["csv"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (!filePath) return;

      await invoke("save_to_file", { path: filePath, content: csvContent });
      const name = filePath.split(/[/\\]/).pop() ?? filePath;
      toast(`Successfully exported ${result.rows.length} documents to ${name}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
  };

  const handleApplyFilter = () => {
    setPage(0);
    setAppliedFilter(mongoFilter);
  };

  const allPageIds = result
    ? result.rows
        .map((r) => (r._id !== undefined ? String(r._id) : null))
        .filter((id): id is string => id !== null)
    : [];
  const isAllSelected = allPageIds.length > 0 && selectedIds.size === allPageIds.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* MongoDB Filter Bar */}
      <FilterBar
        columns={columns.map((c) => c.name)}
        columnMeta={columns.map((c) => ({ name: c.name, data_type: c.data_type }))}
        filters={[]}
        onChange={() => {}}
        onApply={handleApplyFilter}
        isMongo={true}
        mongoFilter={mongoFilter}
        onMongoFilterChange={setMongoFilter}
        hasActiveFilter={mongoFilter.trim() !== "" && mongoFilter.trim() !== "{}"}
      />

      {/* Pagination Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          {result && result.rows.length > 0 && (
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIds(new Set(allPageIds));
                } else {
                  setSelectedIds(new Set());
                }
              }}
              className="rounded border-border text-accent focus:ring-accent accent-accent bg-elevated cursor-pointer"
              title="Select all on this page"
            />
          )}
          <span className="text-[11px] text-muted">
            {!result || result.rows.length === 0
              ? "0 documents"
              : `${(page * pageSize + 1).toLocaleString()}–${(page * pageSize + result.rows.length).toLocaleString()} of ${
                  totalRows !== null ? totalRows.toLocaleString() : "…"
                } documents`}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0 || loading}
              className="p-1 rounded-[var(--radius-sm)] text-muted hover:text-fg hover:bg-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Previous page"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="text-[11px] text-muted px-1">
              {page + 1}{totalRows !== null ? ` / ${Math.max(1, Math.ceil(totalRows / pageSize))}` : ""}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={(totalRows !== null && (page + 1) * pageSize >= totalRows) || loading || (result ? result.rows.length < pageSize : false)}
              className="p-1 rounded-[var(--radius-sm)] text-muted hover:text-fg hover:bg-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Next page"
            >
              <ChevronRight size={12} />
            </button>
          </div>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="bg-elevated border border-border rounded-[var(--radius-sm)] text-[10px] text-muted px-1.5 py-0.5 focus:outline-none"
            title="Documents per page"
          >
            <option value={50}>50 documents</option>
            <option value={100}>100 documents</option>
            <option value={250}>250 documents</option>
            <option value={500}>500 documents</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkDelete(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] bg-danger/10 hover:bg-danger/20 text-danger text-xs font-medium transition-colors cursor-pointer"
              title="Delete selected documents"
            >
              <Trash2 size={11} />
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={!result || result.rows.length === 0}
            className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer disabled:opacity-30"
            title="Export filtered documents to CSV"
          >
            <Download size={11} />
            Export
          </button>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
            title="Refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-3 min-h-0">
        {loading && !result ? (
          <div className="h-full flex items-center justify-center text-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4">
            <pre className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 whitespace-pre-wrap break-words">{error}</pre>
          </div>
        ) : !result || result.rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted">
            <p className="text-sm">{result ? "No documents found" : "Select a collection to browse"}</p>
            {!showInsert && (
              <button onClick={() => setShowInsert(true)}
                className="text-xs text-emerald-500 hover:text-emerald-400 border border-emerald-800/40 rounded-lg px-3 py-1.5 hover:bg-emerald-900/20 cursor-pointer transition-all">
                + Insert document
              </button>
            )}
            {showInsert && (
              <div className="w-full max-w-lg px-4">
                <InsertDocumentForm onInsert={async json => { await handleInsert(json); setShowInsert(false); }} onCancel={() => setShowInsert(false)} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {result.rows.map((row, i) => (
              <DocumentCard
                key={i}
                doc={row as Record<string, unknown>}
                index={page * pageSize + i}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onUpdateField={handleUpdateField}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
              />
            ))}
            <div className="pt-1 pb-2">
              {showInsert ? (
                <InsertDocumentForm onInsert={async json => { await handleInsert(json); setShowInsert(false); }} onCancel={() => setShowInsert(false)} />
              ) : (
                <button onClick={() => setShowInsert(true)}
                  className="w-full text-[11px] text-muted hover:text-fg flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-border hover:border-muted cursor-pointer transition-all">
                  + Insert document
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {showBulkDelete && (
        <BulkDeleteModal
          count={selectedIds.size}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDelete(false)}
        />
      )}
    </div>
  );
}
