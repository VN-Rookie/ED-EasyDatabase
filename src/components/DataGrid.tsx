import { useState, useCallback, useRef, useEffect } from "react";
import { ArrowUp, ArrowDown, Trash2, Download, Maximize2, Copy, X, Eye, EyeOff, Columns3, AlertTriangle, Save, RotateCcw } from "lucide-react";
import { useToast } from "./Toast";
import { invoke } from "@tauri-apps/api/core";
import { save as nativeSave } from "@tauri-apps/plugin-dialog";
import type { QueryResult } from "../types";

// ── Export helpers ────────────────────────────────────────────────────────────

async function saveWithDialog(
  content: string,
  defaultName: string,
  ext: "csv" | "json",
  toast: (msg: string, type?: "success" | "error" | "info" | "default") => void,
) {
  try {
    const path = await nativeSave({
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }, { name: "All Files", extensions: ["*"] }],
    });
    if (!path) return;
    await invoke("save_to_file", { path, content });
    const name = (path as string).split(/[/\\]/).pop() ?? path;
    toast(`Saved ${name}`, "success");
  } catch (e) {
    toast(String(e), "error");
  }
}

function buildCsv(result: QueryResult, rows?: Record<string, unknown>[]): string {
  const data = rows ?? (result.rows as Record<string, unknown>[]);
  const f = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""').replace(/\n/g, " ").replace(/\r/g, "")}"`;
  };
  return [[...result.columns.map(f)], ...data.map(r => result.columns.map(c => f(r[c])))].map(row => row.join(",")).join("\n");
}

function buildJson(result: QueryResult, rows?: Record<string, unknown>[]): string {
  return JSON.stringify(rows ?? result.rows, null, 2);
}

// P1: generate correct copy-as-insert depending on DB type
function rowToInsert(row: Record<string, unknown>, tableName: string | null, dbType?: string): string {
  if (dbType === "mongodb") {
    const clean = { ...row };
    return `db.${tableName ?? "collection"}.insertOne(${JSON.stringify(clean, null, 2)});`;
  }
  if (!tableName) return JSON.stringify(row, null, 2);
  const cols = Object.keys(row).map(c => `"${c.replace(/"/g, '""')}"`).join(", ");
  const vals = Object.values(row).map(v => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  }).join(", ");
  return `INSERT INTO "${tableName}" (${cols}) VALUES (${vals});`;
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

interface DeletePending { type: "single"; row: Record<string, unknown>; rowIdx: number; }

