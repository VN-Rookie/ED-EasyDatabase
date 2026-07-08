import { useEffect, useState } from "react";
import { Loader2, Copy, Check, Terminal } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { runQuery, ensureMongoDb } from "./objectApi";
import type { OpenObject } from "../../stores/workspaceStore";

export function TextView({ object }: { object: OpenObject }) {
  const [data, setData] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isMongo = object.engine === "mongodb";

  useEffect(() => {
    setLoading(true);
    setError(null);
    const fetchData = async () => {
      try {
        await ensureMongoDb(object);
        
        let queryStr = "";
        if (isMongo) {
          queryStr = `db.${object.table}.find({}).limit(100)`;
        } else {
          const quoteIdent = (ident: string) => object.engine === "mysql" ? `\`${ident.replace(/`/g, "``")}\`` : `"${ident.replace(/"/g, '""')}"`;
          queryStr = `SELECT * FROM ${quoteIdent(object.table)} LIMIT 100`;
        }

        const res = await runQuery(object.connId, queryStr);
        setData(JSON.stringify(res.rows, null, 2));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [object.connId, object.table, object.engine, isMongo]);

  const handleCopy = () => {
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted min-h-0 bg-surface">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex-1 overflow-auto min-h-0 bg-surface">
        <pre className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 whitespace-pre-wrap break-words">{error}</pre>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden bg-[#282c34] min-h-0 flex flex-col border border-border/40 rounded-xl m-3 shadow-lg">
      {/* Sleek dark themed code header toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#21252b] border-b border-[#181a1f] shrink-0">
        <div className="flex items-center gap-2 text-muted text-[10px] font-mono tracking-wider uppercase font-semibold">
          <Terminal size={12} className="text-accent" />
          <span>JSON representation (first 100 rows)</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-muted hover:text-fg bg-elevated hover:bg-hover border border-border/80 px-2.5 py-0.5 rounded transition-all cursor-pointer shadow-sm active:scale-95"
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-[#282c34]">
        <CodeMirror
          value={data}
          theme={oneDark}
          height="100%"
          extensions={[
            EditorView.editable.of(false),
            EditorView.lineWrapping,
          ]}
          className="text-[12px] font-mono h-full"
        />
      </div>
    </div>
  );
}
