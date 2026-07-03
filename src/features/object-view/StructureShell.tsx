import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { describeTable, listForeignKeys } from "./objectApi";
import type { ColumnInfo, ForeignKeyInfo } from "../../shared/types";
import { useWorkspaceStore } from "../../stores/workspaceStore";

interface OpenObject {
  id: string;
  connId: string;
  table: string;
  label: string;
  engine: "postgres" | "mysql" | "mongodb";
}

export function StructureShell({ object }: { object: OpenObject }) {
  const [cols, setCols] = useState<ColumnInfo[] | null>(null);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setCols(null);
    setForeignKeys(null);
    setError("");

    Promise.all([
      describeTable(object.connId, object.table),
      listForeignKeys(object.connId, object.table),
    ])
      .then(([columns, fks]) => {
        setCols(columns);
        setForeignKeys(fks);
      })
      .catch((e) => setError(String(e)));
  }, [object.connId, object.table]);

  // Build a map from column name to FK info
  const fkColumnInfo = useMemo(() => {
    if (!foreignKeys) return new Map<string, ForeignKeyInfo>();
    const map = new Map<string, ForeignKeyInfo>();
    for (const fk of foreignKeys) {
      // fk.columns can be comma-separated for composite FKs
      for (const col of fk.columns.split(",")) {
        map.set(col.trim(), fk);
      }
    }
    return map;
  }, [foreignKeys]);

  // Build a set of column names that are foreign keys (for backward compat)
  const fkColumns = useMemo(() => new Set(fkColumnInfo.keys()), [fkColumnInfo]);

  const { openObject } = useWorkspaceStore();

  const handleFkClick = useCallback((fk: ForeignKeyInfo) => {
    const objId = `${object.connId}:${fk.referenced_table}`;
    openObject({
      id: objId,
      connId: object.connId,
      table: fk.referenced_table,
      label: fk.referenced_table,
      engine: object.engine,
    });
  }, [object.connId, object.engine, openObject]);

  if (error) return <div className="p-4 text-xs text-danger break-words">{error}</div>;
  if (!cols || foreignKeys === null) return <div className="p-4 text-xs text-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</div>;
  if (cols.length === 0) return <div className="p-4 text-xs text-faint italic">No columns</div>;

  return (
    <div className="flex-1 overflow-auto p-4">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border">
            {["#", "Field", "Type", "Nullable", ""].map((h, i) => (
              <th key={i} className="px-3 py-2.5 text-[10px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map((col, i) => (
            <tr key={col.name} className={`border-b border-elevated transition-colors hover:bg-hover ${i % 2 === 0 ? "" : "bg-surface/30"}`}>
              <td className="px-3 py-2 text-xs text-faint font-mono">{i + 1}</td>
              <td className="px-3 py-2 max-w-[200px] text-xs font-medium text-fg">
                <div className="flex items-center gap-1.5 min-w-0">
                  {col.is_pk && <span className="text-warn text-[10px] shrink-0" title="Primary Key">🔑</span>}
                  {fkColumns.has(col.name) && fkColumnInfo.get(col.name) && (
                    <button
                      onClick={() => handleFkClick(fkColumnInfo.get(col.name)!)}
                      className="text-accent text-[10px] shrink-0 hover:opacity-70 transition-opacity cursor-pointer"
                      title={`Go to ${fkColumnInfo.get(col.name)!.referenced_table}`}
                    >
                      🔗
                    </button>
                  )}
                  <span className="truncate flex-1" title={col.name}>{col.name}</span>
                </div>
              </td>
              <td className="px-3 py-2 max-w-[220px]">
                <span className="block text-[11px] font-mono text-accent/80 bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5 truncate" title={col.data_type}>{col.data_type}</span>
              </td>
              <td className="px-3 py-2 text-xs">
                {col.nullable
                  ? <span className="text-muted">nullable</span>
                  : <span className="text-ok text-[10px] font-medium bg-ok/10 border border-ok/20 rounded px-1.5 py-0.5">NOT NULL</span>
                }
              </td>
              <td className="px-3 py-2 text-xs">
                {col.is_pk && <span className="text-[10px] text-warn font-medium bg-warn/10 border border-warn/20 rounded px-1.5 py-0.5">PRIMARY KEY</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
