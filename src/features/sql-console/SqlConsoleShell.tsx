import { useState, useCallback, useRef, useEffect, type PointerEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { linter, type Diagnostic } from "@codemirror/lint";
import { format } from "sql-formatter";
import { Play, Loader2, TableProperties, Maximize2, AlertCircle, ChevronDown, Sparkles, Bookmark, Wand2, History, Zap, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save as nativeSave } from "@tauri-apps/plugin-dialog";
import { runQuery } from "../object-view/objectApi";
import { generateSql, fixSqlError } from "./aiApi";
import { useTranslation } from "../../hooks/useTranslation";
import { listTables, listDatabases, switchMongoDb, describeSchema } from "../explorer/schemaApi";
import { CellDetailModal } from "../../shared/ui/CellDetailModal";
import { SavedQueriesPanel } from "../saved-queries/SavedQueriesPanel";
import { QueryHistoryPanel } from "./QueryHistoryPanel";
import { QueryTabsBar, type QueryTab } from "./QueryTabsBar";
import { useConnectionStore } from "../connection/connectionStore";
import { useThemeStore } from "../../stores/themeStore";
import { useViewStore } from "../../stores/viewStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToast } from "../../components/Toast";
import type { QueryResult, TableInfo } from "../../shared/types";
import { buildSchemaContext } from "../../lib/schemaContext";

// ── EXPLAIN plan types ────────────────────────────────────────────────────────
interface ExplainNode {
  "Node Type": string;
  "Startup Cost"?: number;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Actual Rows"?: number;
  "Actual Total Time"?: number;
  "Relation Name"?: string;
  "Index Name"?: string;
  Plans?: ExplainNode[];
  [k: string]: unknown;
}

function ExplainTree({ node, depth = 0 }: { node: ExplainNode; depth?: number }) {
  const [open, setOpen] = useState(true);
  const children = node.Plans ?? [];
  const cost = node["Total Cost"];
  const rows = node["Actual Rows"] ?? node["Plan Rows"];
  const time = node["Actual Total Time"];
  const label = node["Relation Name"] ? `${node["Node Type"]} on ${node["Relation Name"]}` : node["Node Type"];
  const indexNote = node["Index Name"] ? ` using ${node["Index Name"]}` : "";
  const expensiveThreshold = 1000;

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div className="flex items-center gap-2 py-0.5 group">
        {children.length > 0 && (
          <button onClick={() => setOpen(v => !v)} className="text-muted hover:text-fg shrink-0 text-[10px] w-3">{open ? "▾" : "▸"}</button>
        )}
        {children.length === 0 && <span className="w-3 shrink-0" />}
        <span className={`text-xs font-medium ${cost && cost > expensiveThreshold ? "text-warn" : "text-fg"}`}>
          {label}{indexNote}
        </span>
        <div className="flex items-center gap-2 ml-auto shrink-0 text-[10px] font-mono opacity-70">
          {cost !== undefined && <span className={`${cost > expensiveThreshold ? "text-warn font-semibold" : "text-muted"}`}>cost={cost.toFixed(2)}</span>}
          {rows !== undefined && <span className="text-muted">rows={rows}</span>}
          {time !== undefined && <span className={`${time > 100 ? "text-warn" : "text-ok"}`}>{time.toFixed(2)}ms</span>}
        </div>
      </div>
      {open && children.map((child, i) => <ExplainTree key={i} node={child} depth={depth + 1} />)}
    </div>
  );
}

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

const MQL_METHODS = ["find", "findOne", "countDocuments", "sort", "limit", "skip"];
const MQL_OPERATORS = [
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin",
  "$and", "$or", "$not", "$regex", "$exists", "$type", "$size", "$elemMatch",
];

