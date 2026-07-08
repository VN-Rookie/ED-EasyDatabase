import { useState, useEffect } from "react";
import { Loader2, ChevronRight, ChevronDown, Trash2, Copy, Check, AlertTriangle, Pencil, X, ChevronLeft, Download, MoreVertical } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save as nativeSave } from "@tauri-apps/plugin-dialog";
import type { QueryResult, ColumnInfo } from "../../shared/types";
import type { OpenObject } from "../../stores/workspaceStore";
import { FilterBar } from "../../components/FilterBar";
import { ensureMongoDb, describeTable, countRows, runQuery } from "./objectApi";
import { insertRow, updateRow, deleteRow } from "./editApi";
import { useToast } from "../../components/Toast";

// ── JSON tree ─────────────────────────────────────────────────────────────────

function detectBsonType(value: unknown): string | null {
  if (typeof value === "string") {
    if (/^[0-9a-f]{24}$/.test(value)) return "ObjectId";
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(value)) return "Date";
  }
  return null;
}

function JsonNode({
  value,
  depth = 0,
  onChange,
  isEditable = false,
}: {
  value: unknown;
  depth?: number;
  onChange?: (newValue: unknown) => void;
  isEditable?: boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const [isEditing, setIsEditing] = useState(false);
  const [editValueText, setEditValueText] = useState("");
  const [updating, setUpdating] = useState(false);

  const handleSaveLocal = async () => {
    let parsedVal: unknown;
    try {
      parsedVal = JSON.parse(editValueText);
    } catch {
      if (editValueText === "true") parsedVal = true;
      else if (editValueText === "false") parsedVal = false;
      else if (!isNaN(Number(editValueText)) && editValueText.trim() !== "") parsedVal = Number(editValueText);
      else parsedVal = editValueText;
    }
    setUpdating(true);
    try {
      if (onChange) {
        await onChange(parsedVal);
      }
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const renderPrimitive = () => {
    let element: React.ReactNode;
    if (value === null || value === undefined)
      element = <span className="text-[10px] text-muted italic select-none">null</span>;
    else if (typeof value === "boolean")
      element = <span className={`font-mono text-[11px] ${value ? "text-emerald-400" : "text-rose-400"}`}>{String(value)}</span>;
    else if (typeof value === "number")
      element = <span className="text-cyan-400 font-mono text-[11px]">{value}</span>;
    else if (typeof value === "string") {
      const bsonType = detectBsonType(value);
      if (bsonType === "ObjectId") {
        element = (
          <span className="font-mono text-[11px] break-all">
            <span className="text-purple-400 font-medium">ObjectId</span>
            <span className="text-muted">(</span>
            <span className="text-emerald-400">&quot;{value}&quot;</span>
            <span className="text-muted">)</span>
          </span>
        );
      } else if (bsonType === "Date") {
        element = (
          <span className="font-mono text-[11px] break-all">
            <span className="text-purple-400 font-medium">ISODate</span>
            <span className="text-muted">(</span>
            <span className="text-emerald-400">&quot;{value}&quot;</span>
            <span className="text-muted">)</span>
          </span>
        );
      } else {
        const display = value.length > 90 ? `${value.slice(0, 90)}…` : value;
        element = <span className="text-emerald-400 font-mono text-[11px] break-all" title={value.length > 90 ? value : undefined}>&quot;{display}&quot;</span>;
      }
    } else {
      element = <span className="text-fg font-mono text-[11px]">{String(value)}</span>;
    }

    if (isEditable) {
      return (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
            setEditValueText(typeof value === "object" ? JSON.stringify(value) : String(value));
          }}
          className="cursor-pointer hover:bg-hover/50 px-1 rounded transition-colors"
          title="Double-click to edit value"
        >
          {element}
        </span>
      );
    }
    return element;
  };

  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-1.5 min-w-0" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        <input
          type="text"
          value={editValueText}
          onChange={(e) => setEditValueText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveLocal();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="bg-elevated border border-border rounded px-1.5 py-0.5 text-[11px] font-mono text-fg outline-none w-48 focus:border-accent"
          autoFocus
          disabled={updating}
        />
        <button
          onClick={handleSaveLocal}
          disabled={updating}
          className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors cursor-pointer shrink-0"
          title="Save"
        >
          {updating ? <Loader2 size={10} className="animate-spin" /> : <Check size={11} />}
        </button>
        <button
          onClick={() => setIsEditing(false)}
          disabled={updating}
          className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition-colors cursor-pointer shrink-0"
          title="Cancel"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  if (value === null || value === undefined || typeof value !== "object") {
    return renderPrimitive();
  }

  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-muted font-mono text-[11px]">[]</span>;
    return (
      <span>
        <button
          onClick={() => setOpen(v => !v)}
          onDoubleClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-muted hover:text-fg font-mono text-[11px] cursor-pointer"
        >
          {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          <span className="text-faint ml-0.5">Array({value.length})</span>
        </button>
        {open && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
            {value.map((item, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <span className="text-faint font-mono text-[10px] shrink-0 mt-0.5">{i}</span>
                <JsonNode
                  value={item}
                  depth={depth + 1}
                  isEditable={isEditable}
                  onChange={(childNewValue) => {
                    const updatedValue = [...value];
                    updatedValue[i] = childNewValue;
                    onChange?.(updatedValue);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  // Object
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return <span className="text-muted font-mono text-[11px]">{"{}"}</span>;
  return (
    <span>
      <button
        onClick={() => setOpen(v => !v)}
        onDoubleClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-0.5 text-muted hover:text-fg font-mono text-[11px] cursor-pointer"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        <span className="text-faint ml-0.5">Object({entries.length})</span>
      </button>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-1.5 items-start">
              <span className="text-fg/90 font-mono text-[10px] shrink-0 mt-0.5">{k}:</span>
              <JsonNode
                value={v}
                depth={depth + 1}
                isEditable={isEditable}
                onChange={(childNewValue) => {
                  const updatedValue = { ...value, [k]: childNewValue };
                  onChange?.(updatedValue);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </span>
  );
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
  primaryKey = "_id",
  onDelete,
  onEdit,
  onUpdateField,
  selectedIds,
  setSelectedIds,
  isMongo = false,
}: {
  doc: Record<string, unknown>;
  index: number;
  primaryKey?: string;
  onDelete?: (doc: Record<string, unknown>) => Promise<void>;
  onEdit?: (idHex: string, json: string) => Promise<void>;
  onUpdateField?: (idHex: string, key: string, newValue: unknown) => Promise<void>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isMongo?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cardExpanded, setCardExpanded] = useState(false);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValueText, setEditValueText] = useState("");
  const [fieldUpdating, setFieldUpdating] = useState(false);

  const [activeFieldDropdown, setActiveFieldDropdown] = useState<string | null>(null);
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("string");
  const { toast } = useToast();

  useEffect(() => {
    if (!activeFieldDropdown) return;
    const handleGlobalClick = () => {
      setActiveFieldDropdown(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, [activeFieldDropdown]);

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
    const idHex = doc[primaryKey] ? String(doc[primaryKey]) : "";
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

  const handleDeleteField = async (key: string) => {
    if (!onEdit) return;
    const { [key]: _, ...updatedDoc } = doc;
    const idHex = doc[primaryKey] ? String(doc[primaryKey]) : "";
    if (idHex) {
      try {
        await onEdit(idHex, JSON.stringify(updatedDoc));
        toast("Field deleted successfully", "success");
      } catch (e) {
        console.error(e);
        toast(`Delete failed: ${e}`, "error");
      }
    }
  };

  const handleChangeFieldType = async (key: string, newType: string) => {
    if (!onEdit) return;
    const currentValue = doc[key];
    let convertedValue: unknown;

    if (newType === "string") {
      convertedValue = typeof currentValue === "object" ? JSON.stringify(currentValue) : String(currentValue);
    } else if (newType === "number") {
      const num = Number(currentValue);
      convertedValue = isNaN(num) ? 0 : num;
    } else if (newType === "boolean") {
      convertedValue = Boolean(currentValue);
    } else if (newType === "date") {
      convertedValue = new Date().toISOString();
    } else if (newType === "objectid") {
      convertedValue = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    } else if (newType === "null") {
      convertedValue = null;
    } else if (newType === "object") {
      convertedValue = {};
    } else if (newType === "array") {
      convertedValue = [];
    }

    const updatedDoc = { ...doc, [key]: convertedValue };
    const idHex = doc[primaryKey] ? String(doc[primaryKey]) : "";
    if (idHex) {
      try {
        await onEdit(idHex, JSON.stringify(updatedDoc));
        toast(`Field type changed to ${newType}`, "success");
      } catch (e) {
        console.error(e);
        toast(`Type change failed: ${e}`, "error");
      }
    }
  };

  const handleAddFieldSave = async () => {
    if (!newFieldName.trim() || !onEdit) return;
    const name = newFieldName.trim();
    if (name in doc) {
      toast("Field already exists", "error");
      return;
    }
    let defaultValue: unknown = "";
    if (newFieldType === "number") defaultValue = 0;
    else if (newFieldType === "boolean") defaultValue = false;
    else if (newFieldType === "date") defaultValue = new Date().toISOString();
    else if (newFieldType === "objectid") {
      defaultValue = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    } else if (newFieldType === "null") defaultValue = null;
    else if (newFieldType === "object") defaultValue = {};
    else if (newFieldType === "array") defaultValue = [];

    const updatedDoc = { ...doc, [name]: defaultValue };
    const idHex = doc[primaryKey] ? String(doc[primaryKey]) : "";
    if (idHex) {
      try {
        await onEdit(idHex, JSON.stringify(updatedDoc));
        setIsAddingField(false);
        toast("Field added successfully", "success");
      } catch (e) {
        console.error(e);
        toast(`Add field failed: ${e}`, "error");
      }
    }
  };

  const entries = Object.entries(doc);
  const idVal = doc[primaryKey] !== undefined ? String(doc[primaryKey]) : null;
  const isSelected = idVal ? selectedIds.has(idVal) : false;

  const displayEntries = cardExpanded ? entries : entries.slice(0, 5);

  return (
    <>
      <div className={`bg-surface/30 border rounded-xl transition-colors group/card ${isSelected ? "border-accent/40 bg-accent/5" : "border-border"}`}>
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
                  <span className="text-[11px] font-mono text-fg/90 truncate" title={key}>
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
                      <JsonNode
                        value={value}
                        depth={0}
                        isEditable={(isMongo || key !== primaryKey) && !!onUpdateField}
                        onChange={(newValue) => {
                          if (onUpdateField) {
                            const idHex = doc[primaryKey] ? String(doc[primaryKey]) : "";
                            if (idHex) {
                              return onUpdateField(idHex, key, newValue);
                            }
                          }
                          return Promise.resolve();
                        }}
                      />
                    </div>
                    {(isMongo || key !== primaryKey) && onUpdateField && (
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
                    {isMongo && onEdit && (
                      <div className="relative shrink-0 flex items-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveFieldDropdown(activeFieldDropdown === key ? null : key);
                          }}
                          className={`opacity-0 group-hover/field:opacity-100 p-0.5 rounded hover:bg-hover text-muted hover:text-fg transition-all cursor-pointer ${
                            activeFieldDropdown === key ? "opacity-100 bg-hover text-fg" : ""
                          }`}
                          title="Field Actions"
                        >
                          <MoreVertical size={9} />
                        </button>

                        {activeFieldDropdown === key && (
                          <div
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-1 z-50 bg-elevated border border-border rounded-[var(--radius-md)] shadow-lg anim-pop py-1 w-[130px] text-left"
                          >
                            <div className="px-2 py-0.5 text-[9px] text-muted uppercase font-semibold border-b border-border/55 mb-1 select-none">
                              Change Type
                            </div>
                            {(["string", "number", "boolean", "date", "objectid", "null", "object", "array"] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => {
                                  handleChangeFieldType(key, t);
                                  setActiveFieldDropdown(null);
                                }}
                                className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] text-fg hover:bg-hover transition-colors cursor-pointer text-left font-mono"
                              >
                                <span>{t}</span>
                                {detectBsonType(value) === t || (t === "string" && typeof value === "string" && !detectBsonType(value)) || (t === typeof value && !detectBsonType(value) && value !== null) || (t === "null" && value === null) ? (
                                  <span className="text-emerald-400 text-[10px]">✓</span>
                                ) : null}
                              </button>
                            ))}
                            <div className="my-1 border-t border-border"></div>
                            {key !== primaryKey && (
                              <button
                                onClick={() => {
                                  handleDeleteField(key);
                                  setActiveFieldDropdown(null);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1 text-[11px] text-danger hover:bg-hover transition-colors text-left cursor-pointer"
                              >
                                <Trash2 size={11} className="shrink-0" />
                                <span>Delete Field</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
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
          {isMongo && onEdit && (
            <div className="pl-32 pt-2 border-t border-border/30 mt-2">
              {isAddingField ? (
                <div className="flex items-center gap-1.5 min-w-0" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    placeholder="field_name"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    className="bg-elevated border border-border rounded px-1.5 py-0.5 text-[11px] font-mono text-fg outline-none w-28 focus:border-accent"
                    autoFocus
                  />
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value)}
                    className="bg-elevated border border-border rounded px-1 py-0.5 text-[11px] font-mono text-fg outline-none cursor-pointer"
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="date">Date</option>
                    <option value="objectid">ObjectId</option>
                    <option value="null">Null</option>
                    <option value="object">Object</option>
                    <option value="array">Array</option>
                  </select>
                  <button
                    onClick={handleAddFieldSave}
                    className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors cursor-pointer shrink-0"
                    title="Add Field"
                  >
                    <Check size={11} />
                  </button>
                  <button
                    onClick={() => setIsAddingField(false)}
                    className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition-colors cursor-pointer shrink-0"
                    title="Cancel"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsAddingField(true);
                    setNewFieldName("");
                    setNewFieldType("string");
                  }}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 hover:underline font-medium cursor-pointer flex items-center gap-0.5"
                >
                  + Add Field
                </button>
              )}
            </div>
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

  const isMongo = object.engine === "mongodb";
  const primaryKey = columns.find((c) => c.is_pk)?.name ?? "_id";

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
        console.error("Failed to load metadata:", e);
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
        let queryStr = "";
        if (isMongo) {
          const filterStr = appliedFilter.trim();
          const filterJson = filterStr || "{}";
          queryStr = `db.${object.table}.find(${filterJson}).limit(${pageSize}).skip(${page * pageSize})`;
        } else {
          const quoteIdent = (ident: string) => object.engine === "mysql" ? `\`${ident.replace(/`/g, "``")}\`` : `"${ident.replace(/"/g, '""')}"`;
          queryStr = `SELECT * FROM ${quoteIdent(object.table)}`;
          if (appliedFilter.trim()) {
            queryStr += ` WHERE ${appliedFilter}`;
          }
          queryStr += ` LIMIT ${pageSize} OFFSET ${page * pageSize}`;
        }
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
  }, [object.connId, object.table, object.engine, isMongo, page, pageSize, appliedFilter, refreshKey]);

  const handleInsert = async (json: string) => {
    const document = JSON.parse(json);
    if (isMongo) {
      await invoke("insert_document", {
        connId: object.connId,
        input: {
          collection: object.table,
          document,
        }
      });
    } else {
      await insertRow(object.connId, {
        table: object.table,
        values: document,
      });
    }
    setRefreshKey(k => k + 1);
  };

  const handleEdit = async (idHex: string, json: string) => {
    const replacement = JSON.parse(json);
    if (isMongo) {
      await invoke("replace_document", {
        connId: object.connId,
        input: {
          collection: object.table,
          filter: { _id: idHex },
          replacement,
        }
      });
    } else {
      await updateRow(object.connId, {
        table: object.table,
        pk_column: primaryKey,
        pk_value: idHex,
        values: replacement,
      });
    }
    setRefreshKey(k => k + 1);
  };

  const handleUpdateField = async (idHex: string, key: string, newValue: unknown) => {
    if (isMongo) {
      await invoke("update_row", {
        connId: object.connId,
        input: {
          table: object.table,
          pk_column: "_id",
          pk_value: idHex,
          values: { [key]: newValue },
        }
      });
    } else {
      await updateRow(object.connId, {
        table: object.table,
        pk_column: primaryKey,
        pk_value: idHex,
        values: { [key]: newValue },
      });
    }
    setRefreshKey(k => k + 1);
  };

  const handleDelete = async (doc: Record<string, unknown>) => {
    const idHex = doc[primaryKey] ? String(doc[primaryKey]) : "";
    if (!idHex) return;
    if (isMongo) {
      await invoke("delete_documents", {
        connId: object.connId,
        input: {
          collection: object.table,
          filter: { _id: idHex },
        }
      });
    } else {
      await deleteRow(object.connId, {
        table: object.table,
        pk_column: primaryKey,
        pk_value: idHex,
      });
    }
    setRefreshKey(k => k + 1);
  };

  const handleBulkDelete = async () => {
    setShowBulkDelete(false);
    if (selectedIds.size === 0) return;
    setLoading(true);
    try {
      const promises = Array.from(selectedIds).map(async (idHex) => {
        if (isMongo) {
          await invoke("delete_documents", {
            connId: object.connId,
            input: {
              collection: object.table,
              filter: { _id: idHex },
            }
          });
        } else {
          await deleteRow(object.connId, {
            table: object.table,
            pk_column: primaryKey,
            pk_value: idHex,
          });
        }
      });
      await Promise.all(promises);
      setSelectedIds(new Set());
      setRefreshKey(k => k + 1);
      toast(`Successfully deleted ${promises.length} items`, "success");
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
        .map((r) => (r[primaryKey] !== undefined ? String(r[primaryKey]) : null))
        .filter((id): id is string => id !== null)
    : [];
  const isAllSelected = allPageIds.length > 0 && selectedIds.size === allPageIds.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filter Bar */}
      {isMongo ? (
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
      ) : (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-1 flex-1 max-w-xs md:max-w-md">
            <input
              type="text"
              value={mongoFilter}
              onChange={(e) => setMongoFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
              placeholder="Filter (e.g. status = 'active')..."
              className="w-full bg-elevated border border-border rounded-[var(--radius-sm)] text-xs px-2.5 py-1 focus:outline-none focus:border-accent text-fg"
            />
            {mongoFilter && (
              <button
                onClick={() => {
                  setMongoFilter("");
                  setAppliedFilter("");
                }}
                className="text-[10px] text-muted hover:text-fg px-1 cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleApplyFilter}
              className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent hover:bg-accent-strong text-on-accent text-xs font-medium transition-colors cursor-pointer"
            >
              Filter
            </button>
          </div>
        </div>
      )}

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
              ? `0 ${isMongo ? "documents" : "rows"}`
              : `${(page * pageSize + 1).toLocaleString()}–${(page * pageSize + result.rows.length).toLocaleString()} of ${
                  totalRows !== null ? totalRows.toLocaleString() : "…"
                } ${isMongo ? "documents" : "rows"}`}
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
            title={`${isMongo ? "Documents" : "Rows"} per page`}
          >
            <option value={50}>50 {isMongo ? "documents" : "rows"}</option>
            <option value={100}>100 {isMongo ? "documents" : "rows"}</option>
            <option value={250}>250 {isMongo ? "documents" : "rows"}</option>
            <option value={500}>500 {isMongo ? "documents" : "rows"}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkDelete(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] bg-danger/10 hover:bg-danger/20 text-danger text-xs font-medium transition-colors cursor-pointer"
              title={`Delete selected ${isMongo ? "documents" : "rows"}`}
            >
              <Trash2 size={11} />
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={!result || result.rows.length === 0}
            className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer disabled:opacity-30"
            title={`Export filtered ${isMongo ? "documents" : "rows"} to CSV`}
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
            <p className="text-sm">{result ? (isMongo ? "No documents found" : "No rows found") : (isMongo ? "Select a collection to browse" : "Select a table to browse")}</p>
            {!showInsert && (
              <button onClick={() => setShowInsert(true)}
                className="text-xs text-emerald-500 hover:text-emerald-400 border border-emerald-800/40 rounded-lg px-3 py-1.5 hover:bg-emerald-900/20 cursor-pointer transition-all">
                {isMongo ? "+ Insert document" : "+ Insert row"}
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
                primaryKey={primaryKey}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onUpdateField={handleUpdateField}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                isMongo={isMongo}
              />
            ))}
            <div className="pt-1 pb-2">
              {showInsert ? (
                <InsertDocumentForm onInsert={async json => { await handleInsert(json); setShowInsert(false); }} onCancel={() => setShowInsert(false)} />
              ) : (
                <button onClick={() => setShowInsert(true)}
                  className="w-full text-[11px] text-muted hover:text-fg flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-border hover:border-muted cursor-pointer transition-all">
                  {isMongo ? "+ Insert document" : "+ Insert row"}
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
