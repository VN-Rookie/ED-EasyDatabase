import { useState, useCallback, useRef, useEffect, type PointerEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { Play, Loader2, TableProperties, Maximize2, AlertCircle, ChevronDown, Sparkles, Bookmark } from "lucide-react";
import { runQuery } from "../object-view/objectApi";
import { generateSql } from "./aiApi";
import { listTables, describeTable } from "../explorer/schemaApi";
import { CellDetailModal } from "../../shared/ui/CellDetailModal";
import { SavedQueriesPanel } from "../saved-queries/SavedQueriesPanel";
import { useConnectionStore } from "../connection/connectionStore";
import { useThemeStore } from "../../stores/themeStore";
import type { QueryResult, TableInfo } from "../../shared/types";

// MQL (MongoDB Query Language) syntax highlighting
const mqlLanguage = StreamLanguage.define({
  token(stream) {
    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Strings (single and double quotes)
    if (stream.match(/^["'][^"']*["']/)) return "string";
    if (stream.match(/^""/)) return "string";

    // Numbers
    if (stream.match(/^-?\d+\.?\d*/)) return "number";

    // Boolean and null
    if (stream.match(/^true\b/)) return "keyword";
    if (stream.match(/^false\b/)) return "keyword";
    if (stream.match(/^null\b/)) return "keyword";

    // Operators
    if (stream.match(/^[{}[\]():,]/)) return "bracket";
    if (stream.match(/^[<>]=?|==|!=|\+|\-|\*|\/|\$]/)) return "operator";

    // MongoDB operators (starting with $)
    if (stream.match(/^\$\w+/)) return "keyword";

    // Identifiers (field names, collection names)
    if (stream.match(/^[a-zA-Z_]\w*/)) {
      return "variable";
    }

    // Move past any other character
    stream.next();
    return null;
  },
});

const MAX_CELL_LEN = 80;

// SQL Keywords for auto-completion
const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
  "IS", "NULL", "TRUE", "FALSE", "ORDER", "BY", "ASC", "DESC", "LIMIT",
  "OFFSET", "GROUP", "HAVING", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
  "FULL", "CROSS", "ON", "AS", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "DROP",
  "ALTER", "TABLE", "INDEX", "VIEW", "IF", "EXISTS", "PRIMARY", "KEY",
  "FOREIGN", "REFERENCES", "UNIQUE", "DEFAULT", "CONSTRAINT", "CASCADE",
  "UNION", "ALL", "INTERSECT", "EXCEPT", "CASE", "WHEN", "THEN", "ELSE",
  "END", "COALESCE", "NULLIF", "CAST", "CONVERT", "WITH", "RECURSIVE",
  "RETURNING", "DISTINCT", "OVER", "PARTITION", "ROW_NUMBER", "RANK",
  "DENSE_RANK", "LAG", "LEAD", "FIRST_VALUE", "LAST_VALUE", "NTH_VALUE",
];

interface CellModal { column: string; value: string }

// Schema cache for completions
interface SchemaCache {
  tables: TableInfo[];
  tableColumns: Map<string, { name: string; type: string }[]>;
  timestamp: number;
}

