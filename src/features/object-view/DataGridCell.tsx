import { useState, useEffect, useCallback } from "react";
import { Maximize2, Link2 } from "lucide-react";
import { Input } from "../../shared/ui/Input";
import { Textarea } from "../../shared/ui/Textarea";
import { Select } from "../../shared/ui/Select";
import { CellExpandModal } from "../../shared/ui/CellExpandModal";
import { useDataGridStore, type DirtyCell } from "./dataGridStore";

const MAX_CELL_LEN = 80;

interface DataGridCellProps {
  column: string;
  rowIndex: number;
  value: unknown;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  foreignKeyOptions?: { value: string; label: string }[];
  dataType?: string;
  onSave?: (edit: DirtyCell) => void;
  onFkClick?: (column: string, value: unknown) => void;
}

/**
 * Renders a single cell with view/edit mode support.
 * - View mode: displays truncated value with expand button for long content
 * - Edit mode: shows input/select on double-click
 * - Enter saves, Escape cancels
 */
export function DataGridCell({
  column,
  rowIndex,
  value,
  isPrimaryKey = false,
  isForeignKey = false,
  foreignKeyOptions = [],
  dataType = "text",
  onSave,
  onFkClick,
}: DataGridCellProps) {
  const { editingCell, startEditing, stopEditing, getCellValue, isDirty, updateDirtyValue, rowsOffset, updateStagedRow } =
    useDataGridStore();

  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showExpandModal, setShowExpandModal] = useState(false);

  const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === column;
  const currentValue = getCellValue(rowIndex, column, value);
  const hasDirty = isDirty(rowIndex, column);

  // Reset edit value when starting to edit
  useEffect(() => {
    if (isEditing) {
      setEditValue(currentValue === null || currentValue === undefined ? "" : String(currentValue));
      setError(null);
    }
  }, [isEditing, currentValue]);

  const validateValue = useCallback((val: string): string | null => {
    if (val === "" && dataType !== "text" && dataType !== "varchar") {
      return "Empty value not allowed for this column type";
    }
    // Add more validation based on dataType if needed
    return null;
  }, [dataType]);

  const handleSave = useCallback(() => {
    const validationError = validateValue(editValue);
    if (validationError) {
      setError(validationError);
      return;
    }

    const newValue = editValue === "" ? null : editValue;
    if (rowIndex >= rowsOffset) {
      updateStagedRow(rowIndex - rowsOffset, column, newValue);
    } else {
      updateDirtyValue(rowIndex, column, value, newValue);
    }

    if (onSave) {
      onSave({ rowIndex, column, originalValue: value, newValue });
    }

    stopEditing();
  }, [editValue, rowIndex, column, value, onSave, stopEditing, updateDirtyValue, validateValue, rowsOffset, updateStagedRow]);

  const handleCancel = useCallback(() => {
    setEditValue(currentValue === null || currentValue === undefined ? "" : String(currentValue));
    setError(null);
    stopEditing();
  }, [currentValue, stopEditing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const handleDoubleClick = useCallback(() => {
    if (!isPrimaryKey) {
      startEditing(rowIndex, column);
    }
  }, [isPrimaryKey, rowIndex, column, startEditing]);

  const handleBlur = useCallback(() => {
    // Delay to allow click events on buttons/selects to fire first
    setTimeout(() => {
      if (isEditing && !error) {
        handleSave();
      }
    }, 150);
  }, [isEditing, error, handleSave]);

  // Render edit mode
  if (isEditing) {
    return (
      <div className="w-full">
        {isForeignKey && foreignKeyOptions.length > 0 ? (
          <Select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            autoFocus
            className={error ? "border-danger focus:border-danger" : ""}
          >
            <option value="">-- null --</option>
            {foreignKeyOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        ) : editValue.length > 50 || editValue.includes("\n") ? (
          <Textarea
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            autoFocus
            rows={Math.min(Math.ceil(editValue.length / 40) + 1, 10)}
            className={error ? "border-danger focus:border-danger" : ""}
            placeholder={dataType.includes("int") || dataType.includes("float") ? "0" : "Enter value..."}
          />
        ) : (
          <Input
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            autoFocus
            className={error ? "border-danger focus:border-danger" : ""}
            placeholder={dataType.includes("int") || dataType.includes("float") ? "0" : "Enter value..."}
          />
        )}
        {error && <span className="text-[10px] text-danger mt-0.5 block">{error}</span>}
      </div>
    );
  }

  // Render view mode
  const renderDisplayValue = () => {
    if (currentValue === null || currentValue === undefined) {
      return <span className="text-faint/50 italic select-none font-sans">∅</span>;
    }

    const str = typeof currentValue === "object" ? JSON.stringify(currentValue) : String(currentValue);
    const isLongContent = str.length > MAX_CELL_LEN;

    const fkLink = isForeignKey && onFkClick && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onFkClick(column, currentValue);
        }}
        className="shrink-0 p-0.5 text-accent hover:text-accent-strong hover:bg-hover rounded transition-colors inline-flex items-center"
        title="Go to referenced row"
      >
        <Link2 size={11} />
      </button>
    );

    if (!isLongContent) {
      return (
        <span className="flex items-center justify-between gap-1 min-w-0 w-full">
          <span className="block truncate whitespace-nowrap">{str}</span>
          {fkLink}
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1 min-w-0 flex-1 w-full justify-between">
        <span className="flex-1 truncate whitespace-nowrap min-w-0">{str.slice(0, MAX_CELL_LEN)}…</span>
        <span className="flex items-center gap-0.5 shrink-0">
          {fkLink}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowExpandModal(true);
            }}
            className="p-1 text-muted hover:text-fg hover:bg-hover rounded transition-colors"
            title="Expand to view full content"
          >
            <Maximize2 size={12} />
          </button>
        </span>
      </span>
    );
  };

  return (
    <>
      <div
        className={`w-full min-h-[32px] flex items-center cursor-text ${hasDirty ? "bg-accent/10" : ""}`}
        onDoubleClick={handleDoubleClick}
        title={isPrimaryKey ? "Primary key (read-only)" : "Double-click to edit"}
      >
        {renderDisplayValue()}
      </div>
      {showExpandModal && (
        <CellExpandModal
          column={column}
          value={currentValue}
          onClose={() => setShowExpandModal(false)}
        />
      )}
    </>
  );
}