function DeleteConfirmModal({ pending, onConfirm, onCancel }: {
  pending: DeletePending; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") onConfirm(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, onConfirm]);

  const preview = Object.entries(pending.row).slice(0, 4);
  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-[360px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#e6edf3]">Delete row #{pending.rowIdx + 1}?</h3>
            <p className="text-xs text-[#7d8590] mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <div className="mx-5 mb-4 bg-[#21262d] border border-[#30363d] rounded-xl px-3 py-2.5 space-y-1">
          {preview.map(([k, v]) => (
            <div key={k} className="flex gap-2 items-baseline">
              <span className="text-[10px] text-[#7d8590] font-mono shrink-0 w-20 truncate">{k}</span>
              <span className="text-[11px] text-[#e6edf3] truncate">{v === null || v === undefined ? <span className="italic text-[#7d8590]">null</span> : String(v).slice(0, 50)}</span>
            </div>
          ))}
          {Object.keys(pending.row).length > 4 && <p className="text-[10px] text-[#484f58]">+{Object.keys(pending.row).length - 4} more fields</p>}
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button onClick={onCancel} className="text-xs text-[#7d8590] hover:text-[#e6edf3] px-4 py-2 rounded-xl hover:bg-[#292e36] transition-all cursor-pointer">
            Cancel <span className="text-[#484f58] text-[10px] ml-1">Esc</span>
          </button>
          <button onClick={onConfirm} autoFocus
            className="text-xs text-white font-semibold px-5 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/50 cursor-pointer"
            style={{ background: "linear-gradient(135deg,#f43f5e,#e11d48)", boxShadow: "0 4px 12px rgba(244,63,94,0.25)" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cell expand modal ─────────────────────────────────────────────────────────

function CellExpandModal({ col, value, onClose }: { col: string; value: unknown; onClose: () => void }) {
  const { toast } = useToast();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const raw = value === null || value === undefined ? "NULL"
    : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl w-[560px] max-w-[95vw] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] shrink-0">
          <span className="text-xs font-mono text-[#e6edf3]">
            <span className="text-sky-400">{col}</span>
            {typeof value === "object" && value !== null && (
              <span className="ml-2 text-[10px] text-[#7d8590] bg-[#21262d] border border-[#30363d] rounded px-1.5 py-0.5">JSON</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => { navigator.clipboard.writeText(raw); toast("Copied", "success"); onClose(); }}
              className="flex items-center gap-1 text-[11px] text-[#7d8590] hover:text-[#e6edf3] bg-[#21262d] hover:bg-[#292e36] border border-[#30363d] px-2 py-1 rounded-lg transition-all cursor-pointer">
              <Copy size={10} /> Copy
            </button>
            <button onClick={onClose} className="text-[#7d8590] hover:text-[#e6edf3] transition-colors cursor-pointer p-1"><X size={14} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono text-[#e6edf3] whitespace-pre-wrap break-words leading-relaxed">{raw}</pre>
        </div>
      </div>
    </div>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; rowIdx: number; col: string; row: Record<string, unknown>; }

function ContextMenu({ menu, tableName, dbType, onClose, onDelete, onCopy }: {
  menu: CtxMenu; tableName?: string; dbType?: string;
  onClose: () => void;
  onDelete?: (row: Record<string, unknown>) => void;
  onCopy: (text: string, label: string) => void;
}) {
  useEffect(() => {
    const h = () => onClose();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => window.addEventListener("click", h), 0);
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("click", h); window.removeEventListener("keydown", k); };
  }, [onClose]);

  const x = Math.min(menu.x, window.innerWidth - 210);
  const y = Math.min(menu.y, window.innerHeight - 170);
  const cellVal = menu.row[menu.col];
  const cellText = cellVal === null || cellVal === undefined ? "NULL"
    : typeof cellVal === "object" ? JSON.stringify(cellVal) : String(cellVal);

  const item = (label: string, onClick: () => void, danger = false) => (
    <button key={label}
      onClick={e => { e.stopPropagation(); onClick(); onClose(); }}
      className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
        danger ? "text-rose-400 hover:bg-rose-500/10" : "text-[#e6edf3] hover:bg-[#292e36]"
      }`}>
      {label}
    </button>
  );

  return (
    <div style={{ top: y, left: x, position: "fixed" }}
      className="z-50 bg-[#21262d] border border-[#30363d] rounded-xl shadow-2xl shadow-black/50 py-1.5 min-w-[190px]"
      onClick={e => e.stopPropagation()}>
      {item(`Copy "${menu.col}"`, () => onCopy(cellText, "Cell copied"))}
      {item("Copy row as JSON", () => onCopy(JSON.stringify(menu.row, null, 2), "Row copied as JSON"))}
      {item(dbType === "mongodb" ? "Copy as insertOne" : "Copy as SQL INSERT", () => onCopy(rowToInsert(menu.row, tableName ?? null, dbType), "INSERT copied"))}
      {onDelete && <>
        <div className="border-t border-[#30363d] my-1.5" />
        {item("Delete row", () => onDelete(menu.row), true)}
      </>}
    </div>
  );
}

// ── Column picker ─────────────────────────────────────────────────────────────

function ColumnPicker({ columns, hidden, onChange, onClose }: {
  columns: string[]; hidden: Set<string>;
  onChange: (s: Set<string>) => void; onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-col-picker]")) onClose();
    };
    setTimeout(() => window.addEventListener("click", h), 0);
    return () => window.removeEventListener("click", h);
  }, [onClose]);

  return (
    <div data-col-picker
      className="absolute right-0 top-8 z-30 bg-[#21262d] border border-[#30363d] rounded-xl shadow-2xl py-2 min-w-[170px] max-h-[280px] overflow-y-auto">
      <div className="px-3 pb-1.5 border-b border-[#30363d] mb-1 flex items-center justify-between">
        <span className="text-[10px] text-[#7d8590]">{columns.length - hidden.size}/{columns.length} visible</span>
        <button onClick={() => onChange(new Set())} className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">Show all</button>
      </div>
      {columns.map(col => (
        <label key={col} className="flex items-center gap-2 px-3 py-1 hover:bg-[#292e36] cursor-pointer">
          <input type="checkbox" checked={!hidden.has(col)}
            onChange={() => { const n = new Set(hidden); n.has(col) ? n.delete(col) : n.add(col); onChange(n); }}
            className="accent-blue-500 w-3 h-3" />
          <span className="text-[11px] text-[#e6edf3] font-mono truncate flex-1">{col}</span>
          {hidden.has(col) ? <EyeOff size={9} className="text-[#484f58] shrink-0" /> : <Eye size={9} className="text-[#7d8590] shrink-0" />}
        </label>
      ))}
    </div>
  );
}

// ── Cell rendering ────────────────────────────────────────────────────────────

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined)
    return <span className="text-[10px] text-[#7d8590]/70 italic select-none font-normal">null</span>;
  if (typeof value === "boolean")
    return value
      ? <span className="inline-flex items-center text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-[1px] leading-none">true</span>
      : <span className="inline-flex items-center text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-full px-2 py-[1px] leading-none">false</span>;
  if (typeof value === "number")
    return <span className="font-mono text-amber-300 text-[12px] block text-right tabular-nums leading-none">{value.toLocaleString()}</span>;
  if (typeof value === "object") {
    const str = JSON.stringify(value);
    return <span className="font-mono text-[#7d8590] text-[11px]" title={str}>{str.length > 60 ? str.slice(0, 60) + "…" : str}</span>;
  }
  const str = String(value);
  if (/^[0-9a-f]{24}$/.test(str))
    return <span className="font-mono text-[#7d8590] text-[10px]" title={str}><span className="text-[#484f58]">#</span>{str.slice(0, 8)}<span className="text-[#484f58]">…</span></span>;
  const display = str.length > 120 ? str.slice(0, 120) + "…" : str;
  return <span className="text-[12px] text-[#e6edf3] leading-snug" title={str.length > 120 ? str : undefined}>{display}</span>;
}

// ── Skeleton loading ──────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="flex-1 overflow-hidden">
      <table className="w-full">
        <thead className="sticky top-0 bg-[#0d1117]">
          <tr className="border-b border-[#30363d]">
            <th className="px-2 py-3 w-8" /><th className="px-3 py-3 w-10" />
            {[100, 140, 90, 120, 80, 110].map((w, i) => (
              <th key={i} className="px-3 py-3"><div className="h-2.5 bg-[#21262d] rounded-sm skeleton-shimmer" style={{ width: w }} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }).map((_, i) => (
            <tr key={i} className={`border-b border-[#30363d]/50 ${i % 2 === 1 ? "bg-[#161b22]/30" : ""}`}>
              <td className="px-2 py-[9px] w-8"><div className="h-3 w-3 bg-[#21262d] rounded skeleton-shimmer" /></td>
              <td className="px-3 py-[9px] w-10"><div className="h-3 w-5 bg-[#21262d] rounded-sm skeleton-shimmer" /></td>
              {[1, 2, 3, 4, 5, 6].map(j => (
                <td key={j} className="px-3 py-[9px]">
                  <div className="h-3 bg-[#21262d]/80 rounded-sm skeleton-shimmer" style={{ width: `${35 + ((i + j) * 11 % 55)}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── P2: Pending Save Bar ──────────────────────────────────────────────────────

interface PendingEdit {
  rowKey: string;
  col: string;
  newValue: string;
  originalRow: Record<string, unknown>;
}

function PendingSaveBar({ count, onSave, onDiscard, saving }: {
  count: number; onSave: () => void; onDiscard: () => void; saving: boolean;
}) {
  return (
    <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-950/40 border-t border-amber-700/40">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs text-amber-300 font-medium">
          {count} unsaved change{count !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onDiscard} disabled={saving}
          className="flex items-center gap-1.5 text-xs text-[#7d8590] hover:text-[#e6edf3] px-3 py-1.5 rounded-lg hover:bg-[#292e36] transition-all cursor-pointer disabled:opacity-50">
          <RotateCcw size={11} /> Discard
        </button>
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1.5 text-xs text-white font-semibold px-4 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", boxShadow: "0 4px 8px rgba(245,158,11,0.25)" }}>
          {saving
            ? <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
            : <Save size={11} />}
          Save changes
        </button>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditState { rowIdx: number; col: string; value: string; originalRow: Record<string, unknown>; }

interface Props {
  result: QueryResult | null;
  loading?: boolean;
  error?: string | null;
  sortCol?: string | null;
  sortDir?: "asc" | "desc";
  onSort?: (col: string) => void;
  editMode?: boolean;
  readonlyCols?: string[];
  pkCol?: string;
  isMongo?: boolean;
  dbType?: string;
  onCellEdit?: (row: Record<string, unknown>, col: string, newValue: string) => Promise<void>;
  onBatchSave?: (edits: { row: Record<string, unknown>; col: string; newValue: string }[]) => Promise<void>;
  onRowDelete?: (row: Record<string, unknown>) => Promise<void>;
  insertColumns?: string[];
  onRowInsert?: (values: Record<string, string>) => Promise<void>;
  tableName?: string;
}

// ── DataGrid ──────────────────────────────────────────────────────────────────

export function DataGrid({
  result, loading, error, sortCol, sortDir, onSort,
  editMode, readonlyCols, pkCol, isMongo, dbType,
  onCellEdit, onBatchSave, onRowDelete, insertColumns, onRowInsert, tableName,
}: Props) {
  const { toast } = useToast();
  const readonlySet = new Set(readonlyCols ?? []);

  const [editing, setEditing]         = useState<EditState | null>(null);
  const [saving, setSaving]           = useState(false);
  const [colWidths, setColWidths]     = useState<Record<string, number>>({});
  const [expandedCell, setExpandedCell] = useState<{ col: string; value: unknown } | null>(null);
  // P2: staged edits (not yet committed)
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [savingPending, setSavingPending] = useState(false);
  // B3: multi-row select
  const [selectedRows, setSelectedRows]   = useState<Set<number>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting]   = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  // B5: column visibility
  const [hiddenCols, setHiddenCols]   = useState<Set<string>>(new Set());
  const [showColPicker, setShowColPicker] = useState(false);
  // B6: context menu
  const [contextMenu, setContextMenu] = useState<CtxMenu | null>(null);
  // Delete confirm
  const [pendingDelete, setPendingDelete] = useState<DeletePending | null>(null);
  // Insert row form
  const [insertValues, setInsertValues]   = useState<Record<string, string> | null>(null);
  const [inserting, setInserting]         = useState(false);
  const committingRef = useRef(false);

  useEffect(() => { setSelectedRows(new Set()); setLastSelectedIdx(null); }, [result]);
  // Clear pending edits when result refreshes (page change, reload)
  useEffect(() => {
    if (pendingEdits.length > 0) {
      setPendingEdits([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.rows]);

  // Row key for pending edit tracking
  const getRowKey = (row: Record<string, unknown>, idx: number): string => {
    if (isMongo && row._id !== undefined) return `_id:${row._id}`;
    if (pkCol && row[pkCol] !== undefined) return `pk:${row[pkCol]}`;
    return `idx:${idx}`;
  };

  const startColResize = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startW = colWidths[col] ?? 140;
    const onMove = (ev: MouseEvent) => setColWidths(p => ({ ...p, [col]: Math.max(60, startW + ev.clientX - startX) }));
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }, [colWidths]);

  // P2: Stage edit instead of committing immediately
  const stageEdit = useCallback(() => {
    if (committingRef.current || !editing) { setEditing(null); return; }
    committingRef.current = true;
    const { originalRow, col, value, rowIdx } = editing;
    setEditing(null);
    // Don't stage if value unchanged
    if (cellToString(originalRow[col]) === value) { committingRef.current = false; return; }
    const rowKey = getRowKey(originalRow, rowIdx);
    setPendingEdits(prev => {
      // Replace if same cell already pending, otherwise add
      const filtered = prev.filter(e => !(e.rowKey === rowKey && e.col === col));
      return [...filtered, { rowKey, col, newValue: value, originalRow }];
    });
    committingRef.current = false;
  }, [editing, isMongo, pkCol]);

  const handleSavePending = async () => {
    if (!pendingEdits.length) return;
    setSavingPending(true);
    try {
      if (onBatchSave) {
        await onBatchSave(pendingEdits.map(e => ({ row: e.originalRow, col: e.col, newValue: e.newValue })));
      } else if (onCellEdit) {
        for (const edit of pendingEdits) {
          await onCellEdit(edit.originalRow, edit.col, edit.newValue);
        }
      }
      setPendingEdits([]);
      toast(`${pendingEdits.length} change${pendingEdits.length !== 1 ? "s" : ""} saved`, "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setSavingPending(false);
    }
  };

  const handleDiscardPending = () => {
    setPendingEdits([]);
    toast("Changes discarded", "default");
  };

  const handleDeleteRow = useCallback((row: Record<string, unknown>, rowIdx: number) => {
    if (!onRowDelete) return;
    setPendingDelete({ type: "single", row, rowIdx });
  }, [onRowDelete]);

  const confirmDeleteRow = useCallback(async () => {
    if (!pendingDelete || !onRowDelete) return;
    setPendingDelete(null); setSaving(true);
    try { await onRowDelete(pendingDelete.row); toast("Row deleted", "default"); }
    catch (e) { toast(String(e), "error"); }
    finally { setSaving(false); }
  }, [pendingDelete, onRowDelete, toast]);

  const handleCopy = useCallback((text: string, label = "Copied") => {
    navigator.clipboard.writeText(text); toast(label, "default");
  }, [toast]);

  const handleRowSelect = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelectedIdx !== null) {
      const lo = Math.min(lastSelectedIdx, idx), hi = Math.max(lastSelectedIdx, idx);
      const next = new Set(selectedRows);
      for (let i = lo; i <= hi; i++) next.add(i);
      setSelectedRows(next);
    } else {
      const next = new Set(selectedRows);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      setSelectedRows(next); setLastSelectedIdx(idx);
    }
  };

  const handleSelectAll = () => {
    if (!result) return;
    setSelectedRows(selectedRows.size === result.rows.length ? new Set() : new Set(result.rows.map((_, i) => i)));
  };

  const handleBulkDelete = async () => {
    if (!onRowDelete || !result) return;
    if (!confirmBulkDelete) { setConfirmBulkDelete(true); setTimeout(() => setConfirmBulkDelete(false), 4000); return; }
    setBulkDeleting(true); setConfirmBulkDelete(false);
    try {
      const count = selectedRows.size;
      for (const idx of Array.from(selectedRows).sort((a, b) => b - a))
        await onRowDelete(result.rows[idx] as Record<string, unknown>);
      toast(`${count} rows deleted`, "default"); setSelectedRows(new Set());
    } catch (e) { toast(String(e), "error"); }
    finally { setBulkDeleting(false); }
  };

  // ── States ────────────────────────────────────────────────────────────────

  if (loading) return <SkeletonGrid />;

  if (saving || savingPending) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-[#7d8590]">
        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-xs">Saving…</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex-1 p-4 overflow-auto">
      <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
        <pre className="text-xs text-rose-400 whitespace-pre-wrap break-words leading-relaxed">{error}</pre>
      </div>
    </div>
  );

  if (!result || result.rows.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 rounded-2xl bg-[#21262d] border border-[#30363d] flex items-center justify-center">
        <span className="text-[18px] opacity-40">⊘</span>
      </div>
      <div className="text-center">
        <p className="text-[#7d8590] text-sm font-medium">{result ? "No rows returned" : "No results yet"}</p>
        {result && editMode && onRowInsert && insertColumns?.length && (
          <button onClick={() => setInsertValues(Object.fromEntries(insertColumns.map(c => [c, ""])))}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">
            + Insert first row
          </button>
        )}
      </div>
    </div>
  );

  const visibleCols  = result.columns.filter(c => !hiddenCols.has(c));
  const allSelected  = selectedRows.size === result.rows.length;
  const someSelected = selectedRows.size > 0 && !allSelected;
  const totalPending = pendingEdits.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setContextMenu(null)}>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[#21262d] bg-[#161b22]/60">
        {selectedRows.size > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-blue-400 font-medium">{selectedRows.size} selected</span>
            {onRowDelete && (
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                className={`flex items-center gap-1 text-[10px] rounded-lg px-2 py-1 transition-all cursor-pointer disabled:opacity-50 ${
                  confirmBulkDelete
                    ? "bg-rose-600/80 text-white border border-rose-500/50 animate-pulse"
                    : "text-rose-400 hover:bg-rose-500/10 border border-rose-500/20"
                }`}>
                {bulkDeleting ? <span className="w-3 h-3 border border-rose-400/40 border-t-rose-400 rounded-full animate-spin" /> : <Trash2 size={10} />}
                {confirmBulkDelete ? "Confirm delete" : `Delete ${selectedRows.size}`}
              </button>
            )}
            <button onClick={() => saveWithDialog(buildCsv(result, Array.from(selectedRows).sort().map(i => result.rows[i] as Record<string, unknown>)), "export-selected.csv", "csv", toast)}
              className="flex items-center gap-1 text-[10px] text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] rounded-lg px-2 py-1 transition-all cursor-pointer">
              <Download size={10} /> CSV
            </button>
            <button onClick={() => saveWithDialog(buildJson(result, Array.from(selectedRows).sort().map(i => result.rows[i] as Record<string, unknown>)), "export-selected.json", "json", toast)}
              className="flex items-center gap-1 text-[10px] text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] rounded-lg px-2 py-1 transition-all cursor-pointer">
              <Download size={10} /> JSON
            </button>
            <button onClick={() => { setSelectedRows(new Set()); setConfirmBulkDelete(false); }} className="text-[#7d8590] hover:text-[#484f58] transition-colors p-1 cursor-pointer"><X size={10} /></button>
          </div>
        ) : (
          <span className="text-[10px] text-[#484f58] tabular-nums">{result.rows.length.toLocaleString()} row{result.rows.length !== 1 ? "s" : ""}</span>
        )}

        <div className="flex items-center gap-1 relative" data-col-picker>
          <button onClick={() => setShowColPicker(v => !v)}
            className={`flex items-center gap-1 text-[10px] rounded-lg px-2 py-1 transition-all cursor-pointer ${
              hiddenCols.size > 0 ? "text-blue-400 bg-blue-500/10 border border-blue-500/20" : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36]"
            }`}>
            <Columns3 size={10} />{hiddenCols.size > 0 && `${visibleCols.length}/${result.columns.length}`}
          </button>
          {showColPicker && <ColumnPicker columns={result.columns} hidden={hiddenCols} onChange={setHiddenCols} onClose={() => setShowColPicker(false)} />}
          <button onClick={() => saveWithDialog(buildCsv(result), "export.csv", "csv", toast)}
            className="flex items-center gap-1 text-[10px] text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] rounded-lg px-2 py-1 transition-all cursor-pointer">
            <Download size={10} /> CSV
          </button>
          <button onClick={() => saveWithDialog(buildJson(result), "export.json", "json", toast)}
            className="flex items-center gap-1 text-[10px] text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] rounded-lg px-2 py-1 transition-all cursor-pointer">
            <Download size={10} /> JSON
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[#0d1117]">
            <tr className="border-b border-[#30363d]">
              <th className="px-2 py-2.5 w-8">
                <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={handleSelectAll} className="accent-blue-500 w-3 h-3 cursor-pointer" />
              </th>
              <th className="px-3 py-2.5 text-[10px] text-[#7d8590] font-semibold uppercase tracking-wider w-10">#</th>
              {visibleCols.map(col => {
                const isActive = sortCol === col;
                return (
                  <th key={col} onClick={() => onSort?.(col)} style={{ width: colWidths[col], minWidth: 60 }}
                    className={`relative px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                      onSort ? "cursor-pointer hover:bg-[#292e36]" : ""
                    } ${isActive ? "text-blue-400" : "text-[#7d8590]"}`}>
                    <span className="flex items-center gap-1">
                      {col}{isActive && (sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </span>
                    <div onMouseDown={e => startColResize(col, e)} onClick={e => e.stopPropagation()}
                      className="absolute right-0 top-0 h-full w-[3px] cursor-col-resize opacity-0 hover:opacity-100 bg-blue-500/60 transition-opacity" />
                  </th>
                );
              })}
              {editMode && <th className="px-2 py-2.5 w-8" />}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => {
              const isSelected = selectedRows.has(i);
              const rowKey = getRowKey(row as Record<string, unknown>, i);
              const rowHasPending = pendingEdits.some(e => e.rowKey === rowKey);

              return (
                <tr key={i}
                  onContextMenu={e => {
                    e.preventDefault();
                    const col = (e.target as HTMLElement).closest("td[data-col]")?.getAttribute("data-col") ?? visibleCols[0] ?? "";
                    setContextMenu({ x: e.clientX, y: e.clientY, rowIdx: i, col, row: row as Record<string, unknown> });
                  }}
                  className={`border-b transition-colors group cursor-default ${
                    isSelected
                      ? "bg-blue-500/10 border-blue-800/40 [border-left:2px_solid_#3b82f6]"
                      : rowHasPending
                        ? "bg-amber-500/5 border-[#30363d]/50 [border-left:2px_solid_#f59e0b]"
                        : `${i % 2 === 1 ? "bg-[#161b22]/40" : ""} hover:bg-[#292e36] border-[#30363d]/50`
                  }`}>
                  <td className="px-2 py-[7px] w-8">
                    <input type="checkbox" checked={isSelected} onChange={() => {}}
                      onClick={e => handleRowSelect(i, e as unknown as React.MouseEvent)}
                      className="accent-blue-500 w-3 h-3 cursor-pointer" />
                  </td>
                  <td className="px-3 py-[7px] text-[10px] text-[#484f58] font-mono w-10 tabular-nums">{i + 1}</td>
                  {visibleCols.map(col => {
                    const val = (row as Record<string, unknown>)[col];
                    const isEditing  = editing?.rowIdx === i && editing?.col === col;
                    const isReadonly = readonlySet.has(col);
                    const canEdit    = editMode && !isReadonly;
                    const isPending  = pendingEdits.some(e => e.rowKey === rowKey && e.col === col);
                    const pendingVal = pendingEdits.find(e => e.rowKey === rowKey && e.col === col)?.newValue;
                    const canExpand  = typeof val === "object" || (typeof val === "string" && (val as string).length > 80);

                    return (
                      <td key={col} data-col={col}
                        onClick={() => { if (!isEditing) navigator.clipboard.writeText(cellToString(val)); }}
                        onDoubleClick={() => { if (canEdit) setEditing({ rowIdx: i, col, value: cellToString(val), originalRow: row as Record<string, unknown> }); }}
                        title={canEdit ? "Click to copy · Double-click to edit" : isReadonly ? "Read-only field" : "Click to copy"}
                        className={`relative px-3 py-[7px] max-w-[220px] group/cell cursor-pointer transition-colors ${
                          isEditing ? "bg-blue-900/20 p-1"
                            : isPending ? "bg-amber-500/10"
                            : isReadonly ? "opacity-70"
                            : ""
                        }`}>
                        {isEditing ? (
                          <input autoFocus value={editing.value}
                            onChange={e => setEditing({ ...editing, value: e.target.value })}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); stageEdit(); } if (e.key === "Escape") setEditing(null); }}
                            onBlur={() => { if (!committingRef.current) stageEdit(); }}
                            onClick={e => e.stopPropagation()}
                            className="w-full min-w-[6rem] text-xs bg-[#21262d] border border-blue-500/60 rounded-lg px-2 py-1 outline-none font-mono text-[#e6edf3]" />
                        ) : (
                          <>
                            {isPending
                              ? <span className="text-[12px] text-amber-300 italic">{pendingVal ?? cellToString(val)}</span>
                              : renderCell(val)}
                            {canExpand && (
                              <button onClick={e => { e.stopPropagation(); setExpandedCell({ col, value: val }); }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 transition-opacity p-0.5 rounded bg-[#292e36] border border-[#484f58] text-[#7d8590] hover:text-[#e6edf3] cursor-pointer">
                                <Maximize2 size={9} />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                  {editMode && (
                    <td className="px-2 py-[7px] w-8">
                      <button onClick={e => { e.stopPropagation(); handleDeleteRow(row as Record<string, unknown>, i); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[#7d8590] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer">
                        <Trash2 size={11} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* P2: Pending save bar */}
      {totalPending > 0 && (
        <PendingSaveBar count={totalPending} onSave={handleSavePending} onDiscard={handleDiscardPending} saving={savingPending} />
      )}

      {/* Insert new row */}
      {editMode && onRowInsert && insertColumns && insertColumns.length > 0 && totalPending === 0 && (
        <div className="shrink-0 border-t border-[#30363d] px-3 py-2">
          {insertValues ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {insertColumns.map(col => (
                  <div key={col} className="flex items-center gap-1.5 min-w-[140px]">
                    <span className="text-[10px] text-[#7d8590] font-mono shrink-0">{col}:</span>
                    <input value={insertValues[col] ?? ""} onChange={e => setInsertValues(v => ({ ...v!, [col]: e.target.value }))}
                      placeholder="NULL"
                      className="flex-1 min-w-[60px] bg-[#21262d] border border-[#484f58] focus:border-blue-500 rounded-lg px-2 py-1 text-xs text-[#e6edf3] font-mono outline-none transition-colors" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button disabled={inserting}
                  onClick={async () => {
                    if (!insertValues) return; setInserting(true);
                    try { await onRowInsert(insertValues); setInsertValues(null); toast("Row inserted", "success"); }
                    catch (e) { toast(String(e), "error"); } finally { setInserting(false); }
                  }}
                  className="flex items-center gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 transition-colors cursor-pointer">
                  {inserting && <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />} Insert row
                </button>
                <button onClick={() => setInsertValues(null)} className="text-xs text-[#7d8590] hover:text-[#e6edf3] px-2 py-1.5 rounded-lg hover:bg-[#292e36] transition-all cursor-pointer">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setInsertValues(Object.fromEntries(insertColumns.map(c => [c, ""])))}
              className="text-[10px] text-[#7d8590] hover:text-[#e6edf3] flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-[#292e36] transition-all border border-dashed border-[#30363d] hover:border-[#484f58] cursor-pointer">
              + Insert row
            </button>
          )}
        </div>
      )}

      {expandedCell && <CellExpandModal col={expandedCell.col} value={expandedCell.value} onClose={() => setExpandedCell(null)} />}
      {contextMenu && (
        <ContextMenu menu={contextMenu} tableName={tableName} dbType={dbType}
          onClose={() => setContextMenu(null)}
          onDelete={editMode && onRowDelete ? row => handleDeleteRow(row, contextMenu.rowIdx) : undefined}
          onCopy={handleCopy} />
      )}
      {pendingDelete && <DeleteConfirmModal pending={pendingDelete} onConfirm={confirmDeleteRow} onCancel={() => setPendingDelete(null)} />}
    </div>
  );
}