const sqlLinter = (view: EditorView): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const docText = view.state.doc.toString();

  // 1. SELECT * Check
  const selectAllRegex = /\bSELECT\s+\*\b/gi;
  let match;
  while ((match = selectAllRegex.exec(docText)) !== null) {
    diagnostics.push({
      from: match.index,
      to: match.index + match[0].length,
      severity: "warning",
      message: "SELECT * might perform poorly on large tables. Consider listing columns explicitly.",
    });
  }

  // 2. Comma Join Check (Implicit Cross Join)
  const commaJoinRegex = /\bFROM\s+[a-zA-Z_]\w*\s*,\s*[a-zA-Z_]\w*\b/gi;
  while ((match = commaJoinRegex.exec(docText)) !== null) {
    diagnostics.push({
      from: match.index,
      to: match.index + match[0].length,
      severity: "warning",
      message: "Comma-separated implicit joins can cause performance issues (Cartesian product). Use explicit JOIN ... ON syntax.",
    });
  }

  // 3. Non-Sargable WHERE Function Call Check (e.g., WHERE DATE(col) = )
  const nonSargableRegex = /\bWHERE\s+[a-zA-Z_]\w*\(\s*[a-zA-Z_]\w*\s*\)/gi;
  while ((match = nonSargableRegex.exec(docText)) !== null) {
    diagnostics.push({
      from: match.index,
      to: match.index + match[0].length,
      severity: "warning",
      message: "Applying functions to columns inside WHERE clause may disable index usage (Non-Sargable Query).",
    });
  }

  return diagnostics;
};

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

