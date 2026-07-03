import { useEffect, useState, useRef, useCallback } from "react";
import { FileText, Columns3, Check } from "lucide-react";
import { runQuery, describeTable } from "./objectApi";
import { updateRow } from "./editApi";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Spinner } from "../../shared/ui/Spinner";
import { DataGridCell } from "./DataGridCell";
import { useDataGridStore, type DirtyCell } from "./dataGridStore";
import type { QueryResult, ColumnInfo } from "../../shared/types";
import type { OpenObject } from "../../stores/workspaceStore";

function ColumnPicker({ columns, hidden, onToggle }: {
  columns: string[];
  hidden: Set<string>;
  onToggle: (col: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const visibleCount = columns.length - hidden.size;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs text-muted hover:text-fg hover:bg-hover transition-colors"
        title="Toggle columns"
      >
        <Columns3 size={11} />
        Columns
        {hidden.size > 0 && (
          <span className="ml-0.5 px-1 rounded-full bg-accent/20 text-accent text-[10px] font-medium">
            {visibleCount}/{columns.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-elevated border border-border rounded-[var(--radius-md)] shadow-lg anim-pop py-1 min-w-[160px] max-h-72 overflow-y-auto">
          <div className="px-2 pb-1 mb-1 border-b border-border flex items-center justify-between">
            <span className="text-[10px] text-faint uppercase tracking-wide">Columns</span>
            <button
              onClick={() => columns.forEach((c) => hidden.has(c) && onToggle(c))}
              className="text-[10px] text-accent hover:underline"
            >
              Show all
            </button>
          </div>
          {columns.map((col) => {
            const visible = !hidden.has(col);
            return (
              <button
                key={col}
                onClick={() => onToggle(col)}
                className="w-full flex items-center gap-2 px-2.5 py-1 text-xs text-fg hover:bg-hover transition-colors text-left"
              >
                <span className={`w-3 h-3 flex items-center justify-center rounded border ${visible ? "bg-accent border-accent" : "border-border"}`}>
                  {visible && <Check size={8} className="text-on-accent" />}
                </span>
                <span className="truncate font-mono">{col}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DataGrid({
  result,
  object,
  columns,
  primaryKey,
}: {
  result: QueryResult;
  object: OpenObject;
  columns: ColumnInfo[];
  primaryKey: string | null;
}) {
  const { toggleColumn, hiddenColumns, stopEditing } = useDataGridStore();

  const hidden = hiddenColumns.get(object.id) ?? new Set<string>();
  const toggleCol = useCallback(
    (col: string) => toggleColumn(object.id, col),
    [object.id, toggleColumn]
  );

  const visibleCols = result.columns.filter((c) => !hidden.has(c));

  // Handle cell save - update the row in the database
  const handleSave = useCallback(
    async (edit: DirtyCell) => {
      if (!primaryKey) return;

      const pkValue = result.rows[edit.rowIndex][primaryKey];
      try {
        await updateRow(object.connId, {
          table: object.table,
          pk_column: primaryKey,
          pk_value: pkValue,
          values: { [edit.column]: edit.newValue },
        });
        stopEditing();
      } catch (err) {
        console.error("Failed to save:", err);
      }
    },
    [object, primaryKey, result.rows, stopEditing]
  );

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-end px-2 py-1 border-b border-border bg-surface shrink-0">
        <ColumnPicker columns={result.columns} hidden={hidden} onToggle={toggleCol} />
      </div>
      <div className="flex-1 overflow-auto">
        <table className="text-left border-collapse w-full">
          <thead className="sticky top-0 bg-surface shadow-sm z-10">
            <tr className="border-b border-border">
              {visibleCols.map((c) => (
                <th key={c} className="px-3 py-2 whitespace-nowrap">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className={`border-b border-border/60 hover:bg-hover ${i % 2 === 1 ? "bg-surface/40" : ""}`}>
                {visibleCols.map((c) => {
                  const colInfo = columns.find((col) => col.name === c);
                  const isPk = c === primaryKey;
                  return (
                    <td key={c} className="px-3 py-1.5 text-[12px] font-mono text-fg/90">
                      <div className="max-w-[280px] overflow-hidden">
                        <DataGridCell
                          column={c}
                          rowIndex={i}
                          value={row[c]}
                          isPrimaryKey={isPk}
                          dataType={colInfo?.data_type ?? "text"}
                          onSave={handleSave}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function DataGridShell({ object }: { object: OpenObject }) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [error, setError] = useState("");
  const isMongo = object.engine === "mongodb";

  // Find primary key from columns
  const primaryKey = columns.find((c) => c.is_pk)?.name ?? null;

  useEffect(() => {
    if (isMongo) return;
    setResult(null); setColumns([]); setError("");

    const fetchData = async () => {
      try {
        // Fetch both table structure and data in parallel
        const [cols, data] = await Promise.all([
          describeTable(object.connId, object.table),
          runQuery(object.connId, `SELECT * FROM ${object.table} LIMIT 200`),
        ]);
        setColumns(cols);
        setResult(data);
      } catch (e) {
        setError(String(e));
      }
    };

    fetchData();
  }, [isMongo, object.connId, object.table, object.engine]);

  if (isMongo) return <EmptyState icon={FileText} title="Document view — next milestone" subtitle="MongoDB document browsing is a later slice" />;
  if (error) return <div className="p-4 text-xs text-danger break-words">{error}</div>;
  if (!result) return (
    <div className="p-4 text-xs text-muted flex items-center gap-1.5">
      <Spinner size={12} /> Loading…
    </div>
  );
  if (result.rows.length === 0) return <div className="p-4 text-xs text-faint italic">No rows</div>;

  return <DataGrid result={result} object={object} columns={columns} primaryKey={primaryKey} />;
}
