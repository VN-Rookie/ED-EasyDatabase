import { useTranslation } from "../hooks/useTranslation";
import { ENGINE_META } from "../features/connection/engineMeta";
import type { DbType } from "../shared/types";

interface StatusBarProps {
  engine?: string;
  connection?: string;
  object?: string;
  rowCount?: number;
}

export function StatusBar({ engine, connection, object, rowCount }: StatusBarProps) {
  const { t } = useTranslation();
  const meta = engine ? ENGINE_META[engine as DbType] : null;
  const EngineIcon = meta?.icon;

  return (
    <footer className="h-7 flex-shrink-0 flex items-center gap-3 px-3 border-t border-border bg-surface text-[11px] text-muted">
      {connection && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-elevated border border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-ok" />
          {connection}
        </span>
      )}
      {engine && (
        <span className="inline-flex items-center gap-1">
          {EngineIcon && <EngineIcon size={12} className={meta.color} />}
          <span className="uppercase font-semibold tracking-wider">{meta ? meta.label : engine}</span>
        </span>
      )}
      {object && <span className="font-mono">{object}</span>}
      {typeof rowCount === "number" && <span className="ml-auto tabular-nums">{rowCount} {t("rows")}</span>}
    </footer>
  );
}
