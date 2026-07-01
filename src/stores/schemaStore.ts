import { create } from "zustand";
import type { TableInfo, ColumnInfo } from "../types";

interface SchemaStore {
  databases: string[];
  selectedDatabase: string | null;
  tables: TableInfo[];
  selectedTable: string | null;
  loading: boolean;
  columns: ColumnInfo[];
  columnsLoading: boolean;
  tableColumns: Record<string, string[]>;
  tableCounts: Record<string, number>;

  setDatabases: (dbs: string[]) => void;
  setSelectedDatabase: (db: string | null) => void;
  setTables: (tables: TableInfo[]) => void;
  setSelectedTable: (name: string | null) => void;
  setLoading: (loading: boolean) => void;
  setColumns: (columns: ColumnInfo[]) => void;
  setColumnsLoading: (loading: boolean) => void;
  setTableColumns: (tc: Record<string, string[]>) => void;
  setTableCount: (table: string, count: number) => void;
  reset: () => void;
}

export const useSchemaStore = create<SchemaStore>((set) => ({
  databases: [],
  selectedDatabase: null,
  tables: [],
  selectedTable: null,
  loading: false,
  columns: [],
  columnsLoading: false,
  tableColumns: {},
  tableCounts: {},

  setDatabases: (databases) => set({ databases }),
  setSelectedDatabase: (selectedDatabase) => set({ selectedDatabase }),
  setTables: (tables) => set({ tables }),
  setSelectedTable: (selectedTable) => set({ selectedTable }),
  setLoading: (loading) => set({ loading }),
  setColumns: (columns) => set({ columns }),
  setColumnsLoading: (columnsLoading) => set({ columnsLoading }),
  setTableColumns: (tableColumns) => set({ tableColumns }),
  setTableCount: (table, count) => set(s => ({ tableCounts: { ...s.tableCounts, [table]: count } })),
  reset: () => set({
    databases: [],
    selectedDatabase: null,
    tables: [],
    selectedTable: null,
    loading: false,
    columns: [],
    columnsLoading: false,
    tableColumns: {},
    tableCounts: {},
  }),
}));