function ResultsTable({ result }: { result: QueryResult }) {
  const [modal, setModal] = useState<CellModal | null>(null);

  const renderCell = (col: string, raw: unknown) => {
    if (raw === null || raw === undefined) return <span className="text-faint italic">NULL</span>;
    const str = typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    if (str.length <= MAX_CELL_LEN) return <span className="block truncate whitespace-nowrap">{str}</span>;
    return (
      <span className="flex items-center gap-1 min-w-0">
        <span className="flex-1 truncate whitespace-nowrap min-w-0">{str.slice(0, MAX_CELL_LEN)}…</span>
        <button
          onClick={() => setModal({ column: col, value: str })}
          className="shrink-0 p-0.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors"
          title="View full value"
        >
          <Maximize2 size={10} />
        </button>
      </span>
    );
  };

  return (
    <>
      {modal && <CellDetailModal column={modal.column} value={modal.value} onClose={() => setModal(null)} />}
      <table className="text-left border-collapse w-full">
        <thead className="sticky top-0 bg-surface shadow-sm z-10">
          <tr className="border-b border-border">
            {result.columns.map((c) => (
              <th key={c} className="px-3 py-2 whitespace-nowrap">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{c}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className={`border-b border-border/60 hover:bg-hover ${i % 2 === 1 ? "bg-surface/40" : ""}`}>
              {result.columns.map((c) => (
                <td key={c} className="px-3 py-1.5 text-[12px] font-mono text-fg/90">
                  <div className="max-w-[280px] overflow-hidden">
                    {renderCell(c, row[c])}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function SqlConsoleShell() {
  const { activeConnections, activeConnectionId } = useConnectionStore();
  const [connId, setConnId] = useState<string>("");
  const pref = useThemeStore((s) => s.pref);
  const isDark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // Get connection type for syntax highlighting
  const currentConnection = activeConnections.find((c) => c.id === connId);
  const isMongoConnection = currentConnection?.db_type === "mongodb";

  useEffect(() => {
    const newConnId = connId || activeConnectionId || activeConnections[0]?.id || "";
    setConnId(newConnId);

    // Set default query based on connection type when connection changes
    const newConn = activeConnections.find((c) => c.id === newConnId);
    if (newConn && !query) {
      setQuery(newConn.db_type === "mongodb" ? "db.collection.find({})" : "SELECT 1;");
    }
  }, [activeConnectionId, activeConnections]);

  // Load schema for auto-completion when connection changes
  useEffect(() => {
    if (!connId || isMongoConnection) return;

    const loadSchema = async () => {
      try {
        const tables = await listTables(connId);
        const tableColumns = new Map<string, { name: string; type: string }[]>();

        // Load columns for each table
        for (const table of tables) {
          try {
            const columns = await describeTable(connId, table.name);
            tableColumns.set(table.name, columns.map(c => ({ name: c.name, type: c.data_type })));
          } catch {
            // Table might not exist or be accessible
            tableColumns.set(table.name, []);
          }
        }

        setSchemaCache({
          tables,
          tableColumns,
          timestamp: Date.now(),
        });
      } catch {
        // Schema loading is best-effort for completions
      }
    };

    loadSchema();
  }, [connId, isMongoConnection]);

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const viewRef = useRef<EditorView | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [resultsHeight, setResultsHeight] = useState(208);
  const [schemaCache, setSchemaCache] = useState<SchemaCache>({
    tables: [],
    tableColumns: new Map(),
    timestamp: 0,
  });
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onDragStart = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: resultsHeight };
  }, [resultsHeight]);

  const onDragMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startY - e.clientY;
    const next = Math.min(600, Math.max(80, dragRef.current.startH + delta));
    setResultsHeight(next);
  }, []);

  const onDragEnd = useCallback(() => { dragRef.current = null; }, []);

  const execute = useCallback(async () => {
    if (!connId || running) return;
    const view = viewRef.current;
    const sel = view?.state.selection.main;
    const textToRun = (sel && sel.from !== sel.to)
      ? view!.state.sliceDoc(sel.from, sel.to)
      : query;
    if (!textToRun.trim()) return;
    setRunning(true);
    setResult(null);
    setError("");
    setElapsed(null);
    startRef.current = Date.now();
    try {
      const r = await runQuery(connId, textToRun);
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setElapsed(Date.now() - startRef.current);
      setRunning(false);
    }
  }, [connId, query, running]);

  const loadSqlIntoEditor = useCallback((sqlStr: string) => {
    setQuery(sqlStr);
    if (viewRef.current) {
      const view = viewRef.current;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: sqlStr } });
    }
  }, []);

  const generateQuery = useCallback(async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      let schemaContext = "";
      if (connId) {
        try {
          const tables = await listTables(connId);
          schemaContext = tables.map((t) => t.name).join(", ");
          if (schemaContext) schemaContext = `Tables: ${schemaContext}`;
        } catch { /* schema context is best-effort */ }
      }
      const generatedSql = await generateSql(aiPrompt, schemaContext);
      loadSqlIntoEditor(generatedSql);
      setAiOpen(false);
      setAiPrompt("");
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, aiLoading, connId, loadSqlIntoEditor]);

  // Custom SQL completion source using schema
  const sqlCompletionSource = useCallback((context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const completions: { label: string; type: string; detail?: string }[] = [];

    // Add SQL keywords
    for (const kw of SQL_KEYWORDS) {
      if (kw.toLowerCase().startsWith(word.text.toLowerCase())) {
        completions.push({ label: kw, type: "keyword" });
      }
    }

    // Add tables from schema
    for (const table of schemaCache.tables) {
      if (table.name.toLowerCase().startsWith(word.text.toLowerCase())) {
        completions.push({ label: table.name, type: "class", detail: "table" });
      }
    }

    // Add columns with table prefix (e.g., "table.column")
    for (const [tableName, columns] of schemaCache.tableColumns) {
      for (const col of columns) {
        const prefixed = `${tableName}.${col.name}`;
        if (prefixed.toLowerCase().startsWith(word.text.toLowerCase())) {
          completions.push({ label: prefixed, type: "property", detail: col.type });
        }
        // Also add unprefixed columns
        if (col.name.toLowerCase().startsWith(word.text.toLowerCase())) {
          completions.push({ label: col.name, type: "property", detail: `${tableName}.${col.type}` });
        }
      }
    }

    return {
      from: word.from,
      options: completions,
      validFor: /^\w*$/,
    };
  }, [schemaCache]);

  // Choose language extension based on connection type
  const cmExtensions = [
    isMongoConnection ? mqlLanguage : sql({ dialect: PostgreSQL, tables: schemaCache.tables.map(t => ({ label: t.name, columns: schemaCache.tableColumns.get(t.name)?.map(c => ({ label: c.name, type: c.type })) || [] })) }),
    autocompletion({ override: isMongoConnection ? [] : [sqlCompletionSource] }),
    keymap.of([{ key: "Mod-Enter", run: () => { execute(); return true; } }]),
  ];

  const noConn = activeConnections.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface shrink-0">
        {/* Connection selector */}
        <div className="relative flex items-center">
          <select
            value={connId}
            onChange={(e) => setConnId(e.target.value)}
            disabled={noConn}
            className="appearance-none bg-elevated border border-border rounded-[var(--radius-sm)] text-xs text-fg pl-2.5 pr-6 py-1 cursor-pointer hover:border-accent focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {noConn
              ? <option value="">No connections</option>
              : activeConnections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
            }
          </select>
          <ChevronDown size={10} className="absolute right-1.5 text-muted pointer-events-none" />
        </div>

        {/* Run button */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={execute}
          disabled={noConn || running}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent text-on-accent text-xs font-medium hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Run (⌘↵)"
        >
          {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          Run
        </button>

        {/* Status */}
        {elapsed !== null && !running && (
          <span className="text-[11px] text-muted ml-1">
            {result
              ? result.rows.length > 0
                ? `${result.rows.length} row${result.rows.length !== 1 ? "s" : ""} · ${elapsed}ms`
                : result.rows_affected !== null
                  ? `${result.rows_affected} row${result.rows_affected !== 1 ? "s" : ""} affected · ${elapsed}ms`
                  : `OK · ${elapsed}ms`
              : `${elapsed}ms`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => { setAiOpen((v) => !v); setAiError(""); }}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs transition-colors ${aiOpen ? "bg-accent/15 text-accent" : "text-muted hover:text-fg hover:bg-hover"}`}
            title="Generate SQL with AI"
          >
            <Sparkles size={11} />
            AI
          </button>
          <button
            onClick={() => setSnippetsOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs transition-colors ${snippetsOpen ? "bg-accent/15 text-accent" : "text-muted hover:text-fg hover:bg-hover"}`}
            title="Saved queries"
          >
            <Bookmark size={11} />
            Snippets
          </button>
        </div>
        <span className="text-[10px] text-faint">⌘↵ to run</span>
      </div>

      {/* AI prompt bar */}
      {aiOpen && (
        <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border bg-elevated shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={11} className="text-accent shrink-0" />
            <input
              autoFocus
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generateQuery(); } }}
              placeholder="Describe the query in natural language…"
              className="flex-1 bg-transparent text-xs text-fg placeholder:text-faint outline-none"
            />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={generateQuery}
              disabled={aiLoading || !aiPrompt.trim()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent text-on-accent text-xs font-medium hover:bg-accent-strong disabled:opacity-50 transition-colors"
            >
              {aiLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              Generate
            </button>
          </div>
          {aiError && <p className="text-[11px] text-danger font-mono">{aiError}</p>}
        </div>
      )}

      {/* Editor + Snippets side panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Editor */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CodeMirror
              value={query}
              onChange={setQuery}
              onCreateEditor={(view) => { viewRef.current = view; }}
              theme={isDark ? oneDark : "light"}
              extensions={cmExtensions}
              height="100%"
              basicSetup={{ lineNumbers: true, foldGutter: false }}
            />
          </div>

          {/* Drag handle */}
          <div
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            className="h-1.5 shrink-0 cursor-row-resize bg-border hover:bg-accent/50 transition-colors"
            title="Drag to resize"
          />

          {/* Results panel */}
          <div style={{ height: resultsHeight }} className="border-t border-border flex flex-col shrink-0 overflow-hidden">
            {error ? (
              <div className="flex-1 overflow-auto p-3 flex gap-2">
                <AlertCircle size={13} className="text-danger shrink-0 mt-0.5" />
                <pre className="text-xs text-danger font-mono whitespace-pre-wrap break-words">{error}</pre>
              </div>
            ) : result ? (
              result.rows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-xs text-faint italic">
                    {result.rows_affected !== null
                      ? `${result.rows_affected} row${result.rows_affected !== 1 ? "s" : ""} affected`
                      : "Query returned no rows"}
                  </span>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <ResultsTable result={result} />
                </div>
              )
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2 text-faint">
                <TableProperties size={13} />
                <span className="text-xs">Run a query to see results</span>
              </div>
            )}
          </div>
        </div>
        {snippetsOpen && (
          <SavedQueriesPanel
            currentSql={query}
            onLoad={loadSqlIntoEditor}
            onRun={(sqlStr) => { loadSqlIntoEditor(sqlStr); execute(); }}
            onClose={() => setSnippetsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
