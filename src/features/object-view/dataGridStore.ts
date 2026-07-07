import { create } from "zustand";

/**
 * Represents a cell being edited
 */
export interface EditingCell {
  rowIndex: number;
  column: string;
}

/**
 * Represents a cell that has been modified but not yet saved
 */
export interface DirtyCell {
  rowIndex: number;
  column: string;
  originalValue: unknown;
  newValue: unknown;
}

/**
 * State for data grid inline editing
 */
interface DataGridState {
  // Which cell is currently being edited (null = no editing)
  editingCell: EditingCell | null;

  // All modified cells that haven't been saved yet
  dirtyCells: Map<string, DirtyCell>; // key = "rowIndex:column"

  // Staged row insertions and deletions
  stagedInsertions: Record<string, unknown>[];
  stagedDeletions: Set<unknown>; // Set of primary key values
  rowsOffset: number; // number of existing database rows loaded in the current view

  // Multi-selection
  selectedRowIndices: Set<number>;

  // Currently selected cell (for keyboard navigation)
  selectedCell: { rowIndex: number; column: string } | null;

  // Hidden columns (persisted per object)
  hiddenColumns: Map<string, Set<string>>; // key = objectId

  // Actions
  startEditing: (rowIndex: number, column: string) => void;
  stopEditing: () => void;
  updateDirtyValue: (rowIndex: number, column: string, originalValue: unknown, newValue: unknown) => void;
  clearDirtyCell: (rowIndex: number, column: string) => void;
  clearAllDirtyCells: () => void;
  commitDirtyCells: () => DirtyCell[];
  setSelectedCell: (rowIndex: number, column: string) => void;
  clearSelectedCell: () => void;
  toggleColumn: (objectId: string, column: string) => void;
  isColumnHidden: (objectId: string, column: string) => boolean;
  getCellValue: (rowIndex: number, column: string, originalValue: unknown) => unknown;
  isDirty: (rowIndex: number, column: string) => boolean;

  // New actions for staged rows
  setRowsOffset: (count: number) => void;
  addStagedRow: (columns: string[]) => void;
  updateStagedRow: (idx: number, column: string, value: unknown) => void;
  removeStagedRow: (idx: number) => void;
  toggleStagedDeletion: (pkValue: unknown) => void;
  isStagedDeleted: (pkValue: unknown) => boolean;
  clearStagedInsertions: () => void;
  clearStagedDeletions: () => void;

  // Actions for multi-selection
  setSelectedRowIndices: (indices: Set<number>) => void;
  toggleRowSelection: (rowIndex: number) => void;
  clearRowSelection: () => void;
  removeMultipleStagedRows: (indices: number[]) => void;
  addMultipleStagedDeletions: (pkValues: unknown[]) => void;
}

function makeDirtyKey(rowIndex: number, column: string): string {
  return `${rowIndex}:${column}`;
}

