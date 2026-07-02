import { useState, useEffect } from "react";
import { Loader2, ChevronRight, ChevronDown, Trash2, Copy, Check, AlertTriangle, Pencil, X } from "lucide-react";
import type { QueryResult } from "../types";

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
    return <span className="text-[10px] text-[#7d8590]/70 italic select-none">null</span>;
  if (typeof value === "boolean")
    return <span className={`font-mono text-[11px] ${value ? "text-emerald-400" : "text-rose-400"}`}>{String(value)}</span>;
  if (typeof value === "number")
    return <span className="text-amber-300 font-mono text-[11px]">{value}</span>;
  if (typeof value === "string") {
    const display = value.length > 90 ? `${value.slice(0, 90)}…` : value;
    return <span className="text-emerald-400 font-mono text-[11px] break-all" title={value.length > 90 ? value : undefined}>&quot;{display}&quot;</span>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-[#7d8590] font-mono text-[11px]">[]</span>;
    return (
      <span>
        <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-0.5 text-[#7d8590] hover:text-[#e6edf3] font-mono text-[11px] cursor-pointer">
          {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          <span className="text-[#484f58] ml-0.5">Array({value.length})</span>
        </button>
        {open && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[#30363d] pl-2">
            {value.map((item, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <span className="text-[#484f58] font-mono text-[10px] shrink-0 mt-0.5">{i}</span>
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
    if (!entries.length) return <span className="text-[#7d8590] font-mono text-[11px]">{"{}"}</span>;
    return (
      <span>
        <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-0.5 text-[#7d8590] hover:text-[#e6edf3] font-mono text-[11px] cursor-pointer">
          {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          <span className="text-[#484f58] ml-0.5">Object({entries.length})</span>
        </button>
        {open && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[#30363d] pl-2">
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
  return <span className="text-[#e6edf3] font-mono text-[11px]">{String(value)}</span>;
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
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-[340px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#e6edf3]">Delete document #{index + 1}?</h3>
            <p className="text-xs text-[#7d8590] mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <div className="mx-5 mb-4 bg-[#21262d] border border-[#30363d] rounded-xl px-3 py-2.5 space-y-1">
          {Object.entries(doc).slice(0, 3).map(([k, v]) => (
            <div key={k} className="flex gap-2 items-baseline">
              <span className="text-[10px] text-[#7d8590] font-mono shrink-0 w-20 truncate">{k}</span>
              <span className="text-[11px] text-[#e6edf3] truncate">{String(v ?? "null").slice(0, 40)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button onClick={onCancel} className="text-xs text-[#7d8590] hover:text-[#e6edf3] px-4 py-2 rounded-xl hover:bg-[#292e36] transition-all cursor-pointer">Cancel</button>
          <button onClick={onConfirm} autoFocus className="text-xs text-white font-semibold px-5 py-2 rounded-xl focus:outline-none cursor-pointer"
            style={{ background: "linear-gradient(135deg,#f43f5e,#e11d48)", boxShadow: "0 4px 12px rgba(244,63,94,0.25)" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── P3: Edit document JSON modal ──────────────────────────────────────────────

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
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-[580px] max-w-[95vw] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] shrink-0">
          <h3 className="text-sm font-semibold text-[#e6edf3]">Edit Document</h3>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-mono ${isValid ? "text-emerald-400" : "text-rose-400"}`}>
              {isValid ? "✓ valid JSON" : "✗ invalid JSON"}
            </span>
            <button onClick={onCancel} className="text-[#7d8590] hover:text-[#e6edf3] transition-colors cursor-pointer p-1"><X size={14} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
          <textarea value={json} onChange={e => { setJson(e.target.value); setError(null); }}
            rows={16} spellCheck={false}
            className={`flex-1 min-h-0 bg-[#0d1117] border rounded-xl px-4 py-3 text-[12px] font-mono text-[#e6edf3] outline-none resize-none transition-colors ${
              isValid ? "border-[#30363d] focus:border-blue-500/60" : "border-rose-500/40"
            }`}
          />
          {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5 shrink-0">
          <button onClick={onCancel} className="text-xs text-[#7d8590] hover:text-[#e6edf3] px-4 py-2 rounded-xl hover:bg-[#292e36] transition-all cursor-pointer">Cancel</button>
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

function DocumentCard({ doc, index, onDelete, onEdit }: {
  doc: Record<string, unknown>;
  index: number;
  onDelete?: (doc: Record<string, unknown>) => Promise<void>;
  onEdit?: (idHex: string, json: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  };

  const handleDelete = async () => {
    setShowDeleteModal(false);
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(doc); } finally { setDeleting(false); }
  };

  const entries = Object.entries(doc);
  const idVal = doc._id !== undefined ? String(doc._id) : null;

  return (
    <>
    <div className="bg-[#21262d]/50 border border-[#30363d] rounded-xl hover:border-[#484f58] transition-colors group">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#30363d]/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-[#7d8590] font-mono shrink-0">#{index + 1}</span>
          {idVal && <span className="text-[10px] text-[#7d8590] font-mono truncate" title={idVal}>{idVal.length > 30 ? `${idVal.slice(0, 30)}…` : idVal}</span>}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={handleCopy} title="Copy as JSON"
            className="p-1 rounded-lg text-[#7d8590] hover:text-blue-400 hover:bg-[#292e36] transition-all cursor-pointer">
            {copied ? <Check size={11} className="text-blue-400" /> : <Copy size={11} />}
          </button>
          {onEdit && (
            <button onClick={() => setShowEditModal(true)} title="Edit document"
              className="p-1 rounded-lg text-[#7d8590] hover:text-emerald-400 hover:bg-[#292e36] transition-all cursor-pointer">
              <Pencil size={11} />
            </button>
          )}
          {onDelete && (
            <button onClick={() => setShowDeleteModal(true)} disabled={deleting} title="Delete document"
              className="p-1 rounded-lg text-[#7d8590] hover:text-rose-400 hover:bg-[#292e36] transition-all cursor-pointer disabled:opacity-50">
              {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </button>
          )}
        </div>
      </div>
      <div className="px-3 py-2 space-y-1">
        {entries.map(([key, value]) => {
          const badge = detectBsonType(value);
          return (
            <div key={key} className="flex gap-2 items-start">
              <div className="flex items-center gap-1 shrink-0 w-32">
                <span className="text-[11px] font-mono text-sky-400/80 truncate" title={key}>{key}</span>
                {badge && <span className="text-[9px] text-[#7d8590] bg-[#30363d]/50 px-1 rounded shrink-0">{badge}</span>}
              </div>
              <div className="flex-1 min-w-0"><JsonNode value={value} depth={0} /></div>
            </div>
          );
        })}
      </div>
    </div>
    {showDeleteModal && <DocDeleteModal doc={doc} index={index} onConfirm={handleDelete} onCancel={() => setShowDeleteModal(false)} />}
    {showEditModal && onEdit && <EditDocumentModal doc={doc} onSave={async (id, json) => { await onEdit(id, json); setShowEditModal(false); }} onCancel={() => setShowEditModal(false)} />}
    </>
  );
}

// ── Insert document form ──────────────────────────────────────────────────────

export function InsertDocumentForm({ onInsert, onCancel }: {
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
    <div className="border border-dashed border-[#484f58] rounded-xl p-3 space-y-2 bg-[#21262d]/20">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#e6edf3] font-medium">New document</span>
        <span className={`text-[10px] font-mono ${isValid ? "text-emerald-500" : "text-rose-400"}`}>
          {isValid ? "✓ valid JSON" : "✗ invalid JSON"}
        </span>
      </div>
      <textarea value={json} onChange={e => { setJson(e.target.value); setError(null); }}
        rows={6} spellCheck={false}
        className={`w-full bg-[#0d1117] border rounded-xl px-3 py-2 text-[11px] font-mono text-[#e6edf3] outline-none resize-y transition-colors ${
          isValid ? "border-[#30363d] focus:border-emerald-500/50" : "border-rose-500/40"
        }`}
      />
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={!isValid || loading}
          className="flex items-center gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 cursor-pointer transition-colors">
          {loading && <Loader2 size={11} className="animate-spin" />} Insert document
        </button>
        <button onClick={onCancel} className="text-xs text-[#7d8590] hover:text-[#e6edf3] px-3 py-1.5 rounded-lg hover:bg-[#292e36] cursor-pointer transition-all">Cancel</button>
      </div>
    </div>
  );
}

// ── DocumentView ──────────────────────────────────────────────────────────────

interface Props {
  result: QueryResult | null;
  loading?: boolean;
  error?: string | null;
  onDelete?: (row: Record<string, unknown>) => Promise<void>;
  onInsert?: (json: string) => Promise<void>;
  onEdit?: (idHex: string, json: string) => Promise<void>;
}

export function DocumentView({ result, loading, error, onDelete, onInsert, onEdit }: Props) {
  const [showInsert, setShowInsert] = useState(false);

  if (loading) return <div className="flex-1 flex items-center justify-center text-[#7d8590]"><Loader2 size={20} className="animate-spin" /></div>;

  if (error) return (
    <div className="flex-1 p-4">
      <pre className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 whitespace-pre-wrap break-words">{error}</pre>
    </div>
  );

  if (!result || result.rows.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#7d8590]">
      <p className="text-sm">{result ? "No documents found" : "Select a collection to browse"}</p>
      {onInsert && !showInsert && (
        <button onClick={() => setShowInsert(true)}
          className="text-xs text-emerald-500 hover:text-emerald-400 border border-emerald-800/40 rounded-lg px-3 py-1.5 hover:bg-emerald-900/20 cursor-pointer transition-all">
          + Insert document
        </button>
      )}
      {onInsert && showInsert && (
        <div className="w-full max-w-lg px-4">
          <InsertDocumentForm onInsert={async json => { await onInsert(json); setShowInsert(false); }} onCancel={() => setShowInsert(false)} />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 overflow-auto p-3 space-y-2">
      {result.rows.map((row, i) => (
        <DocumentCard key={i} doc={row as Record<string, unknown>} index={i} onDelete={onDelete} onEdit={onEdit} />
      ))}
      {onInsert && (
        <div className="pt-1 pb-2">
          {showInsert ? (
            <InsertDocumentForm onInsert={async json => { await onInsert(json); setShowInsert(false); }} onCancel={() => setShowInsert(false)} />
          ) : (
            <button onClick={() => setShowInsert(true)}
              className="w-full text-[11px] text-[#7d8590] hover:text-[#e6edf3] flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-[#30363d] hover:border-[#484f58] cursor-pointer transition-all">
              + Insert document
            </button>
          )}
        </div>
      )}
    </div>
  );
}
