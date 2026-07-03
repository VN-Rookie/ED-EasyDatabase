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
}

function makeDirtyKey(rowIndex: number, column: string): string {
  return `${rowIndex}:${column}`;
}

export const useDataGridStore = create<DataGridState>((set, get) => ({
  editingCell: null,
  dirtyCells: new Map(),
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
    const key = makeDirtyKey(rowIndex, column);
    const dirty = get().dirtyCells.get(key);
    return dirty ? dirty.newValue : originalValue;
  },

  isDirty: (rowIndex: number, column: string) => {
    const key = makeDirtyKey(rowIndex, column);
    return get().dirtyCells.has(key);
  },
}));
