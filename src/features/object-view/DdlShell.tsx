import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { IconButton } from "../../shared/ui/IconButton";
import { describeTable } from "./objectApi";
import type { ColumnInfo } from "../../shared/types";
import type { OpenObject } from "../../stores/workspaceStore";
import { useTranslation } from "../../hooks/useTranslation";

export function DdlShell({ object }: { object: OpenObject }) {
  const { t } = useTranslation();
  const [cols, setCols] = useState<ColumnInfo[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setCols(null); setError("");
    describeTable(object.connId, object.table).then(setCols).catch((e) => setError(String(e)));
  }, [object.connId, object.table]);

  if (error) return <div className="p-4 text-xs text-danger break-words">{error}</div>;
  if (!cols) return <div className="p-4 text-xs text-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {t("loadingStatus")}</div>;

  // Approximate CREATE generated from column metadata. A true server-side DDL dump is a later slice.
  const ddl = `CREATE TABLE ${object.table} (\n` +
    cols.map((c) => `  ${c.name} ${c.data_type}${c.is_pk ? " PRIMARY KEY" : ""}${c.nullable ? "" : " NOT NULL"}`).join(",\n") +
    `\n);`;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-border bg-surface">
        <IconButton icon={Copy} label={t("copyDdlLabel")} onClick={() => navigator.clipboard?.writeText(ddl)} />
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-fg/90 whitespace-pre">{ddl}</pre>
    </div>
  );
}
