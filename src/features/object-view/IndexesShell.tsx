import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { listIndexes, ensureMongoDb } from "./objectApi";
import type { IndexInfo } from "../../shared/types";
import type { OpenObject } from "../../stores/workspaceStore";
import { useTranslation } from "../../hooks/useTranslation";

export function IndexesShell({ object }: { object: OpenObject }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState<IndexInfo[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setIdx(null); setError("");
    ensureMongoDb(object)
      .then(() => listIndexes(object.connId, object.table))
      .then(setIdx)
      .catch((e) => setError(String(e)));
  }, [object.connId, object.table, object.engine, object.database]);

  if (error) return <div className="p-4 text-xs text-danger break-words">{error}</div>;
  if (!idx) return <div className="p-4 text-xs text-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {t("loadingStatus")}</div>;
  if (idx.length === 0) return <div className="p-4 text-xs text-faint italic">{t("noIndexesText")}</div>;

  return (
    <div className="flex-1 overflow-auto p-4">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border">
            {[t("indexHeaderName"), t("indexHeaderColumns"), t("indexHeaderType"), t("indexHeaderUnique")].map((h, i) => (
              <th key={i} className="px-3 py-2.5 text-[10px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {idx.map((ix, i) => (
            <tr key={ix.name} className={`border-b border-elevated transition-colors hover:bg-hover ${i % 2 === 0 ? "" : "bg-surface/30"}`}>
              <td className="px-3 py-2 text-xs font-medium text-fg font-mono">{ix.name}</td>
              <td className="px-3 py-2 text-xs font-mono text-muted break-all">{ix.columns}</td>
              <td className="px-3 py-2 text-xs text-muted">{ix.index_type}</td>
              <td className="px-3 py-2 text-xs">
                {ix.is_unique
                  ? <span className="text-ok text-[10px] font-medium bg-ok/10 border border-ok/20 rounded px-1.5 py-0.5">UNIQUE</span>
                  : <span className="text-muted">—</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