export function SqlConsoleShell({ connId: initialConnId }: { connId?: string }) {
  const { t } = useTranslation();
  const { activeConnections, activeConnectionId } = useConnectionStore();
  const { toast } = useToast();
  const [connId, setConnId] = useState<string>(initialConnId || activeConnectionId || "");
  const pref = useThemeStore((s) => s.pref);
  const isDark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const pushHistory = useViewStore((s) => s.pushHistory);
  const editorFontSize = useSettingsStore((s) => s.settings.editor_font_size);
  const editorFontFamily = useSettingsStore((s) => s.settings.editor_font_family);

  // Get connection type for syntax highlighting
  const currentConnection = activeConnections.find((c) => c.id === connId);
  const isMongoConnection = currentConnection?.db_type === "mongodb";
  // MongoDB console db context (queries run against the driver's current db)
  const [mongoDbs, setMongoDbs] = useState<string[]>([]);
  const [mongoDb, setMongoDb] = useState("");

  useEffect(() => {
    const newConnId = connId || initialConnId || activeConnectionId || activeConnections[0]?.id || "";
    setConnId(newConnId);

    // Reset explain states on connection change
    setExplainPlan(null);
    setExplanation(null);
    setExplainError(null);

    // Set default query based on connection type when connection changes
    const newConn = activeConnections.find((c) => c.id === newConnId);
    if (newConn && !currentQuery) {
      const defaultQuery = newConn.db_type === "mongodb" ? "db.collection.find({})" : "SELECT 1;";
      updateTabQuery(defaultQuery);
    }
  }, [activeConnectionId, activeConnections]);

  // Load schema for auto-completion when connection changes.
  useEffect(() => {
    if (!connId) return;

    const loadSchema = async () => {
      try {
        const schemaData = await describeSchema(connId);
        const tables: TableInfo[] = schemaData.map((s) => ({ name: s.table_name }));
        const tableColumns = new Map<string, { name: string; type: string }[]>();

        for (const s of schemaData) {
          tableColumns.set(
            s.table_name,
            s.columns.map((c) => ({ name: c.name, type: c.data_type }))
          );
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
  }, [connId, isMongoConnection, mongoDb]);

  // MongoDB: list databases for the console's db selector.
  useEffect(() => {
    if (!connId || !isMongoConnection) { setMongoDbs([]); setMongoDb(""); return; }
    listDatabases(connId).then(setMongoDbs).catch(() => setMongoDbs([]));
  }, [connId, isMongoConnection]);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const viewRef = useRef<EditorView | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);
  const [aiError, setAiError] = useState("");
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resultsHeight, setResultsHeight] = useState(208);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainPlan, setExplainPlan] = useState<ExplainNode | null>(null);
  const [analyzingPlan, setAnalyzingPlan] = useState(false);
  const [schemaCache, setSchemaCache] = useState<SchemaCache>({
    tables: [],
    tableColumns: new Map(),
    timestamp: 0,
  });

  // Tabs state
  const [tabs, setTabs] = useState<QueryTab[]>([
    { id: "tab-1", title: "Query 1", query: "", isModified: false },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Sync query with active tab
  const currentQuery = activeTab?.query ?? "";

  const handleAddTab = useCallback(() => {
    const newId = `tab-${Date.now()}`;
    setTabs((prev) => [
      ...prev,
      { id: newId, title: `Query ${prev.length + 1}`, query: "", isModified: false },
    ]);
    setActiveTabId(newId);
  }, []);

  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const newTabs = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const idx = prev.findIndex((t) => t.id === id);
        const newActiveIdx = Math.min(idx, newTabs.length - 1);
        setActiveTabId(newTabs[newActiveIdx].id);
      }
      return newTabs;
    });
  }, [activeTabId]);

  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const handleRenameTab = useCallback((id: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
  }, []);

  const updateTabQuery = useCallback((newQuery: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId ? { ...t, query: newQuery, isModified: true } : t
      )
    );
  }, [activeTabId]);

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

  const getQueryToRun = useCallback((): string => {
    const view = viewRef.current;
    if (!view) return currentQuery.trim();

    const sel = view.state.selection.main;
    if (!sel.empty) {
      return view.state.sliceDoc(sel.from, sel.to).trim();
    }

    // Statement Splitting: Extract the SQL statement under the cursor
    const doc = view.state.doc.toString();
    const cursor = sel.head;

    // Find the semicolon before the cursor
    let from = 0;
    for (let i = cursor - 1; i >= 0; i--) {
      if (doc[i] === ";") {
        from = i + 1;
        break;
      }
    }

    // Find the semicolon after the cursor
    let to = doc.length;
    for (let i = cursor; i < doc.length; i++) {
      if (doc[i] === ";") {
        to = i;
        break;
      }
    }

    const statement = doc.slice(from, to).trim();
    if (statement) return statement;

    return currentQuery.trim();
  }, [currentQuery]);

  const execute = useCallback(async () => {
    if (!connId || running) return;
    const textToRun = getQueryToRun();
    if (!textToRun.trim()) return;
    setRunning(true);
    setResult(null);
    setError("");
    setElapsed(null);
    startRef.current = Date.now();
    try {
      const r = await runQuery(connId, textToRun);
      setResult(r);
      pushHistory(textToRun);
    } catch (e) {
      setError(String(e));
    } finally {
      setElapsed(Date.now() - startRef.current);
      setRunning(false);
    }
  }, [connId, getQueryToRun, running, pushHistory]);

  const handleExplain = useCallback(async (queryToExplain: string) => {
    if (!queryToExplain.trim() || !connId) return;
    setExplaining(true);
    setExplainError(null);
    setExplanation(null);
    try {
      const tableNames = schemaCache.tables.map((t) => t.name);
      const schemaContext = await buildSchemaContext(connId, tableNames);
      const text = await invoke<string>("explain_sql", { sql: queryToExplain, schemaContext });
      setExplanation(text);
    } catch (e) {
      setExplainError(String(e));
    } finally {
      setExplaining(false);
    }
  }, [connId, schemaCache.tables]);

  const handleAnalyzePlan = useCallback(async () => {
    const q = getQueryToRun();
    if (!q.trim() || !connId) return;
    setAnalyzingPlan(true);
    setExplainPlan(null);
    setExplainError(null);
    try {
      const res = await invoke<{ rows: Record<string, unknown>[] }>(
        "run_query",
        { connId, sql: `EXPLAIN (ANALYZE, FORMAT JSON) ${q}` }
      );
      const raw = res.rows?.[0]?.["QUERY PLAN"];
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw) as Array<{ Plan: ExplainNode }>;
        setExplainPlan(parsed[0]?.Plan ?? null);
      }
    } catch (e) {
      setExplainError(String(e));
    } finally {
      setAnalyzingPlan(false);
    }
  }, [connId, getQueryToRun]);

  const handleExportResults = useCallback(async () => {
    if (!result || result.rows.length === 0) return;
    
    // Build CSV content
    const header = result.columns.join(",");
    const csvRows = result.rows.map((row) =>
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
        defaultPath: `query_results.csv`,
        filters: [
          { name: "CSV", extensions: ["csv"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (!filePath) return;

      // Invoke save_to_file Tauri backend command
      await invoke("save_to_file", { path: filePath, content: csvContent });

      const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
      toast(`Successfully exported results to ${fileName}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  }, [result, toast]);

  const loadSqlIntoEditor = useCallback((sqlStr: string) => {
    updateTabQuery(sqlStr);
    if (viewRef.current) {
      const view = viewRef.current;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: sqlStr } });
    }
  }, [updateTabQuery]);

  const formatQuery = useCallback(() => {
    if (!currentQuery.trim()) return;
    // Only format for SQL databases, skip for MongoDB
    if (isMongoConnection) return;
    try {
      const formatted = format(currentQuery, {
        language: "postgresql",
        keywordCase: "upper",
        indentStyle: "standard",
      });
      loadSqlIntoEditor(formatted);
    } catch {
      // Silently fail for invalid SQL - formatting is best-effort
    }
  }, [currentQuery, isMongoConnection, loadSqlIntoEditor]);

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

  const handleAiQuickFix = useCallback(async () => {
    if (!error || !connId || aiFixing) return;
    const q = getQueryToRun();
    if (!q.trim()) return;

    setAiFixing(true);
    try {
      let schemaContext = "";
      try {
        const tableNames = schemaCache.tables.map((t) => t.name);
        schemaContext = tableNames.join(", ");
        if (schemaContext) schemaContext = `Tables: ${schemaContext}`;
      } catch { /* best-effort */ }

      const fixed = await fixSqlError(q, error, schemaContext);
      loadSqlIntoEditor(fixed);
      toast("AI fixed the query! Please run it again.", "success");
      setError("");
    } catch (e) {
      toast(`AI Fix failed: ${e}`, "error");
    } finally {
      setAiFixing(false);
    }
  }, [error, connId, aiFixing, getQueryToRun, schemaCache.tables, loadSqlIntoEditor, toast]);

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

  const handleMongoDbChange = async (db: string) => {
    setMongoDb(db);
    try {
      await switchMongoDb(connId, db);
    } catch (e) {
      setError(String(e));
    }
  };

  // MQL completion: collections after "db.", methods after ".", $ operators.
  const mongoCompletionSource = useCallback((context: CompletionContext): CompletionResult | null => {
    const dbMatch = context.matchBefore(/db\.\w*/);
    if (dbMatch) {
      return {
        from: dbMatch.from + 3,
        options: schemaCache.tables.map((t) => ({ label: t.name, type: "class", detail: "collection" })),
        validFor: /^\w*$/,
      };
    }
    const opMatch = context.matchBefore(/\$\w*/);
    if (opMatch) {
      return {
        from: opMatch.from,
        options: MQL_OPERATORS.map((o) => ({ label: o, type: "keyword" })),
        validFor: /^\$\w*$/,
      };
    }
    const methodMatch = context.matchBefore(/\.\w*/);
    if (methodMatch) {
      return {
        from: methodMatch.from + 1,
        options: MQL_METHODS.map((m) => ({ label: m, type: "function", detail: "method" })),
        validFor: /^\w*$/,
      };
    }
    return null;
  }, [schemaCache]);

  // Choose language extension based on connection type
  const cmExtensions = [
    isMongoConnection 
      ? mqlLanguage 
      : sql({ 
          dialect: PostgreSQL, 
          tables: schemaCache.tables.map(t => ({ 
            label: t.name, 
            columns: schemaCache.tableColumns.get(t.name)?.map(c => ({ label: c.name, type: c.type })) || [] 
          })) 
        }),
    ...(isMongoConnection 
      ? [autocompletion({ override: [mongoCompletionSource] })] 
      : [
          PostgreSQL.language.data.of({ autocomplete: sqlCompletionSource }),
          linter(sqlLinter)
        ]),
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

        {/* MongoDB database selector */}
        {isMongoConnection && (
          <div className="relative flex items-center">
            <select
              value={mongoDb}
              onChange={(e) => handleMongoDbChange(e.target.value)}
              className="appearance-none bg-elevated border border-border rounded-[var(--radius-sm)] text-xs text-fg pl-2.5 pr-6 py-1 cursor-pointer hover:border-accent focus:outline-none focus:border-accent transition-colors"
              title="MongoDB database"
            >
              <option value="" disabled>database…</option>
              {mongoDbs.map((db) => <option key={db} value={db}>{db}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 text-muted pointer-events-none" />
          </div>
        )}

        {/* Run button */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={execute}
          disabled={noConn || running || !currentQuery.trim()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent text-on-accent text-xs font-medium hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Run (⌘↵)"
        >
          {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          {t("runQueryBtn")}
        </button>

        {/* Format button */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={formatQuery}
          disabled={noConn || !currentQuery.trim()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border text-xs font-medium text-muted hover:text-fg hover:border-accent hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Format SQL"
        >
          <Wand2 size={11} />
          {t("formatSqlBtn")}
        </button>

        {/* EXPLAIN ANALYZE button */}
        {!isMongoConnection && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAnalyzePlan}
            disabled={noConn || analyzingPlan || !currentQuery.trim()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border text-xs font-medium text-muted hover:text-fg hover:border-warn hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="EXPLAIN ANALYZE"
          >
            {analyzingPlan ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            {t("explainPlanBtn")}
          </button>
        )}

        {/* Explain with AI button */}
        {!isMongoConnection && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleExplain(getQueryToRun())}
            disabled={noConn || explaining || !currentQuery.trim()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border text-xs font-medium text-muted hover:text-fg hover:border-accent hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Explain with AI"
          >
            {explaining ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {t("aiExplainBtn")}
          </button>
        )}

        {/* Status */}
        {elapsed !== null && !running && (
          <span className="text-[11px] text-muted ml-1">
            {result
              ? result.rows.length > 0
                ? `${result.rows.length} ${t("rows")} · ${elapsed}ms`
                : result.rows_affected !== null
                  ? `${result.rows_affected} ${t("rows")} ${t("rowsAffected")} · ${elapsed}ms`
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
            {t("aiToggle")}
          </button>
          <button
            onClick={() => setSnippetsOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs transition-colors ${snippetsOpen ? "bg-accent/15 text-accent" : "text-muted hover:text-fg hover:bg-hover"}`}
            title="Saved queries"
          >
            <Bookmark size={11} />
            {t("snippetsToggle")}
          </button>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs transition-colors ${historyOpen ? "bg-accent/15 text-accent" : "text-muted hover:text-fg hover:bg-hover"}`}
            title="Query history"
          >
            <History size={11} />
            {t("historyToggle")}
          </button>
        </div>
        <span className="text-[10px] text-faint">{t("kbdRunHint")}</span>
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
              placeholder={t("aiPromptPlaceholder")}
              className="flex-1 bg-transparent text-xs text-fg placeholder:text-faint outline-none"
            />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={generateQuery}
              disabled={aiLoading || !aiPrompt.trim()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent text-on-accent text-xs font-medium hover:bg-accent-strong disabled:opacity-50 transition-colors"
            >
              {aiLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              {t("aiGenerateBtn")}
            </button>
          </div>
          {aiError && <p className="text-[11px] text-danger font-mono">{aiError}</p>}
        </div>
      )}

      {/* Tabs bar */}
      <QueryTabsBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onAddTab={handleAddTab}
        onCloseTab={handleCloseTab}
        onRenameTab={handleRenameTab}
      />

      {/* Editor + Snippets side panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Editor */}
          <div className="flex-1 min-h-0 overflow-hidden" style={{ fontSize: `${editorFontSize}px`, fontFamily: editorFontFamily || undefined }}>
            <CodeMirror
              value={currentQuery}
              onChange={updateTabQuery}
              onCreateEditor={(view) => { viewRef.current = view; }}
              theme={isDark ? oneDark : "light"}
              extensions={cmExtensions}
              height="100%"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                closeBrackets: true,
                bracketMatching: true,
                history: true,
                highlightActiveLine: true,
              }}
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
            {/* EXPLAIN ANALYZE plan */}
            {(explainPlan || analyzingPlan) && (
              <div className="shrink-0 border-b border-border bg-surface/50 max-h-48 overflow-y-auto">
                <div className="flex items-start justify-between px-3 pt-2 pb-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-warn font-semibold">
                    <Zap size={10} /> {t("queryPlanTitle")}
                  </div>
                  <button onClick={() => setExplainPlan(null)}
                    className="text-muted hover:text-fg rounded p-0.5 hover:bg-hover transition-colors">
                    <X size={11} />
                  </button>
                </div>
                {analyzingPlan ? (
                  <div className="px-3 pb-2 flex items-center gap-2 text-xs text-muted">
                    <Loader2 size={11} className="animate-spin" /> {t("runningExplainPlan")}
                  </div>
                ) : explainPlan && (
                  <div className="px-3 pb-3 font-mono text-[11px]">
                    <ExplainTree node={explainPlan} />
                  </div>
                )}
              </div>
            )}

            {/* AI explanation panel */}
            {(explanation || explainError || explaining) && (
              <div className="shrink-0 border-b border-border bg-surface/50 max-h-36 overflow-y-auto">
                <div className="flex items-start justify-between px-3 pt-2 pb-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-accent font-semibold">
                    <Sparkles size={10} /> {t("aiExplanationPlan")}
                  </div>
                  <button onClick={() => { setExplanation(null); setExplainError(null); }}
                    className="text-muted hover:text-fg rounded p-0.5 hover:bg-hover transition-colors">
                    <X size={11} />
                  </button>
                </div>
                {explaining && (
                  <div className="px-3 pb-2 flex items-center gap-2 text-xs text-muted">
                    <Loader2 size={11} className="animate-spin" /> {t("explainingAILoading")}
                  </div>
                )}
                {explainError && <p className="px-3 pb-2 text-xs text-danger">{explainError}</p>}
                {explanation && (
                  <p className="px-3 pb-3 text-xs text-fg leading-relaxed whitespace-pre-wrap">{explanation}</p>
                )}
              </div>
            )}
            {error ? (
              <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between border-b border-border/40 pb-1.5 shrink-0">
                  <span className="text-[10px] text-danger font-semibold uppercase tracking-wider flex items-center gap-1">
                    <AlertCircle size={11} /> {t("executionError")}
                  </span>
                  <button
                    onClick={handleAiQuickFix}
                    disabled={aiFixing || !connId}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] border border-danger/40 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors cursor-pointer"
                    title="Fix this query with AI"
                  >
                    {aiFixing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                    {t("fixWithAi")}
                  </button>
                </div>
                <div className="flex-1 overflow-auto flex gap-2 min-h-0">
                  <pre className="text-xs text-danger font-mono whitespace-pre-wrap break-words">{error}</pre>
                </div>
              </div>
            ) : result ? (
              result.rows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-xs text-faint italic">
                    {result.rows_affected !== null
                      ? `${result.rows_affected} ${t("rows")} ${t("rowsAffected")}`
                      : t("queryReturnedNoRows")}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-3 py-1 bg-surface border-b border-border shrink-0">
                    <span className="text-[10px] text-muted font-semibold uppercase tracking-wider">{t("resultsPlan")}</span>
                    <button
                      onClick={handleExportResults}
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] border border-border text-[11px] font-medium text-muted hover:text-fg hover:border-accent hover:bg-hover transition-colors"
                      title="Export results to CSV"
                    >
                      {t("exportCsvAction")}
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <ResultsTable result={result} />
                  </div>
                </>
              )
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2 text-faint">
                <TableProperties size={13} />
                <span className="text-xs">{t("noConnectionSelected")}</span>
              </div>
            )}
          </div>
        </div>
        {snippetsOpen && (
          <SavedQueriesPanel
            currentSql={currentQuery}
            onLoad={loadSqlIntoEditor}
            onRun={(sqlStr) => { loadSqlIntoEditor(sqlStr); execute(); }}
            onClose={() => setSnippetsOpen(false)}
          />
        )}
        {historyOpen && (
          <QueryHistoryPanel
            onLoad={loadSqlIntoEditor}
            onRun={(sqlStr) => { loadSqlIntoEditor(sqlStr); execute(); }}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
