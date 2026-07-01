import { useRef, useMemo, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { format as formatSql } from "sql-formatter";
import CodeMirror from "@uiw/react-codemirror";
import { sql as sqlLang } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { Loader2, Sparkles, X, Play, Check, AlignLeft, Zap } from "lucide-react";
import type { QueryResult } from "../types";
import { DataGrid } from "./DataGrid";
import { useSchemaStore } from "../stores/schemaStore";
import { useConnectionStore } from "../stores/connectionStore";
import { buildSchemaContext } from "../lib/schemaContext";

interface Props {
  sql: string;
  onChange: (sql: string) => void;
  onRun: (sql: string) => void;
  result: QueryResult | null;
  loading: boolean;
  error: string | null;
  queryHistory?: string[];
}

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
          <button onClick={() => setOpen(v => !v)} className="text-[#7d8590] hover:text-[#e6edf3] shrink-0 text-[10px] w-3">{open ? "▾" : "▸"}</button>
        )}
        {children.length === 0 && <span className="w-3 shrink-0" />}
        <span className={`text-xs font-medium ${cost && cost > expensiveThreshold ? "text-orange-400" : "text-[#e6edf3]"}`}>
          {label}{indexNote}
        </span>
        <div className="flex items-center gap-2 ml-auto shrink-0 text-[10px] font-mono opacity-70">
          {cost !== undefined && <span className={`${cost > expensiveThreshold ? "text-orange-500" : "text-[#7d8590]"}`}>cost={cost.toFixed(2)}</span>}
          {rows !== undefined && <span className="text-[#7d8590]">rows={rows}</span>}
          {time !== undefined && <span className={`${time > 100 ? "text-yellow-500" : "text-emerald-600"}`}>{time.toFixed(2)}ms</span>}
        </div>
      </div>
      {open && children.map((child, i) => <ExplainTree key={i} node={child} depth={depth + 1} />)}
    </div>
  );
}

const bgOverride = EditorView.theme({
  "&": { backgroundColor: "#0f172a" },
  ".cm-gutters": { backgroundColor: "#0f172a", borderRight: "1px solid #1e293b" },
  ".cm-activeLine": { backgroundColor: "#1e293b80" },
  ".cm-activeLineGutter": { backgroundColor: "#1e293b80" },
  ".cm-scroller": { fontFamily: "ui-monospace, 'Cascadia Code', Menlo, monospace" },
  ".cm-cursor": { borderLeftColor: "#60a5fa" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "#1e40af40 !important" },
});