export const useDataGridStore = create<DataGridState>((set, get) => ({
  editingCell: null,
  dirtyCells: new Map(),
  stagedInsertions: [],
  stagedDeletions: new Set(),
  rowsOffset: 0,
  selectedRowIndices: new Set(),
  selectedCell: null,
  hiddenColumns: new Map(),

  startEditing: (rowIndex: number, column: string) => {
    set({ editingCell: { rowIndex, column } });
  },

  stopEditing: () => {
    set({ editingCell: null });
  },

  updateDirtyValue: (rowIndex: number, column: string, originalValue: unknown, newValue: unknown) => {
    const key = makeDirtyKey(rowIndex, column);
    set((state) => {
      const newDirtyCells = new Map(state.dirtyCells);
      if (newValue === originalValue) {
        newDirtyCells.delete(key);
      } else {
        newDirtyCells.set(key, { rowIndex, column, originalValue, newValue });
      }
      return { dirtyCells: newDirtyCells };
    });
  },

  clearDirtyCell: (rowIndex: number, column: string) => {
    const key = makeDirtyKey(rowIndex, column);
    set((state) => {
      const newDirtyCells = new Map(state.dirtyCells);
      newDirtyCells.delete(key);
      return { dirtyCells: newDirtyCells };
    });
  },

  clearAllDirtyCells: () => {
    set({ dirtyCells: new Map() });
  },

  commitDirtyCells: () => {
    const dirtyCells = Array.from(get().dirtyCells.values());
    set({ dirtyCells: new Map() });
    return dirtyCells;
  },

  setSelectedCell: (rowIndex: number, column: string) => {
    set({ selectedCell: { rowIndex, column } });
  },

  clearSelectedCell: () => {
    set({ selectedCell: null });
  },

  toggleColumn: (objectId: string, column: string) => {
    set((state) => {
      const newHiddenColumns = new Map(state.hiddenColumns);
      let columns = newHiddenColumns.get(objectId);
      if (!columns) {
        columns = new Set();
        newHiddenColumns.set(objectId, columns);
      }
      const next = new Set(columns);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      newHiddenColumns.set(objectId, next);
      return { hiddenColumns: newHiddenColumns };
    });
  },

  isColumnHidden: (objectId: string, column: string) => {
    return get().hiddenColumns.get(objectId)?.has(column) ?? false;
  },

  getCellValue: (rowIndex: number, column: string, originalValue: unknown) => {
    const { dirtyCells, stagedInsertions, rowsOffset } = get();
    if (rowIndex >= rowsOffset) {
      const idx = rowIndex - rowsOffset;
      return stagedInsertions[idx]?.[column] ?? "";
    }
    const key = makeDirtyKey(rowIndex, column);
    const dirty = dirtyCells.get(key);
    return dirty ? dirty.newValue : originalValue;
  },

  isDirty: (rowIndex: number, column: string) => {
    const { dirtyCells, rowsOffset } = get();
    if (rowIndex >= rowsOffset) {
      return true; // Newly inserted rows are always considered dirty/unsaved
    }
    const key = makeDirtyKey(rowIndex, column);
    return dirtyCells.has(key);
  },

  setRowsOffset: (count: number) => {
    set({ rowsOffset: count });
  },

  addStagedRow: (columns: string[]) => {
    set((state) => {
      const newRow: Record<string, unknown> = {};
      columns.forEach((col) => {
        newRow[col] = "";
      });
      return { stagedInsertions: [...state.stagedInsertions, newRow] };
    });
  },

  updateStagedRow: (idx: number, column: string, value: unknown) => {
    set((state) => {
      const newInsertions = [...state.stagedInsertions];
      if (newInsertions[idx]) {
        newInsertions[idx] = { ...newInsertions[idx], [column]: value };
      }
      return { stagedInsertions: newInsertions };
    });
  },

  removeStagedRow: (idx: number) => {
    set((state) => ({
      stagedInsertions: state.stagedInsertions.filter((_, i) => i !== idx),
    }));
  },

  toggleStagedDeletion: (pkValue: unknown) => {
    set((state) => {
      const newDeletions = new Set(state.stagedDeletions);
      if (newDeletions.has(pkValue)) {
        newDeletions.delete(pkValue);
      } else {
        newDeletions.add(pkValue);
      }
      return { stagedDeletions: newDeletions };
    });
  },

  isStagedDeleted: (pkValue: unknown) => {
    return get().stagedDeletions.has(pkValue);
  },

  clearStagedInsertions: () => {
    set({ stagedInsertions: [] });
  },

  clearStagedDeletions: () => {
    set({ stagedDeletions: new Set() });
  },

  setSelectedRowIndices: (indices: Set<number>) => {
    set({ selectedRowIndices: indices });
  },

  toggleRowSelection: (rowIndex: number) => {
    set((state) => {
      const next = new Set(state.selectedRowIndices);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return { selectedRowIndices: next };
    });
  },

  clearRowSelection: () => {
    set({ selectedRowIndices: new Set() });
  },

  removeMultipleStagedRows: (indices: number[]) => {
    set((state) => ({
      stagedInsertions: state.stagedInsertions.filter((_, idx) => !indices.includes(idx)),
    }));
  },

  addMultipleStagedDeletions: (pkValues: unknown[]) => {
    set((state) => {
      const next = new Set(state.stagedDeletions);
      pkValues.forEach((pk) => next.add(pk));
      return { stagedDeletions: next };
    });
  },
}));
