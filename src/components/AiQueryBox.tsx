import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Loader2, ChevronDown, ChevronUp, Play, ArrowDownToLine } from "lucide-react";
import { useSchemaStore } from "../stores/schemaStore";
import { useConnectionStore } from "../stores/connectionStore";
import { buildSchemaContext } from "../lib/schemaContext";

interface Props {
  /** Called when user clicks "Insert into editor" */
  onInsert: (sql: string) => void;
  /** Called when user clicks "Run directly" — should NOT push to query history */
  onRun: (sql: string) => void;
}

export function AiQueryBox({ onInsert, onRun }: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generatedSql, setGeneratedSql] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaContext, setSchemaContext] = useState("");
  const [schemaLoading, setSchemaLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { tables } = useSchemaStore();
  const { activeConnectionId } = useConnectionStore();

  // Load schema context when panel opens or tables change
  useEffect(() => {
    if (!open || !activeConnectionId || tables.length === 0) return;
    setSchemaLoading(true);
    buildSchemaContext(activeConnectionId, tables.map((t) => t.name))
      .then(setSchemaContext)
      .catch(() => setSchemaContext(""))
      .finally(() => setSchemaLoading(false));
  }, [open, activeConnectionId, tables]);

  // Focus textarea when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || !activeConnectionId) return;
    setLoading(true);
    setError(null);
    setGeneratedSql("");
    try {
      const sql = await invoke<string>("generate_sql", {
        prompt: trimmed,
        schemaContext: schemaContext || "(no schema loaded)",
      });
      setGeneratedSql(sql);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="shrink-0 border-b border-[#30363d]">
      {/* Toggle bar */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-[#292e36]/60 transition-colors"
      >
        <Sparkles size={12} className={open ? "text-purple-400" : "text-[#7d8590]"} />
        <span className={open ? "text-purple-300 font-medium" : "text-[#7d8590]"}>Ask AI</span>
        <span className="ml-auto text-[#484f58]">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#30363d]">
          {/* Schema load status */}
          <div className="pt-2">
            {schemaLoading ? (
              <div className="flex items-center gap-1.5 text-[10px] text-[#7d8590]">
                <Loader2 size={9} className="animate-spin" /> Loading schema context…
              </div>
            ) : schemaContext ? (
              <div className="text-[10px] text-[#7d8590]">
                Schema: {tables.length} table{tables.length !== 1 ? "s" : ""} loaded
              </div>
            ) : tables.length === 0 ? (
              <div className="text-[10px] text-yellow-700">
                No tables found — connect to a database first
              </div>
            ) : null}
          </div>

          {/* Prompt textarea */}
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={"e.g. Top 10 users by post count in the last 30 days\nCmd+Enter to generate"}
            rows={2}
            className="w-full bg-[#21262d] border border-[#30363d] focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-[#e6edf3] outline-none resize-none placeholder:text-[#484f58] leading-relaxed"
          />

          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim() || schemaLoading || (!schemaContext && tables.length > 0)}
            className="flex items-center gap-1.5 bg-purple-700 hover:bg-purple-600 active:bg-purple-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg px-3 py-1.5 transition-colors"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {loading ? "Generating…" : "Generate SQL"}
          </button>

          {error && (
            <pre className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
              {error}
            </pre>
          )}

          {generatedSql && !error && (
            <div className="space-y-2">
              <pre className="bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-green-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-48">
                {generatedSql}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={() => { onInsert(generatedSql); setOpen(false); }}
                  className="flex items-center gap-1.5 text-xs text-[#e6edf3] hover:text-white bg-[#21262d] hover:bg-[#292e36] border border-[#30363d] rounded-lg px-3 py-1.5 transition-colors"
                >
                  <ArrowDownToLine size={11} />
                  Insert into editor
                </button>
                <button
                  onClick={() => onRun(generatedSql)}
                  className="flex items-center gap-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Play size={11} />
                  Run directly
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
