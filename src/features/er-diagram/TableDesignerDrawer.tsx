import { useState, useEffect } from "react";
import { X, Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { useErStore, type TableSchema } from "./erStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { Select } from "../../shared/ui/Select";
import type { ColumnInfo } from "../../shared/types";
import { useTranslation } from "../../hooks/useTranslation";

const COMMON_TYPES = [
  "INT",
  "BIGINT",
  "VARCHAR(255)",
  "TEXT",
  "BOOLEAN",
  "TIMESTAMP",
  "DECIMAL(10,2)",
  "JSON",
  "BLOB",
  "ObjectId", // MongoDB
  "mixed",    // MongoDB
];

const PRESETS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Orange", value: "#f97316" },
  { name: "Red", value: "#ef4444" },
  { name: "Slate", value: "#64748b" },
];

export function TableDesignerDrawer() {
  const { t } = useTranslation();
  const { selectedTableId, setSelectedTableId, currentSchema, updateTable, deleteTable, nodes, updateNodeColor } = useErStore();
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [color, setColor] = useState("#3b82f6");

  // Load selected table schema when selectedTableId changes
  useEffect(() => {
    if (selectedTableId && currentSchema?.tables[selectedTableId]) {
      const table = currentSchema.tables[selectedTableId];
      setTableName(table.name);
      setColumns(JSON.parse(JSON.stringify(table.columns)));
      
      const node = nodes.find(n => n.id === selectedTableId);
      if (node?.data?.color) {
        setColor(node.data.color as string);
      }
    }
  }, [selectedTableId, currentSchema, nodes]);

  if (!selectedTableId || !currentSchema?.tables[selectedTableId]) return null;

  const table = currentSchema.tables[selectedTableId];

  const handleAddColumn = () => {
    const newCol: ColumnInfo = {
      name: `column_${columns.length + 1}`,
      data_type: "VARCHAR(255)",
      nullable: true,
      is_pk: false,
    };
    setColumns([...columns, newCol]);
  };

  const handleUpdateColumn = (index: number, field: keyof ColumnInfo, value: any) => {
    const nextCols = [...columns];
    nextCols[index] = {
      ...nextCols[index],
      [field]: value,
    };
    
    // If setting to PK, maybe uncheck nullable for safety
    if (field === "is_pk" && value === true) {
      nextCols[index].nullable = false;
    }
    
    setColumns(nextCols);
  };

  const handleDeleteColumn = (index: number) => {
    setColumns(columns.filter((_, idx) => idx !== index));
  };

  const handleApply = () => {
    if (!tableName.trim()) return;
    
    // Consolidate foreign keys: keep existing ones but filter out references if the columns were deleted
    const updatedFks = table.foreignKeys.filter(fk => {
      const localCols = fk.columns.split(",").map(c => c.trim());
      return localCols.every(c => columns.some(col => col.name === c));
    });

    const updatedSchema: TableSchema = {
      name: tableName.trim(),
      columns,
      foreignKeys: updatedFks,
      indexes: table.indexes, // Keep indexes for simplicity
    };

    updateTable(selectedTableId, updatedSchema);
    updateNodeColor(updatedSchema.name, color);
    setSelectedTableId(null);
  };

  const handleDelete = () => {
    if (confirm(t("tdConfirmDeleteText").replace("{tableName}", tableName))) {
      deleteTable(selectedTableId);
    }
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[420px] bg-surface border-l border-border shadow-2xl flex flex-col z-30 anim-slide-in overflow-hidden">
      {/* Drawer Header */}
      <div className="px-4 py-3 border-b border-border/80 flex items-center justify-between bg-surface/80 backdrop-blur shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-fg">{t("tdDesignerTitle")}</h3>
          <p className="text-[10px] text-muted">{t("tdDesignerDesc")}</p>
        </div>
        <button
          onClick={() => setSelectedTableId(null)}
          className="text-muted hover:text-fg hover:bg-hover p-1 rounded-md transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Table Name */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t("tdTableNameLabel")}</label>
          <Input
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder={t("tdEnterTableNamePlaceholder")}
            className="w-full text-xs font-mono"
          />
        </div>

        {/* Color Accent presets */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t("tdColorAccentLabel")}</label>
          <div className="flex items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setColor(p.value)}
                className="w-6 h-6 rounded-full border border-border flex items-center justify-center transition-transform hover:scale-110 relative"
                style={{ backgroundColor: p.value }}
                title={p.name}
              >
                {color === p.value && (
                  <Check size={12} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Columns Definition */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t("tdColumnsLabel")}</label>
            <Button
              onClick={handleAddColumn}
              size="sm"
              className="!px-2 !py-1 flex items-center gap-1 text-[10px] h-auto"
            >
              <Plus size={10} /> {t("tdAddColBtn")}
            </Button>
          </div>

          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {columns.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border rounded-lg bg-surface/30 text-muted text-xs">
                {t("tdNoColumnsText")}
              </div>
            ) : (
              columns.map((col, idx) => (
                <div key={idx} className="p-2 border border-border/80 rounded-md bg-surface/30 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Input
                      value={col.name}
                      onChange={(e) => handleUpdateColumn(idx, "name", e.target.value)}
                      placeholder={t("tdColNamePlaceholder")}
                      className="flex-1 font-mono text-[11px] h-8"
                    />
                    <button
                      onClick={() => handleDeleteColumn(idx)}
                      className="text-muted hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded transition-colors shrink-0"
                      title={t("tdDeleteColTooltip")}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Select
                        value={col.data_type}
                        onChange={(e) => handleUpdateColumn(idx, "data_type", e.target.value)}
                        className="w-full text-[11px] font-mono h-8"
                      >
                        {COMMON_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="flex items-center justify-around border border-border rounded px-1.5 h-8 bg-surface">
                      <label className="flex items-center gap-1 cursor-pointer" title="Primary Key">
                        <span className="text-[9px] font-bold text-yellow-500">PK</span>
                        <input
                          type="checkbox"
                          checked={col.is_pk}
                          onChange={(e) => handleUpdateColumn(idx, "is_pk", e.target.checked)}
                          className="w-3 h-3 accent-yellow-500"
                        />
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer" title="Nullable">
                        <span className="text-[9px] text-muted">Null</span>
                        <input
                          type="checkbox"
                          checked={col.nullable}
                          onChange={(e) => handleUpdateColumn(idx, "nullable", e.target.checked)}
                          className="w-3 h-3 accent-accent"
                          disabled={col.is_pk} // PK columns are not nullable
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Warning Alert if Schema altered */}
        <div className="p-3 border border-yellow-500/20 bg-yellow-500/5 rounded-lg flex gap-2.5 items-start">
          <AlertTriangle size={15} className="text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-[10px] text-muted leading-relaxed text-yellow-600/80">
            {t("tdVisualChangesAlert")}
          </div>
        </div>
      </div>

      {/* Drawer Footer */}
      <div className="px-4 py-3 border-t border-border/80 bg-surface/80 backdrop-blur shrink-0 flex items-center justify-between">
        <Button
          onClick={handleDelete}
          variant="danger"
          className="text-xs"
        >
          {t("tdDeleteTableBtn")}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setSelectedTableId(null)}
            variant="subtle"
            className="text-xs"
          >
            {t("cancelButton")}
          </Button>
          <Button
            onClick={handleApply}
            variant="primary"
            className="text-xs"
          >
            {t("tdSaveDesignBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
