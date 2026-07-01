interface StatusBarProps {
  engine?: string;
  connection?: string;
  object?: string;
  rowCount?: number;
}

export function StatusBar({ engine, connection, object, rowCount }: StatusBarProps) {
  return (
    <footer className="h-7 flex-shrink-0 flex items-center gap-3 px-3 border-t border-border bg-surface text-[11px] text-muted">
      {connection && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-elevated border border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-ok" />
          {connection}
        </span>
      )}
      {engine && <span className="uppercase tracking-wide">{engine}</span>}
      {object && <span className="font-mono">{object}</span>}
      {typeof rowCount === "number" && <span className="ml-auto tabular-nums">{rowCount} rows</span>}
    </footer>
  );
}
