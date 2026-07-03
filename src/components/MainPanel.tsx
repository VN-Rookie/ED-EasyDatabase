import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DatabaseZap, ChevronLeft, ChevronRight, RefreshCw, Loader2, Table2, Terminal, ListTree, Bookmark, FileText, Hash } from "lucide-react";
import { useViewStore } from "../stores/viewStore";
import { useSchemaStore } from "../stores/schemaStore";
import { useConnectionStore } from "../stores/connectionStore";
import { useSchema, PAGE_SIZE } from "../hooks/useSchema";
import { useQuery } from "../hooks/useQuery";
import { DataGrid } from "./DataGrid";
import { SqlEditor } from "./SqlEditor";
import { AiQueryBox } from "./AiQueryBox";
import { SavedQueriesPanel } from "./SavedQueriesPanel";
import { FilterBar } from "./FilterBar";
import { DocumentView } from "./DocumentView";
import { IndexView } from "./IndexView";
import type { QueryResult } from "../types";
import { insertRow, deleteRow } from "../features/object-view/editApi";

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
function toSqlLiteral(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return "NULL";
  return `'${trimmed.replace(/'/g, "''")}'`;
}
function pkToLiteral(pkRaw: unknown): string {
  if (pkRaw === null || pkRaw === undefined) return "NULL";
  if (typeof pkRaw === "number") return String(pkRaw);
  if (typeof pkRaw === "boolean") return pkRaw ? "TRUE" : "FALSE";
  return `'${String(pkRaw).replace(/'/g, "''")}'`;
}
/** Convert a user-typed string into a JSON value for MongoDB $set.
 *  Tries boolean → null → number → JSON object/array → plain string. */
function mongoEncodeValue(raw: string): string {
  const t = raw.trim();
  if (t === "null")  return "null";
  if (t === "true")  return "true";
  if (t === "false") return "false";
  if (t !== "" && !isNaN(Number(t))) return t;                    // number
  try { JSON.parse(t); return t; } catch {}                       // valid JSON (object/array)
  return JSON.stringify(raw);                                      // wrap as JSON string
}

