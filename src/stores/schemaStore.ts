import { create } from "zustand";
import type { TableInfo, ColumnInfo, SchemaInfo, IndexInfo, ForeignKeyInfo } from "../shared/types";

interface SchemaStore {
  // Hierarchical: database -> schema -> table -> columns/indexes/fks
  databases: string[];
  selectedDatabase: string | null;
  schemas: SchemaInfo[];
  selectedSchema: string | null;
  tables: TableInfo[];
  selectedTable: string | null;
  loading: boolean;
  error: string | null;

  // Table details
  columns: ColumnInfo[];
  columnsLoading: boolean;
  indexes: IndexInfo[];
  indexesLoading: boolean;
  foreignKeys: ForeignKeyInfo[];
  foreignKeysLoading: boolean;

  // Cache for table metadata
  tableColumns: Record<string, string[]>;
  tableIndexes: Record<string, IndexInfo[]>;
  tableForeignKeys: Record<string, ForeignKeyInfo[]>;
  tableCounts: Record<string, number>;

  // Actions
  setDatabases: (dbs: string[]) => void;
  setSelectedDatabase: (db: string | null) => void;
  setSchemas: (schemas: SchemaInfo[]) => void;
  setSelectedSchema: (schema: string | null) => void;
  setTables: (tables: TableInfo[]) => void;
  setSelectedTable: (name: string | null) => void;
  setLoading: (loading: boolean) => void;
  setColumns: (columns: ColumnInfo[]) => void;
  setColumnsLoading: (loading: boolean) => void;
  setIndexes: (indexes: IndexInfo[]) => void;
  setIndexesLoading: (loading: boolean) => void;
  setForeignKeys: (foreignKeys: ForeignKeyInfo[]) => void;
  setForeignKeysLoading: (loading: boolean) => void;
  setTableColumns: (tc: Record<string, string[]>) => void;
  setTableIndexes: (ti: Record<string, IndexInfo[]>) => void;
  setTableForeignKeys: (tfk: Record<string, ForeignKeyInfo[]>) => void;
  setTableCount: (table: string, count: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useSchemaStore = create<SchemaStore>((set) => ({
  // Hierarchical structure
  databases: [],
  selectedDatabase: null,
  schemas: [],
  selectedSchema: null,
  tables: [],
  selectedTable: null,
  loading: false,
  error: null,

  // Table details
  columns: [],
  columnsLoading: false,
  indexes: [],
  indexesLoading: false,
  foreignKeys: [],
  foreignKeysLoading: false,

  // Cache
  tableColumns: {},
  tableIndexes: {},
  tableForeignKeys: {},
  tableCounts: {},

  // Actions
  setDatabases: (databases) => set({ databases }),
  setSelectedDatabase: (selectedDatabase) => set({ selectedDatabase }),
  setSchemas: (schemas) => set({ schemas }),
  setSelectedSchema: (selectedSchema) => set({ selectedSchema }),
  setTables: (tables) => set({ tables }),
  setSelectedTable: (selectedTable) => set({ selectedTable }),
  setLoading: (loading) => set({ loading }),
  setColumns: (columns) => set({ columns }),
  setColumnsLoading: (columnsLoading) => set({ columnsLoading }),
  setIndexes: (indexes) => set({ indexes }),
  setIndexesLoading: (indexesLoading) => set({ indexesLoading }),
  setForeignKeys: (foreignKeys) => set({ foreignKeys }),
  setForeignKeysLoading: (foreignKeysLoading) => set({ foreignKeysLoading }),
  setTableColumns: (tableColumns) => set({ tableColumns }),
  setTableIndexes: (tableIndexes) => set({ tableIndexes }),
  setTableForeignKeys: (tableForeignKeys) => set({ tableForeignKeys }),
  setTableCount: (table, count) => set(s => ({ tableCounts: { ...s.tableCounts, [table]: count } })),
  setError: (error) => set({ error }),
  reset: () => set({
    databases: [],
    selectedDatabase: null,
    schemas: [],
    selectedSchema: null,
    tables: [],
    selectedTable: null,
    loading: false,
    error: null,
    columns: [],
    columnsLoading: false,
    indexes: [],
    indexesLoading: false,
    foreignKeys: [],
    foreignKeysLoading: false,
    tableColumns: {},
    tableIndexes: {},
    tableForeignKeys: {},
    tableCounts: {},
  }),
}));
