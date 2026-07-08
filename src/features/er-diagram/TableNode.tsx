import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Key, Link2 } from "lucide-react";
import type { TableSchema } from "./erStore";
import { useTranslation } from "../../hooks/useTranslation";

interface TableNodeProps {
  data: {
    tableSchema: TableSchema;
    color: string;
    isMongo?: boolean;
  };
  selected?: boolean;
}

export const TableNode = memo(({ data, selected }: TableNodeProps) => {
  const { t } = useTranslation();
  const { tableSchema, color } = data;
  const columns = tableSchema.columns || [];

  // Determine if a column is a foreign key
  const isFk = (colName: string) => {
    return tableSchema.foreignKeys?.some((fk) => fk.columns.split(",").map(c => c.trim()).includes(colName));
  };

  return (
    <div
      className={`min-w-[260px] rounded-lg border bg-surface text-fg shadow-lg transition-all duration-200 overflow-hidden ${
        selected ? "border-accent ring-2 ring-accent/30 scale-[1.02]" : "border-border hover:border-muted-fg/40"
      }`}
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* Node Header */}
      <div 
        className="px-3 py-2 flex items-center justify-between border-b border-border/80"
        style={{ borderTop: `4px solid ${color || "#3b82f6"}` }}
      >
        <span className="font-semibold text-xs tracking-wide truncate max-w-[200px]" title={tableSchema.name}>
          {tableSchema.name}
        </span>
        <span className="text-[9px] text-muted font-mono uppercase bg-hover px-1.5 py-0.5 rounded">
          {columns.length} {t("erColsCount")}
        </span>
      </div>

      {/* Columns List */}
      <div className="py-1.5 flex flex-col bg-surface/50">
        {columns.map((col, idx) => {
          const hasPk = col.is_pk;
          const hasFk = isFk(col.name);

          return (
            <div
              key={col.name}
              className={`relative px-3 py-1 flex items-center justify-between text-[11px] hover:bg-hover transition-colors group ${
                idx !== columns.length - 1 ? "border-b border-border/20" : ""
              }`}
            >
              {/* Left Handle (Target) */}
              <Handle
                type="target"
                position={Position.Left}
                id={`${col.name}-left`}
                className="!w-2.5 !h-2.5 !bg-slate-400 dark:!bg-slate-500 !border-2 !border-surface group-hover:!bg-accent transition-all opacity-40 group-hover:opacity-100 group-hover:scale-125"
                style={{ left: "-5px" }}
              />

              {/* Column Name & Indicators */}
              <div className="flex items-center gap-1.5 select-none z-10">
                {hasPk && (
                  <span title="Primary Key" className="shrink-0 flex"><Key size={10} className="text-yellow-500" /></span>
                )}
                {hasFk && (
                  <span title="Foreign Key" className="shrink-0 flex"><Link2 size={10} className="text-blue-400" /></span>
                )}
                <span className={`font-mono truncate max-w-[120px] ${hasPk ? "font-bold text-yellow-500/90" : "text-fg/90"}`}>
                  {col.name}
                </span>
              </div>

              {/* Column Type */}
              <span className="text-[10px] text-muted font-mono pl-4 truncate max-w-[100px] select-none text-right z-10">
                {col.data_type.toLowerCase()}
                {col.nullable ? "" : "!"}
              </span>

              {/* Right Handle (Source) */}
              <Handle
                type="source"
                position={Position.Right}
                id={`${col.name}-right`}
                className="!w-2.5 !h-2.5 !bg-slate-400 dark:!bg-slate-500 !border-2 !border-surface group-hover:!bg-accent transition-all opacity-40 group-hover:opacity-100 group-hover:scale-125"
                style={{ right: "-5px" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

TableNode.displayName = "TableNode";