export function SqlEditor({ sql, onChange, onRun, result, loading, error, queryHistory = [] }: Props) {
  const [editorPct, setEditorPct] = useState(45);
  const [showHistory, setShowHistory] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainPlan, setExplainPlan] = useState<ExplainNode | null>(null);
  const [analyzingPlan, setAnalyzingPlan] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const sqlRef = useRef(sql);
  const onRunRef = useRef(onRun);
  sqlRef.current = sql;
  onRunRef.current = onRun;

  const { tables, tableColumns } = useSchemaStore();
  const { activeConnectionId } = useConnectionStore();

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setEditorPct(Math.max(20, Math.min(80, pct)));
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  const getQueryToRun = (): string => {
    const view = editorViewRef.current;
    if (view) {
      const sel = view.state.selection.main;
      if (!sel.empty) return view.state.sliceDoc(sel.from, sel.to).trim();
    }
    return sqlRef.current.trim();
  };

  const getTextToCursor = (): string => {
    const view = editorViewRef.current;
    if (!view) return sqlRef.current;
    return view.state.sliceDoc(0, view.state.selection.main.head);
  };

  const handleRunRef = useRef(() => { const q = getQueryToRun(); if (q) onRunRef.current(q); });
  handleRunRef.current = () => { const q = getQueryToRun(); if (q) onRunRef.current(q); };

  const handleExplain = useCallback(async (queryToExplain: string) => {
    if (!queryToExplain.trim() || !activeConnectionId) return;
    setExplaining(true); setExplainError(null); setExplanation(null);
    try {
      const schemaContext = await buildSchemaContext(activeConnectionId, tables.map(t => t.name));
      const text = await invoke<string>("explain_sql", { sql: queryToExplain, schemaContext });
      setExplanation(text);
    } catch (e) { setExplainError(String(e)); }
    finally { setExplaining(false); }
  }, [activeConnectionId, tables]);

  const handleAnalyzePlan = useCallback(async () => {
    const q = getQueryToRun();
    if (!q.trim() || !activeConnectionId) return;
    setAnalyzingPlan(true); setExplainPlan(null);
    try {
      const result = await invoke<{ rows: Record<string, unknown>[] }>(
        "run_query",
        { connId: activeConnectionId, sql: `EXPLAIN (ANALYZE, FORMAT JSON) ${q}` }
      );
      const raw = result.rows?.[0]?.["QUERY PLAN"];
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw) as Array<{ Plan: ExplainNode }>;
        setExplainPlan(parsed[0]?.Plan ?? null);
      }
    } catch (e) { setExplainError(String(e)); }
    finally { setAnalyzingPlan(false); }
  }, [activeConnectionId]);

  const handleFormat = useCallback(() => {
    if (!sql.trim()) return;
    try {
      const formatted = formatSql(sql, { language: "postgresql", tabWidth: 2, keywordCase: "upper" });
      onChange(formatted);
    } catch { /* leave unchanged if partial SQL */ }
  }, [sql, onChange]);

  const handleAiComplete = useCallback(async () => {
    if (!activeConnectionId) return;
    setCompleting(true); setAiSuggestion(null);
    try {
      const partial = getTextToCursor();
      const schemaContext = await buildSchemaContext(activeConnectionId, tables.map(t => t.name));
      const completion = await invoke<string>("complete_sql", { partialSql: partial, schemaContext });
      if (completion.trim()) setAiSuggestion(completion.trim());
    } catch (e) { console.error("AI complete failed:", e); }
    finally { setCompleting(false); }
  }, [activeConnectionId, tables]);

  const acceptSuggestion = useCallback(() => {
    if (!aiSuggestion) return;
    const view = editorViewRef.current;
    if (view) {
      const pos = view.state.selection.main.head;
      const needsSpace = pos > 0 && !/\s$/.test(view.state.sliceDoc(Math.max(0, pos - 1), pos));
      view.dispatch({
        changes: { from: pos, insert: (needsSpace ? " " : "") + aiSuggestion },
        selection: { anchor: pos + aiSuggestion.length + (needsSpace ? 1 : 0) },
      });
    } else {
      onChange(sql + (sql.endsWith(" ") || sql.endsWith("\n") ? "" : " ") + aiSuggestion);
    }
    setAiSuggestion(null);
  }, [aiSuggestion, sql, onChange]);

  const extensions = useMemo(() => [
    sqlLang({ schema: tableColumns, upperCaseKeywords: false }),
    bgOverride,
    Prec.highest(keymap.of([
      { key: "Mod-Enter",   run: () => { handleRunRef.current(); return true; } },
      { key: "Ctrl-Space",  run: () => { handleAiComplete(); return true; } },
      { key: "Shift-Alt-f", run: () => { handleFormat(); return true; } },
    ])),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [tableColumns, handleFormat]);

  const rowCount = result?.rows.length ?? null;
  const rowsAffected = result?.rows_affected ?? null;
  const statusText = () => {
    if (loading) return "Running…";
    if (error) return "Error";
    if (rowsAffected !== null) return `${rowsAffected} row${rowsAffected !== 1 ? "s" : ""} affected`;
    if (rowCount !== null) return `${rowCount} row${rowCount !== 1 ? "s" : ""} returned`;
    return "Ready";
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* ── Editor section ─────────────────────────────────────────── */}
      <div className="relative" style={{ height: `${editorPct}%` }}>
        <CodeMirror
          value={sql}
          onChange={onChange}
          onCreateEditor={(view) => { editorViewRef.current = view; }}
          extensions={extensions}
          theme={oneDark}
          height="100%"
          style={{ height: "100%", fontSize: "13px" }}
          placeholder="SELECT * FROM users LIMIT 10;  — ⌘↵ run · Ctrl+Space AI complete · select text to run selection"
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            dropCursor: false,
            allowMultipleSelections: false,
            indentOnInput: true,
            highlightActiveLine: true,
            autocompletion: true,
            bracketMatching: true,
            closeBrackets: true,
            highlightSelectionMatches: true,
          }}
        />

        {/* Toolbar — bottom-right */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1">
          <button onClick={handleFormat} disabled={!sql.trim()} title="Format SQL (Shift+Alt+F)"
            className="flex items-center gap-1 text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] disabled:opacity-30 text-[11px] rounded-md px-2 py-1.5 transition-colors">
            <AlignLeft size={11} />
          </button>
          <button onClick={handleAnalyzePlan} disabled={analyzingPlan || !sql.trim()} title="EXPLAIN ANALYZE"
            className="flex items-center gap-1 text-[#7d8590] hover:text-yellow-400 hover:bg-[#292e36] disabled:opacity-30 text-[11px] rounded-md px-2 py-1.5 transition-colors">
            {analyzingPlan ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
          </button>
          <button onClick={() => handleExplain(getQueryToRun())} disabled={explaining || !sql.trim()} title="Explain with AI"
            className="flex items-center gap-1 text-[#7d8590] hover:text-purple-400 hover:bg-[#292e36] disabled:opacity-30 text-[11px] font-medium rounded-md px-2 py-1.5 transition-colors">
            {explaining ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {explaining ? "…" : "Explain"}
          </button>
          <div className="w-px h-4 bg-[#30363d]/60 mx-0.5" />
          <button onClick={() => handleRunRef.current()} disabled={loading || !sql.trim()}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium rounded-md px-3 py-1.5 transition-colors">
            <Play size={11} /> Run
          </button>
        </div>

        {/* History toggle */}
        {queryHistory.length > 0 && (
          <button onClick={() => setShowHistory(v => !v)}
            className={`absolute top-2 right-2 z-10 text-[10px] px-2 py-1 rounded-md transition-colors font-medium ${
              showHistory ? "bg-[#292e36] text-[#e6edf3]" : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36]"
            }`}>
            History {showHistory ? "▲" : "▼"}
          </button>
        )}

        {/* History overlay */}
        {showHistory && (
          <div className="absolute inset-0 z-20 bg-[#0d1117]/98 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#30363d] shrink-0">
              <span className="text-xs text-[#e6edf3] font-medium">Query History</span>
              <span className="text-[10px] text-[#7d8590]">{queryHistory.length} queries</span>
              <button onClick={() => setShowHistory(false)} className="text-[#7d8590] hover:text-[#e6edf3] ml-2 rounded p-0.5 hover:bg-[#292e36]"><X size={13} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {queryHistory.map((q, i) => (
                <button key={i} onClick={() => { onChange(q); setShowHistory(false); }} title={q}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#292e36] transition-colors border-b border-[#30363d]/40 group">
                  <span className="text-[10px] text-[#7d8590] font-mono mr-2">{i + 1}</span>
                  <span className="text-xs text-[#7d8590] font-mono group-hover:text-[#e6edf3] transition-colors truncate">
                    {q.length > 100 ? q.slice(0, 100) + "…" : q}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── AI Suggestion bar ───────────────────────────────────────── */}
      {(completing || aiSuggestion) && (
        <div className="shrink-0 border-t border-[#30363d]/50 bg-purple-950/30 px-4 py-2 flex items-start gap-3">
          <Sparkles size={12} className="text-purple-400 mt-0.5 shrink-0" />
          {completing ? (
            <div className="flex items-center gap-2 text-xs text-[#7d8590]">
              <Loader2 size={11} className="animate-spin" /> Generating completion…
            </div>
          ) : aiSuggestion && (
            <>
              <code className="text-xs text-purple-300 font-mono flex-1 leading-relaxed whitespace-pre-wrap break-all">
                {aiSuggestion}
              </code>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={acceptSuggestion}
                  className="flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 bg-green-900/30 hover:bg-green-900/50 rounded px-2 py-1 transition-colors font-medium">
                  <Check size={10} /> Accept
                </button>
                <button onClick={() => setAiSuggestion(null)}
                  className="text-[10px] text-[#7d8590] hover:text-[#e6edf3] rounded px-1.5 py-1 hover:bg-[#292e36] transition-colors">
                  ✕
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Drag handle ─────────────────────────────────────────────── */}
      <div onMouseDown={startDrag}
        className="shrink-0 h-1.5 bg-[#21262d] hover:bg-blue-500/30 cursor-row-resize transition-colors group relative"
        title="Drag to resize">
        <div className="absolute inset-x-0 top-0 h-px bg-[#30363d]/50" />
      </div>

      {/* ── Results section ─────────────────────────────────────────── */}
      <div className="flex flex-col" style={{ height: `${100 - editorPct}%` }}>
        {/* Status bar */}
        <div className="px-4 py-1.5 flex items-center justify-between shrink-0 border-b border-[#30363d]/60">
          <span className={`text-[11px] font-medium ${
            error ? "text-red-400" : loading ? "text-blue-400" : "text-[#7d8590]"
          }`}>{statusText()}</span>
          {rowCount !== null && !error && (
            <span className="text-[10px] text-[#484f58]">{rowCount} row{rowCount !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* EXPLAIN ANALYZE plan */}
        {(explainPlan || analyzingPlan) && (
          <div className="shrink-0 border-b border-[#30363d] bg-[#161b22]/50 max-h-48 overflow-y-auto">
            <div className="flex items-start justify-between px-4 pt-2 pb-1">
              <div className="flex items-center gap-1.5 text-[10px] text-yellow-400 font-semibold">
                <Zap size={10} /> Query Plan
              </div>
              <button onClick={() => setExplainPlan(null)}
                className="text-[#7d8590] hover:text-[#e6edf3] rounded p-0.5 hover:bg-[#292e36] transition-colors">
                <X size={11} />
              </button>
            </div>
            {analyzingPlan ? (
              <div className="px-4 pb-2 flex items-center gap-2 text-xs text-[#7d8590]">
                <Loader2 size={11} className="animate-spin" /> Running EXPLAIN ANALYZE…
              </div>
            ) : explainPlan && (
              <div className="px-4 pb-3 font-mono text-[11px]">
                <ExplainTree node={explainPlan} />
              </div>
            )}
          </div>
        )}

        {/* AI explanation panel */}
        {(explanation || explainError || explaining) && (
          <div className="shrink-0 border-b border-[#30363d] bg-[#161b22]/50 max-h-36 overflow-y-auto">
            <div className="flex items-start justify-between px-4 pt-2 pb-1">
              <div className="flex items-center gap-1.5 text-[10px] text-purple-400 font-semibold">
                <Sparkles size={10} /> AI Explanation
              </div>
              <button onClick={() => { setExplanation(null); setExplainError(null); }}
                className="text-[#7d8590] hover:text-[#e6edf3] rounded p-0.5 hover:bg-[#292e36] transition-colors">
                <X size={11} />
              </button>
            </div>
            {explaining && (
              <div className="px-4 pb-2 flex items-center gap-2 text-xs text-[#7d8590]">
                <Loader2 size={11} className="animate-spin" /> Explaining…
              </div>
            )}
            {explainError && <p className="px-4 pb-2 text-xs text-red-400">{explainError}</p>}
            {explanation && (
              <p className="px-4 pb-3 text-xs text-[#e6edf3] leading-relaxed whitespace-pre-wrap">{explanation}</p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col">
          <DataGrid result={result} loading={loading} error={error} />
        </div>
      </div>
    </div>
  );
}
