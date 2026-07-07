import { useEffect, useState, useRef, useCallback } from "react";
import { Check, ChevronLeft, ChevronRight, RefreshCw, MoreVertical, Plus, Trash2, Copy, Download, Upload } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save as nativeSave } from "@tauri-apps/plugin-dialog";
import { runQuery, describeTable, listForeignKeys, fetchForeignKeyReference, ensureMongoDb, countRows, applyBatchEdits } from "./objectApi";
import { ImportModal } from "./ImportModal";

import { Spinner } from "../../shared/ui/Spinner";
import { DataGridCell } from "./DataGridCell";
import { useDataGridStore } from "./dataGridStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useToast } from "../../components/Toast";
import type { QueryResult, ColumnInfo, ForeignKeyInfo } from "../../shared/types";
import type { OpenObject } from "../../stores/workspaceStore";

function quoteIdent(ident: string, engine: string): string {
  if (engine === "mysql") {
    return `\`${ident.replace(/`/g, "``")}\``;
  }
  return `"${ident.replace(/"/g, '""')}"`;
}

// ColumnPicker has been merged into the MoreActions dropdown

function DataGrid({
  result,
  object,
  columns,
  primaryKey,
  foreignKeys,
  fkOptions,
  totalRows,
  page,
  onPageChange,
  onRefresh,
  pageSize,
  onPageSizeChange,
  sortColumn,
  sortDirection,
  onSortToggle,
  filterText,
  onFilterTextChange,
  onApplyFilter,
  isSaving,
  onFkClick,
  onExportCsv,
  onImport,
  onSaveBatch,
}: {
  result: QueryResult;
  object: OpenObject;
  columns: ColumnInfo[];
  primaryKey: string | null;
  foreignKeys: ForeignKeyInfo[];
  fkOptions: Map<string, { value: string; label: string }[]>;
  totalRows: number | null;
  page: number;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  sortColumn: string | null;
  sortDirection: "ASC" | "DESC" | null;
  onSortToggle: (column: string) => void;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onApplyFilter: () => void;
  isSaving: boolean;
  onFkClick: (column: string, value: unknown) => void;
  onExportCsv: () => void;
  onImport: () => void;
  onSaveBatch: () => void;
}) {
  const isMongo = object.engine === "mongodb";
  const { toast } = useToast();
  const {
    toggleColumn,
    hiddenColumns,
    stagedInsertions,
    stagedDeletions,
    addStagedRow,
    removeStagedRow,
    toggleStagedDeletion,
    dirtyCells,
    clearAllDirtyCells,
    clearStagedInsertions,
    clearStagedDeletions,
    selectedCell,
    setSelectedCell,
    rowsOffset,
    selectedRowIndices,
    setSelectedRowIndices,
    toggleRowSelection,
    clearRowSelection,
    addMultipleStagedDeletions,
  } = useDataGridStore();

  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const hidden = hiddenColumns.get(object.id) ?? new Set<string>();
  const toggleCol = useCallback(
    (col: string) => toggleColumn(object.id, col),
    [object.id, toggleColumn]
  );

  const visibleCols = result.columns.filter((c) => !hidden.has(c));

  // Build a map of column name -> FK info for quick lookup
  const fkMap = new Map<string, ForeignKeyInfo>();
  for (const fk of foreignKeys) {
    const fkColumns = fk.columns.split(",").map((c) => c.trim());
    for (const col of fkColumns) {
      fkMap.set(col, fk);
    }
  }

  const allRows = [...result.rows, ...stagedInsertions];
  const hasChanges = dirtyCells.size > 0 || stagedInsertions.length > 0 || stagedDeletions.size > 0;
  const isAllSelected = allRows.length > 0 && selectedRowIndices.size === allRows.length;

  const handleHeaderCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRowIndices(new Set(allRows.map((_, idx) => idx)));
    } else {
      clearRowSelection();
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newIndices = new Set(selectedRowIndices);
      const adding = !selectedRowIndices.has(index);

      for (let idx = start; idx <= end; idx++) {
        if (adding) {
          newIndices.add(idx);
        } else {
          newIndices.delete(idx);
        }
      }
      setSelectedRowIndices(newIndices);
    } else {
      toggleRowSelection(index);
      setLastSelectedIndex(index);
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">
            {result.rows.length === 0
              ? `0 ${isMongo ? "documents" : "rows"}`
              : `${(page * pageSize + 1).toLocaleString()}–${(page * pageSize + result.rows.length).toLocaleString()} of ${
                  totalRows !== null ? totalRows.toLocaleString() : "…"
                } ${isMongo ? "documents" : "rows"}`}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="p-1 rounded-[var(--radius-sm)] text-muted hover:text-fg hover:bg-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Previous page"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="text-[11px] text-muted px-1">
              {page + 1}{totalRows !== null ? ` / ${Math.max(1, Math.ceil(totalRows / pageSize))}` : ""}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={totalRows !== null && (page + 1) * pageSize >= totalRows}
              className="p-1 rounded-[var(--radius-sm)] text-muted hover:text-fg hover:bg-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Next page"
            >
              <ChevronRight size={12} />
            </button>
          </div>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-elevated border border-border rounded-[var(--radius-sm)] text-[10px] text-muted px-1.5 py-0.5 focus:outline-none"
            title="Rows per page"
          >
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={250}>250 rows</option>
            <option value={500}>500 rows</option>
          </select>
        </div>

        {/* Filter Input */}
        {!isMongo && (
          <div className="flex items-center gap-1 flex-1 max-w-xs md:max-w-md mx-2">
            <input
              type="text"
              value={filterText}
              onChange={(e) => onFilterTextChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onApplyFilter()}
              placeholder="Filter (e.g. status = 'active')..."
              className="w-full bg-elevated border border-border rounded-[var(--radius-sm)] text-xs px-2.5 py-1 focus:outline-none focus:border-accent text-fg"
            />
            {filterText && (
              <button
                onClick={() => {
                  onFilterTextChange("");
                  setTimeout(onApplyFilter, 0);
                }}
                className="text-[10px] text-muted hover:text-fg px-1"
              >
                Clear
              </button>
            )}
            <button
              onClick={onApplyFilter}
              className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent hover:bg-accent-strong text-on-accent text-xs font-medium transition-colors"
            >
              Filter
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-[var(--radius-sm)] text-muted hover:text-fg hover:bg-hover transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={isSaving ? "animate-spin" : ""} />
          </button>

          {/* More Actions Dropdown */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`p-1.5 rounded-[var(--radius-sm)] text-muted hover:text-fg hover:bg-hover transition-colors ${
                moreOpen ? "bg-hover text-fg" : ""
              }`}
              title="More actions"
            >
              <MoreVertical size={13} />
            </button>

            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-elevated border border-border rounded-[var(--radius-md)] shadow-lg anim-pop py-1 w-[200px] max-h-[380px] overflow-y-auto">
                <button
                  onClick={() => {
                    addStagedRow(result.columns);
                    setMoreOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                >
                  <Plus size={12} className="text-ok shrink-0" />
                  <span>Add Row</span>
                </button>

                <button
                  onClick={() => {
                    if (selectedRowIndices.size > 0) {
                      const relativeNewIndices: number[] = [];
                      const pkDeletions: unknown[] = [];
                      
                      selectedRowIndices.forEach((rowIndex) => {
                        if (rowIndex >= rowsOffset) {
                          relativeNewIndices.push(rowIndex - rowsOffset);
                        } else {
                          const row = result.rows[rowIndex];
                          if (row && primaryKey) {
                            pkDeletions.push(row[primaryKey]);
                          }
                        }
                      });

                      if (relativeNewIndices.length > 0) {
                        relativeNewIndices.sort((a, b) => b - a);
                        relativeNewIndices.forEach((idx) => removeStagedRow(idx));
                      }

                      if (pkDeletions.length > 0) {
                        addMultipleStagedDeletions(pkDeletions);
                      }

                      clearRowSelection();
                    } else if (selectedCell !== null) {
                      const rowIndex = selectedCell.rowIndex;
                      if (rowIndex >= rowsOffset) {
                        removeStagedRow(rowIndex - rowsOffset);
                      } else {
                        const row = result.rows[rowIndex];
                        if (row && primaryKey) {
                          toggleStagedDeletion(row[primaryKey]);
                        }
                      }
                    }
                    setMoreOpen(false);
                  }}
                  disabled={selectedRowIndices.size === 0 && (selectedCell === null || (!primaryKey && selectedCell.rowIndex < rowsOffset))}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-fg hover:bg-hover disabled:opacity-40 disabled:pointer-events-none transition-colors text-left cursor-pointer"
                >
                  <Trash2 size={12} className="text-danger shrink-0" />
                  <span>Delete Row</span>
                </button>

                <button
                  onClick={() => {
                    if (selectedRowIndices.size > 0) {
                      const selectedRows = Array.from(selectedRowIndices).map((idx) => allRows[idx]).filter(Boolean);
                      navigator.clipboard.writeText(JSON.stringify(selectedRows, null, 2));
                      toast(`Copied ${selectedRows.length} rows as JSON`, "success");
                    } else if (selectedCell !== null) {
                      const row = allRows[selectedCell.rowIndex];
                      if (row) {
                        navigator.clipboard.writeText(JSON.stringify(row, null, 2));
                        toast("Copied 1 row as JSON", "success");
                      }
                    }
                    setMoreOpen(false);
                  }}
                  disabled={selectedRowIndices.size === 0 && selectedCell === null}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-fg hover:bg-hover disabled:opacity-40 disabled:pointer-events-none transition-colors text-left cursor-pointer"
                >
                  <Copy size={12} className="shrink-0" />
                  <span>Copy Row (JSON)</span>
                </button>

                <button
                  onClick={() => {
                    onExportCsv();
                    setMoreOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                >
                  <Download size={12} className="shrink-0" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={() => {
                    onImport();
                    setMoreOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                >
                  <Upload size={12} className="shrink-0" />
                  <span>Import Data</span>
                </button>

                <div className="my-1 border-t border-border"></div>

                <div className="px-3 py-1.5 mb-0.5 flex items-center justify-between">
                  <span className="text-[10px] text-faint uppercase font-bold tracking-wide">Columns</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      result.columns.forEach((c) => hidden.has(c) && toggleCol(c));
                    }}
                    className="text-[10px] text-accent hover:underline cursor-pointer"
                  >
                    Show all
                  </button>
                </div>

                {result.columns.map((col) => {
                  const visible = !hidden.has(col);
                  return (
                    <button
                      key={col}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCol(col);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1 text-xs text-fg hover:bg-hover transition-colors text-left cursor-pointer"
                    >
                      <span className={`w-3 h-3 flex items-center justify-center rounded border shrink-0 ${visible ? "bg-accent border-accent" : "border-border"}`}>
                        {visible && <Check size={8} className="text-on-accent" />}
                      </span>
                      <span className="truncate font-mono text-[11px]">{col}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid Table */}
      <div className="flex-1 overflow-auto">
        <table className="text-left border-collapse w-full">
          <thead className="sticky top-0 bg-surface shadow-sm z-10">
            <tr className="border-b border-border">
              <th className="px-3 py-2 w-8 shrink-0 select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleHeaderCheckboxChange}
                  className="rounded border-border text-accent focus:ring-accent accent-accent bg-elevated cursor-pointer"
                />
              </th>
              {visibleCols.map((c) => (
                <th
                  key={c}
                  onClick={() => onSortToggle(c)}
                  className="px-3 py-2 whitespace-nowrap cursor-pointer hover:bg-hover select-none transition-colors group"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{c}</span>
                    {sortColumn === c ? (
                      sortDirection === "ASC" ? (
                        <span className="text-accent text-[9px]">▲</span>
                      ) : (
                        <span className="text-accent text-[9px]">▼</span>
                      )
                    ) : (
                      <span className="text-muted/0 group-hover:text-muted/60 text-[9px] transition-opacity">↕</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, i) => {
              const isNewRow = i >= result.rows.length;
              const pkValue = primaryKey ? row[primaryKey] : null;
              const isDeleted = pkValue !== null && stagedDeletions.has(pkValue);
              const isRowSelected = selectedRowIndices.has(i);

              let rowClass = "border-b border-border/60 hover:bg-hover transition-colors";
              if (isDeleted) {
                rowClass += " bg-danger/10 text-danger/60 line-through opacity-70";
              } else if (isRowSelected) {
                rowClass += " bg-accent/10";
              } else if (isNewRow) {
                rowClass += " bg-ok/10";
              } else if (i % 2 === 1) {
                rowClass += " bg-surface/40";
              }

              return (
                <tr key={i} className={rowClass}>
                  <td className="px-3 py-1.5 w-8 shrink-0 text-center select-none">
                    <input
                      type="checkbox"
                      checked={isRowSelected}
                      onClick={(e) => handleCheckboxClick(e, i)}
                      onChange={() => {}}
                      className="rounded border-border text-accent focus:ring-accent accent-accent bg-elevated cursor-pointer"
                    />
                  </td>
                  {visibleCols.map((c) => {
                    const colInfo = columns.find((col) => col.name === c);
                    const isPk = c === primaryKey;
                    const isSelected = selectedCell?.rowIndex === i && selectedCell?.column === c;

                    return (
                      <td
                        key={c}
                        onClick={() => setSelectedCell(i, c)}
                        className={`px-3 py-1.5 text-[12px] font-mono text-fg/90 border-r border-border/10 last:border-r-0 ${
                          isSelected ? "outline outline-1 -outline-offset-1 outline-accent bg-accent/5" : ""
                        }`}
                      >
                        <div className="max-w-[280px] overflow-hidden">
                          <DataGridCell
                            column={c}
                            rowIndex={i}
                            value={row[c]}
                            isPrimaryKey={isPk}
                            isForeignKey={fkMap.has(c)}
                            foreignKeyOptions={fkMap.has(c) ? fkOptions.get(c) ?? [] : []}
                            dataType={colInfo?.data_type ?? "text"}
                            onFkClick={onFkClick}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Unsaved Changes Bottom Action Bar */}
      {hasChanges && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface border-t border-border shrink-0 anim-fade">
          <span className="text-xs text-muted flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-warn animate-pulse"></span>
            Unsaved changes:
            {stagedInsertions.length > 0 && <span className="text-ok font-medium">{stagedInsertions.length} inserted</span>}
            {dirtyCells.size > 0 && <span className="text-warn font-medium">{dirtyCells.size} modified</span>}
            {stagedDeletions.size > 0 && <span className="text-danger font-medium">{stagedDeletions.size} deleted</span>}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearAllDirtyCells();
                clearStagedInsertions();
                clearStagedDeletions();
              }}
              disabled={isSaving}
              className="px-3 py-1 rounded-[var(--radius-md)] text-xs text-muted hover:text-fg hover:bg-hover transition-colors disabled:opacity-40"
            >
              Revert
            </button>
            <button
              onClick={onSaveBatch}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-md)] bg-accent hover:bg-accent-strong text-on-accent text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {isSaving ? <Spinner size={10} /> : null}
              Save Changes
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function DataGridShell({ object }: { object: OpenObject }) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
  const [fkOptions, setFkOptions] = useState<Map<string, { value: string; label: string }[]>>(new Map());
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC" | null>(null);
  const [filterText, setFilterText] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const { toast } = useToast();
  const isMongo = object.engine === "mongodb";
  const primaryKey = columns.find((c) => c.is_pk)?.name ?? null;

  const {
    dirtyCells,
    stagedInsertions,
    stagedDeletions,
    setRowsOffset,
    clearAllDirtyCells,
    clearStagedInsertions,
    clearStagedDeletions,
    clearRowSelection,
  } = useDataGridStore();

  const openObject = useWorkspaceStore((s) => s.openObject);
  const setPendingFilter = useWorkspaceStore((s) => s.setPendingFilter);
  const getPendingFilter = useWorkspaceStore((s) => s.getPendingFilter);
  const clearPendingFilter = useWorkspaceStore((s) => s.clearPendingFilter);

  // Clear staged modifications when switching active tables/objects
  useEffect(() => {
    clearAllDirtyCells();
    clearStagedInsertions();
    clearStagedDeletions();
    clearRowSelection();

    // Check if there is a pending foreign key filter for this tab
    const pending = getPendingFilter(object.id);
    if (pending) {
      setFilterText(pending);
      setAppliedFilter(pending);
      clearPendingFilter(object.id);
    } else {
      setFilterText("");
      setAppliedFilter("");
    }

    setSortColumn(null);
    setSortDirection(null);
    setPage(0);
  }, [object.id, getPendingFilter, clearPendingFilter, clearAllDirtyCells, clearStagedInsertions, clearStagedDeletions, clearRowSelection]);

  // Structure, FK metadata, and total count — refetched per table, not per page.
  useEffect(() => {
    setColumns([]); setForeignKeys([]); setFkOptions(new Map()); setTotalRows(null); setPage(0); setError("");

    const fetchMeta = async () => {
      try {
        await ensureMongoDb(object);
        const [cols, fks, total] = await Promise.all([
          describeTable(object.connId, object.table),
          isMongo ? Promise.resolve([] as ForeignKeyInfo[]) : listForeignKeys(object.connId, object.table),
          countRows(object.connId, object.table),
        ]);
        setColumns(cols);
        setForeignKeys(fks);
        setTotalRows(total);

        // Fetch FK reference table data for dropdown options
        const fkOptionsMap = new Map<string, { value: string; label: string }[]>();
        const fkPromises: Promise<void>[] = [];

        for (const fk of fks) {
          const fkColumns = fk.columns.split(",").map((c) => c.trim());
          const refTable = fk.referenced_table;

          const promise = fetchForeignKeyReference(object.connId, refTable).then((options) => {
            for (const col of fkColumns) {
              fkOptionsMap.set(col, options);
            }
          }).catch((err) => {
            console.error(`Failed to fetch FK reference for ${refTable}:`, err);
          });

          fkPromises.push(promise);
        }

        await Promise.all(fkPromises);
        setFkOptions(fkOptionsMap);
      } catch (e) {
        setError(String(e));
      }
    };

    fetchMeta();
  }, [isMongo, object.connId, object.table, object.engine, object.database, refreshKey]);

  // Row data — refetched when the page, page size, filter, or sorting changes.
  useEffect(() => {
    setResult(null); setError("");

    const fetchPage = async () => {
      try {
        await ensureMongoDb(object);

        let query = `SELECT * FROM ${quoteIdent(object.table, object.engine)}`;
        
        // Filter support (for relational SQL engines)
        if (appliedFilter.trim() && object.engine !== "mongodb") {
          query += ` WHERE ${appliedFilter}`;
        }

        // Sorting support
        if (sortColumn) {
          query += ` ORDER BY ${quoteIdent(sortColumn, object.engine)} ${sortDirection}`;
        }

        query += ` LIMIT ${pageSize} OFFSET ${page * pageSize}`;

        const data = await runQuery(object.connId, query);
        setResult(data);
        setRowsOffset(data.rows.length);
      } catch (e) {
        setError(String(e));
      }
    };
    fetchPage();
  }, [object.connId, object.table, object.engine, object.database, page, pageSize, sortColumn, sortDirection, appliedFilter, refreshKey, setRowsOffset]);

  const handleSortToggle = useCallback((column: string) => {
    setPage(0);
    if (sortColumn === column) {
      if (sortDirection === "ASC") {
        setSortDirection("DESC");
      } else {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("ASC");
    }
  }, [sortColumn, sortDirection]);

  const handleApplyFilter = useCallback(() => {
    setPage(0);
    setAppliedFilter(filterText);
  }, [filterText]);

  const handleExportCsv = useCallback(async () => {
    if (!result || result.rows.length === 0) return;
    const allRows = [...result.rows, ...stagedInsertions];
    const header = result.columns.join(",");
    const csvRows = allRows.map((row) =>
      result.columns
        .map((col) => {
          const val = row[col];
          const str = val === null || val === undefined ? "" : String(val);
          return `"${str.replace(/"/g, '""').replace(/\n/g, " ").replace(/\r/g, "")}"`;
        })
        .join(",")
    );
    const csvContent = [header, ...csvRows].join("\n");

    try {
      // Trigger Tauri Native Save Dialog
      const filePath = await nativeSave({
        defaultPath: `${object.table}_export.csv`,
        filters: [
          { name: "CSV", extensions: ["csv"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (!filePath) return;

      // Invoke save_to_file Tauri backend command
      await invoke("save_to_file", { path: filePath, content: csvContent });

      const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
      toast(`Successfully exported to ${fileName}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  }, [result, stagedInsertions, object, toast]);

  const handleFkClick = useCallback((column: string, value: unknown) => {
    const fk = foreignKeys.find((f) => {
      const cols = f.columns.split(",").map((c) => c.trim());
      return cols.includes(column);
    });
    if (!fk) return;

    const refTable = fk.referenced_table;
    const refColumn = fk.referenced_columns.split(",")[0]?.trim();
    if (!refColumn) return;

    const targetObjId = `${object.connId}:${refTable}`;
    const filterValue = typeof value === "number" ? value : `'${String(value).replace(/'/g, "''")}'`;
    const filterStr = `${quoteIdent(refColumn, object.engine)} = ${filterValue}`;

    setPendingFilter(targetObjId, filterStr);
    openObject({
      id: targetObjId,
      connId: object.connId,
      table: refTable,
      label: refTable,
      engine: object.engine,
    });
  }, [foreignKeys, object, openObject, setPendingFilter]);

  const handleSaveBatch = async () => {
    if (!result) return;
    setIsSaving(true);
    setError("");

    try {
      const updates: any[] = [];
      const deletes: any[] = [];
      const inserts: any[] = [];

      // 1. Process Updates
      Array.from(dirtyCells.values()).forEach((edit) => {
        const row = result.rows[edit.rowIndex];
        if (!row || !primaryKey) return;
        const pkValue = row[primaryKey];
        updates.push({
          table: object.table,
          pk_column: primaryKey,
          pk_value: pkValue,
          values: { [edit.column]: edit.newValue },
        });
      });

      // 2. Process Deletions
      Array.from(stagedDeletions).forEach((pkValue) => {
        if (!primaryKey) return;
        deletes.push({
          table: object.table,
          pk_column: primaryKey,
          pk_value: pkValue,
        });
      });

      // 3. Process Insertions
      stagedInsertions.forEach((row) => {
        const values: Record<string, unknown> = {};
        Object.keys(row).forEach((k) => {
          if (row[k] !== "" && row[k] !== null) {
            values[k] = row[k];
          }
        });
        inserts.push({
          table: object.table,
          values,
        });
      });

      // Execute single batch save operation
      await applyBatchEdits(object.connId, {
        table: object.table,
        updates,
        inserts,
        deletes,
      });

      // Success: Clear all staged changes and reload grid
      clearAllDirtyCells();
      clearStagedInsertions();
      clearStagedDeletions();
      clearRowSelection();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(`Failed to save staged changes: ${e}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (error) return <div className="p-4 text-xs text-danger break-words">{error}</div>;
  if (!result) return (
    <div className="p-4 text-xs text-muted flex items-center gap-1.5">
      <Spinner size={12} /> Loading…
    </div>
  );
  if (result.rows.length === 0 && page === 0 && stagedInsertions.length === 0) {
    return (
      <div className="p-4 flex flex-col gap-3 items-start">
        <div className="text-xs text-faint italic">{isMongo ? "No documents" : "No rows"}</div>
        <button
          onClick={() => stagedInsertions.length === 0 && useDataGridStore.getState().addStagedRow(result.columns)}
          className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent hover:bg-accent-strong text-on-accent text-xs font-medium transition-colors"
        >
          Add Row
        </button>
      </div>
    );
  }

  return (
    <>
      <DataGrid
        result={result}
        object={object}
        columns={columns}
        primaryKey={primaryKey}
        foreignKeys={foreignKeys}
        fkOptions={fkOptions}
        totalRows={totalRows}
        page={page}
        onPageChange={setPage}
        onRefresh={() => setRefreshKey((k) => k + 1)}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSortToggle={handleSortToggle}
        filterText={filterText}
        onFilterTextChange={setFilterText}
        onApplyFilter={handleApplyFilter}
        isSaving={isSaving}
        onFkClick={handleFkClick}
        onExportCsv={handleExportCsv}
        onImport={() => setShowImportModal(true)}
        onSaveBatch={handleSaveBatch}
      />
      {showImportModal && (
        <ImportModal
          connId={object.connId}
          table={object.table}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