export function MainPanel() {
  const { activeConnectionId, activeConnections } = useConnectionStore();
  const { selectedTable, columns, columnsLoading, tableColumns, selectedDatabase } = useSchemaStore();
  const {
    activeView,
    tableResult, tableLoading, tableError,
    page, sortCol, sortDir, tableFilters, setTableFilters,
    mongoFilter, setMongoFilter,
    pageSize, setPageSize,
    queryTabs, activeTabId,
    queryHistory,
    setActiveView, setPage, setSortCol, setSortDir,
    addTab, closeTab, setActiveTab, renameTab, setTabSql,
  } = useViewStore();

  const activeTab    = queryTabs.find(t => t.id === activeTabId) ?? queryTabs[0];
  const sql          = activeTab?.sql         ?? "";
  const queryResult  = activeTab?.result      ?? null;
  const queryLoading = activeTab?.loading     ?? false;
  const queryError   = activeTab?.error       ?? null;
  const setSql = (s: string) => setTabSql(activeTabId, s);

  const { loadTableData, loadColumns } = useSchema();
  const { run } = useQuery();
  const [showSaved, setShowSaved] = useState(false);

  const activeMeta = activeConnections.find(c => c.id === activeConnectionId);
  const isMongo = activeMeta?.db_type === "mongodb";

  useEffect(() => {
    if (activeView === "structure" && selectedTable) loadColumns(selectedTable);
  }, [activeView, selectedTable]);

  useEffect(() => {
    if ((activeView === "table" || activeView === "document") && selectedTable) loadColumns(selectedTable);
  }, [selectedTable]);

  const pkCol = columns.find(c => c.is_pk)?.name ?? null;

  // ── CRUD handlers ─────────────────────────────────────────────────────────────

  const handleCellEdit = useCallback(async (row: Record<string, unknown>, col: string, newValue: string) => {
    if (!selectedTable || !activeConnectionId) return;

    if (isMongo) {
      // MongoDB: use update_document with $set
      const idHex = String(row._id ?? "");
      if (!idHex) return;
      // Smart value encoding: try JSON parse, fall back to string
      const valueJson = mongoEncodeValue(newValue);
      await invoke("update_document", { connId: activeConnectionId, collection: selectedTable, idHex, field: col, valueJson });
    } else {
      if (!pkCol) return;
      const q = `UPDATE ${ident(selectedTable)} SET ${ident(col)} = ${toSqlLiteral(newValue)} WHERE ${ident(pkCol)} = ${pkToLiteral(row[pkCol])}`;
      await invoke<QueryResult>("run_query", { connId: activeConnectionId, sql: q });
    }
    await loadTableData(selectedTable, page, sortCol, sortDir);
  }, [selectedTable, pkCol, activeConnectionId, isMongo, page, sortCol, sortDir, loadTableData]);

  const handleRowDelete = useCallback(async (row: Record<string, unknown>) => {
    if (!selectedTable || !activeConnectionId) return;
    if (isMongo) {
      // MongoDB: use delete_document by _id
      const idHex = String(row._id ?? "");
      if (!idHex) return;
      await invoke("delete_document", { connId: activeConnectionId, collection: selectedTable, idHex });
    } else {
      if (!pkCol) return;
      const pkValue = row[pkCol];
      await deleteRow(activeConnectionId, { table: selectedTable, pk_column: pkCol, pk_value: pkValue });
    }
    await loadTableData(selectedTable, page, sortCol, sortDir);
  }, [selectedTable, pkCol, activeConnectionId, isMongo, page, sortCol, sortDir, loadTableData]);

  const handleRowInsert = useCallback(async (values: Record<string, string>) => {
    if (!selectedTable || !activeConnectionId) return;
    if (isMongo) {
      // MongoDB: handled by handleInsertDocument
      return;
    }
    const cols = Object.keys(values).filter(k => values[k].trim() !== "");
    if (!cols.length) return;
    // Build values object for insert_row command
    const insertValues: Record<string, unknown> = {};
    for (const col of cols) {
      const raw = values[col].trim();
      if (raw === "" || raw.toLowerCase() === "null") {
        insertValues[col] = null;
      } else if (!isNaN(Number(raw))) {
        insertValues[col] = Number(raw);
      } else if (raw.toLowerCase() === "true") {
        insertValues[col] = true;
      } else if (raw.toLowerCase() === "false") {
        insertValues[col] = false;
      } else {
        insertValues[col] = raw;
      }
    }
    await insertRow(activeConnectionId, { table: selectedTable, values: insertValues });
    await loadTableData(selectedTable, page, sortCol, sortDir);
  }, [selectedTable, activeConnectionId, isMongo, page, sortCol, sortDir, loadTableData]);

  // A4 — MongoDB insert document (JSON)
  const handleInsertDocument = useCallback(async (jsonDoc: string) => {
    if (!selectedTable || !activeConnectionId) return;
    await invoke("insert_document", { connId: activeConnectionId, collection: selectedTable, jsonDoc });
    await loadTableData(selectedTable, page, sortCol, sortDir);
  }, [selectedTable, activeConnectionId, page, sortCol, sortDir, loadTableData]);

  // P2 — batch save (all pending edits at once, single reload)
  const handleBatchSave = useCallback(async (edits: { row: Record<string, unknown>; col: string; newValue: string }[]) => {
    if (!selectedTable || !activeConnectionId) return;
    for (const edit of edits) {
      if (isMongo) {
        const idHex = String(edit.row._id ?? "");
        if (!idHex) continue;
        await invoke("update_document", { connId: activeConnectionId, collection: selectedTable, idHex, field: edit.col, valueJson: mongoEncodeValue(edit.newValue) });
      } else {
        if (!pkCol) continue;
        const q = `UPDATE ${ident(selectedTable)} SET ${ident(edit.col)} = ${toSqlLiteral(edit.newValue)} WHERE ${ident(pkCol)} = ${pkToLiteral(edit.row[pkCol])}`;
        await invoke<QueryResult>("run_query", { connId: activeConnectionId, sql: q });
      }
    }
    await loadTableData(selectedTable, page, sortCol, sortDir);
  }, [selectedTable, pkCol, activeConnectionId, isMongo, page, sortCol, sortDir, loadTableData]);

  // P3 — replace entire MongoDB document (JSON editor modal)
  const handleReplaceDocument = useCallback(async (idHex: string, jsonDoc: string) => {
    if (!selectedTable || !activeConnectionId) return;
    await invoke("replace_document", { connId: activeConnectionId, collection: selectedTable, idHex, jsonDoc });
    await loadTableData(selectedTable, page, sortCol, sortDir);
  }, [selectedTable, activeConnectionId, page, sortCol, sortDir, loadTableData]);

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (!activeConnectionId) {
    return (
      <main className="flex-1 flex items-center justify-center flex-col gap-4 bg-[#0d1117]">
        <div className="w-16 h-16 rounded-2xl bg-[#21262d] border border-[#30363d] flex items-center justify-center">
          <DatabaseZap size={26} className="text-[#7d8590]" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-[#e6edf3] text-sm font-medium">No connection selected</p>
          <p className="text-[#7d8590] text-xs">Choose a connection from the sidebar to get started</p>
        </div>
      </main>
    );
  }

  // ── Pagination ────────────────────────────────────────────────────────────────
  const handleSort = (col: string) => {
    const newDir = sortCol === col && sortDir === "asc" ? "desc" : "asc";
    setSortCol(col); setSortDir(newDir);
    if (selectedTable) loadTableData(selectedTable, page, col, newDir);
  };
  const handlePrev = () => {
    if (page === 0 || !selectedTable) return;
    const p = page - 1; setPage(p); loadTableData(selectedTable, p, sortCol, sortDir);
  };
  const handleNext = () => {
    if (!selectedTable) return;
    const p = page + 1; setPage(p); loadTableData(selectedTable, p, sortCol, sortDir);
  };
  const hasNextPage = (tableResult?.rows.length ?? 0) === PAGE_SIZE;

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const TABS: { id: string; label: string; icon: React.ElementType }[] = isMongo
    ? [
        { id: "table",     label: "Data",      icon: Table2 },
        { id: "document",  label: "Document",  icon: FileText },
        { id: "query",     label: "Query",     icon: Terminal },
        { id: "structure", label: "Structure", icon: ListTree },
        { id: "indexes",   label: "Indexes",   icon: Hash },
      ]
    : [
        { id: "table",     label: "Data",      icon: Table2 },
        { id: "query",     label: "Query",     icon: Terminal },
        { id: "structure", label: "Structure", icon: ListTree },
        { id: "indexes",   label: "Indexes",   icon: Hash },
      ];

  const paginationBar = (
    <div className="shrink-0 border-t border-[#30363d] px-4 py-2 flex items-center justify-between bg-[#0d1117]">
      <button onClick={handlePrev} disabled={page === 0 || tableLoading}
        className="flex items-center gap-1 text-xs text-[#7d8590] hover:text-[#e6edf3] disabled:opacity-30 disabled:cursor-not-allowed transition-all rounded-lg px-2 py-1 hover:bg-[#292e36]">
        <ChevronLeft size={13} /> Prev
      </button>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-[#7d8590] font-medium tabular-nums">Page {page + 1}</span>
        <select
          value={pageSize}
          onChange={e => {
            const n = Number(e.target.value);
            setPageSize(n);
            setPage(0);
            if (selectedTable) loadTableData(selectedTable, 0, sortCol, sortDir);
          }}
          className="text-[10px] text-[#7d8590] bg-[#21262d] border border-[#30363d] rounded-lg px-1.5 py-0.5 outline-none cursor-pointer hover:border-[#484f58] transition-colors"
        >
          {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}/page</option>)}
        </select>
      </div>
      <button onClick={handleNext} disabled={!hasNextPage || tableLoading}
        className="flex items-center gap-1 text-xs text-[#7d8590] hover:text-[#e6edf3] disabled:opacity-30 disabled:cursor-not-allowed transition-all rounded-lg px-2 py-1 hover:bg-[#292e36]">
        Next <ChevronRight size={13} />
      </button>
    </div>
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      {/* ── Tab bar (UI-3) ── */}
      <div className="flex items-center border-b border-[#30363d] px-3 shrink-0 bg-[#161b22]">
        <div className="flex -mb-px">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveView(id as never)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium transition-all border-b-2 ${
                activeView === id
                  ? "border-blue-500 text-white"
                  : "border-transparent text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36]"
              }`}>
              <Icon size={11} className={activeView === id ? "text-blue-400" : ""} />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs">
          {/* Breadcrumb badge */}
          {selectedTable && (
            <span className="text-[11px] font-mono text-[#7d8590] bg-[#21262d] border border-[#30363d] rounded-lg px-2 py-0.5 max-w-[200px] truncate">
              {isMongo && selectedDatabase && (
                <span className="text-[#484f58]">{selectedDatabase} › </span>
              )}
              {selectedTable}
            </span>
          )}
          {tableResult && (activeView === "table" || activeView === "document") && (
            <span className="text-[11px] text-[#7d8590]">{tableResult.rows.length} rows</span>
          )}
          {activeView === "query" && (
            <button onClick={() => setShowSaved(v => !v)} title="Saved queries"
              className={`p-1.5 rounded-lg transition-all ${showSaved ? "text-blue-400 bg-blue-500/10 border border-blue-500/20" : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36]"}`}>
              <Bookmark size={12} />
            </button>
          )}
          {(activeView === "table" || activeView === "document") && selectedTable && (
            <button onClick={() => loadTableData(selectedTable, page, sortCol, sortDir)} disabled={tableLoading}
              title="Reload" className="p-1.5 rounded-lg text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] disabled:opacity-30 transition-all">
              <RefreshCw size={12} className={tableLoading ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* ── Data tab ──────────────────────────────────────────────────────── */}
        {activeView === "table" && (
          !selectedTable ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#21262d] border border-[#30363d] flex items-center justify-center">
                <Table2 size={20} className="text-[#7d8590]" />
              </div>
              <div className="text-center">
                <p className="text-[#e6edf3] text-sm font-medium">No {isMongo ? "collection" : "table"} selected</p>
                <p className="text-[#7d8590] text-xs mt-0.5">Pick one from the sidebar to browse data</p>
              </div>
            </div>
          ) : (
            <>
              <FilterBar
                columns={tableColumns[selectedTable] ?? columns.map(c => c.name)}
                columnMeta={columns.map(c => ({ name: c.name, data_type: c.data_type }))}
                filters={tableFilters}
                onChange={setTableFilters}
                onApply={() => { setPage(0); loadTableData(selectedTable, 0, sortCol, sortDir, tableFilters); }}
                isMongo={isMongo}
                mongoFilter={mongoFilter}
                onMongoFilterChange={setMongoFilter}
                hasActiveFilter={isMongo ? (mongoFilter.trim() !== "" && mongoFilter.trim() !== "{}") : tableFilters.length > 0}
              />
              <div className="flex-1 overflow-hidden flex flex-col">
                <DataGrid
                  result={tableResult}
                  loading={tableLoading}
                  error={tableError}
                  sortCol={sortCol}
                  sortDir={sortDir}
                  onSort={handleSort}
                  editMode={isMongo ? true : !!pkCol}
                  readonlyCols={isMongo ? ["_id"] : []}
                  pkCol={pkCol ?? undefined}
                  isMongo={isMongo}
                  dbType={activeMeta?.db_type}
                  onCellEdit={handleCellEdit}
                  onBatchSave={handleBatchSave}
                  onRowDelete={handleRowDelete}
                  insertColumns={!isMongo ? columns.map(c => c.name) : []}
                  onRowInsert={!isMongo ? handleRowInsert : undefined}
                  tableName={selectedTable ?? undefined}
                />
              </div>
              {paginationBar}
            </>
          )
        )}

        {/* ── Document tab (A2 — MongoDB only) ─────────────────────────────── */}
        {activeView === "document" && (
          !selectedTable ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#21262d] border border-[#30363d] flex items-center justify-center">
                <FileText size={18} className="text-[#7d8590]" />
              </div>
              <p className="text-[#7d8590] text-sm">Select a collection to view documents</p>
            </div>
          ) : (
            <>
              <FilterBar
                columns={columns.map(c => c.name)}
                columnMeta={columns.map(c => ({ name: c.name, data_type: c.data_type }))}
                filters={[]}
                onChange={() => {}}
                onApply={() => { setPage(0); loadTableData(selectedTable, 0, sortCol, sortDir); }}
                isMongo={true}
                mongoFilter={mongoFilter}
                onMongoFilterChange={setMongoFilter}
                hasActiveFilter={mongoFilter.trim() !== "" && mongoFilter.trim() !== "{}"}
              />
              <DocumentView
                result={tableResult}
                loading={tableLoading}
                error={tableError}
                onDelete={handleRowDelete}
                onInsert={handleInsertDocument}
                onEdit={handleReplaceDocument}
              />
              {paginationBar}
            </>
          )
        )}

        {/* ── Query tab ─────────────────────────────────────────────────────── */}
        {activeView === "query" && (
          <div className="flex h-full overflow-hidden">
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              <div className="flex items-center border-b border-[#30363d] bg-[#161b22] px-2 shrink-0 overflow-x-auto">
                {queryTabs.map((tab) => (
                  <div key={tab.id}
                    className={`flex items-center gap-1 group shrink-0 border-b-2 -mb-px transition-all ${
                      tab.id === activeTabId
                        ? "border-blue-500 text-[#e6edf3]"
                        : "border-transparent text-[#7d8590] hover:text-[#e6edf3]"
                    }`}>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      onDoubleClick={() => {
                        const name = window.prompt("Rename tab:", tab.label);
                        if (name?.trim()) renameTab(tab.id, name.trim());
                      }}
                      className="px-3 py-2 text-xs font-medium whitespace-nowrap" title="Double-click to rename">
                      {tab.label}
                      {tab.loading && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />}
                    </button>
                    {queryTabs.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[#7d8590] hover:text-[#e6edf3] pr-1.5 transition-opacity text-[10px]">✕</button>
                    )}
                  </div>
                ))}
                <button onClick={addTab} title="New tab"
                  className="ml-1 px-2 py-1.5 text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] rounded transition-colors text-sm shrink-0">+</button>
              </div>
              <AiQueryBox onInsert={setSql} onRun={run} />
              <div className="flex-1 overflow-hidden">
                <SqlEditor
                  key={activeTabId}
                  sql={sql}
                  onChange={setSql}
                  onRun={run}
                  result={queryResult}
                  loading={queryLoading}
                  error={queryError}
                  queryHistory={queryHistory}
                />
              </div>
            </div>
            {showSaved && (
              <SavedQueriesPanel currentSql={sql} onLoad={setSql} onRun={run} onClose={() => setShowSaved(false)} />
            )}
          </div>
        )}

        {/* ── Indexes tab (B4) ──────────────────────────────────────────────── */}
        {activeView === "indexes" && (
          !selectedTable ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#21262d] border border-[#30363d] flex items-center justify-center">
                <Hash size={18} className="text-[#7d8590]" />
              </div>
              <p className="text-[#7d8590] text-sm">Select a {isMongo ? "collection" : "table"} to view indexes</p>
            </div>
          ) : activeConnectionId ? (
            <IndexView connId={activeConnectionId} table={selectedTable} />
          ) : null
        )}

        {/* ── Structure tab ─────────────────────────────────────────────────── */}
        {activeView === "structure" && (
          !selectedTable ? (
            <div className="flex-1 flex items-center justify-center text-[#7d8590] text-sm">
              Select a {isMongo ? "collection" : "table"} from the sidebar
            </div>
          ) : columnsLoading ? (
            <div className="flex-1 flex items-center justify-center text-[#7d8590] gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading structure…</span>
            </div>
          ) : columns.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[#484f58] text-sm">No field info available</div>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    {["#", "Field", "Type", "Nullable", ""].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-[10px] font-semibold text-[#7d8590] uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <tr key={col.name} className={`border-b border-[#21262d] transition-colors hover:bg-[#292e36] ${i % 2 === 0 ? "" : "bg-[#161b22]/30"}`}>
                      <td className="px-3 py-2 text-xs text-[#484f58] font-mono">{i + 1}</td>
                      <td className="px-3 py-2 max-w-[200px] text-xs font-medium text-[#e6edf3]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {col.is_pk && <span className="text-yellow-400 text-[10px] shrink-0" title="Primary Key">🔑</span>}
                          <span className="truncate flex-1" title={col.name}>{col.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 max-w-[220px]">
                        <span className="block text-[11px] font-mono text-sky-400/80 bg-sky-900/20 border border-sky-800/30 rounded px-1.5 py-0.5 truncate" title={col.data_type}>{col.data_type}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {col.nullable
                          ? <span className="text-[#7d8590]">nullable</span>
                          : <span className="text-emerald-500 text-[10px] font-medium bg-emerald-900/20 border border-emerald-800/30 rounded px-1.5 py-0.5">NOT NULL</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {col.is_pk && <span className="text-[10px] text-yellow-500 font-medium bg-yellow-900/20 border border-yellow-700/30 rounded px-1.5 py-0.5">PRIMARY KEY</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </main>
  );
}
