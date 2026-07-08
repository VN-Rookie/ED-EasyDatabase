import { create } from "zustand";
import { 
  type Node, 
  type Edge, 
  type OnNodesChange, 
  type OnEdgesChange, 
  applyNodeChanges, 
  applyEdgeChanges 
} from "@xyflow/react";
import type { ColumnInfo, ForeignKeyInfo, IndexInfo, DbType } from "../../shared/types";
import { describeTable, listForeignKeys, listIndexes, listTables } from "../explorer/schemaApi";
import { loadErLayout, saveErLayout } from "./erApi";

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
}

export interface DbSchema {
  tables: Record<string, TableSchema>;
}

interface SavedLayout {
  nodes: { id: string; position: { x: number; y: number }; color?: string }[];
  virtualEdges?: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }[];
}

interface ErState {
  nodes: Node[];
  edges: Edge[];
  initialSchema: DbSchema | null;
  currentSchema: DbSchema | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  selectedTableId: string | null;
  connectionId: string | null;
  dbType: DbType | null;

  // Actions
  loadSchema: (connId: string, dbType: DbType) => Promise<void>;
  saveLayout: () => Promise<void>;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  updateNodePosition: (id: string, x: number, y: number) => void;
  updateNodeColor: (id: string, color: string) => void;
  setSelectedTableId: (id: string | null) => void;

  // Modeling Actions (Modify visual state)
  addTable: (name: string) => void;
  deleteTable: (name: string) => void;
  updateTable: (oldName: string, updated: TableSchema) => void;
  addEdgeConnection: (sourceTable: string, sourceCol: string, targetTable: string, targetCol: string) => void;
  deleteEdgeConnection: (edgeId: string) => void;
  resetLayout: () => void;
}

// Zero-dependency topological level-based layout
function computeLayout(tables: TableSchema[]): Record<string, { x: number; y: number }> {
  const levels: Record<string, number> = {};
  const tableMap = new Map(tables.map(t => [t.name, t]));

  // Initialize all to level 0
  for (const t of tables) {
    levels[t.name] = 0;
  }

  // Iterate to resolve levels based on FK dependency depth.
  // Cap iterations at tables.length to safely handle cycles (self-references / circular references).
  const maxIterations = Math.min(tables.length, 50);
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (const t of tables) {
      for (const fk of t.foreignKeys) {
        if (tableMap.has(fk.referenced_table)) {
          const parentLevel = levels[fk.referenced_table];
          const currentLevel = levels[t.name];
          if (currentLevel <= parentLevel) {
            levels[t.name] = parentLevel + 1;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }

  // Group tables by level
  const columns: Record<number, string[]> = {};
  for (const [name, val] of Object.entries(levels)) {
    if (!columns[val]) columns[val] = [];
    columns[val].push(name);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  const colWidth = 320;
  const colGap = 160;
  const rowHeight = 240;
  const rowGap = 60;

  for (const [colIdxStr, tableNames] of Object.entries(columns)) {
    const colIdx = parseInt(colIdxStr, 10);
    tableNames.forEach((tableName, rowIdx) => {
      positions[tableName] = {
        x: colIdx * (colWidth + colGap) + 50,
        y: rowIdx * (rowHeight + rowGap) + 50,
      };
    });
  }

  return positions;
}

export const useErStore = create<ErState>((set, get) => ({
  nodes: [],
  edges: [],
  initialSchema: null,
  currentSchema: null,
  loading: false,
  saving: false,
  error: null,
  selectedTableId: null,
  connectionId: null,
  dbType: null,

  loadSchema: async (connId, dbType) => {
    set({ loading: true, error: null, connectionId: connId, dbType });
    try {
      // 1. Fetch tables
      const tableInfos = await listTables(connId);
      const tables: TableSchema[] = [];

      for (const info of tableInfos) {
        // Run metadata queries concurrently for speed
        const [cols, indexList, fkListResult] = await Promise.allSettled([
          describeTable(connId, info.name),
          listIndexes(connId, info.name),
          listForeignKeys(connId, info.name),
        ]);

        const columns = cols.status === "fulfilled" ? cols.value : [];
        const indexes = indexList.status === "fulfilled" ? indexList.value : [];
        // listForeignKeys will fail on Redis or Mongo, catch and default to empty array
        const foreignKeys = fkListResult.status === "fulfilled" ? fkListResult.value : [];

        tables.push({
          name: info.name,
          columns,
          indexes,
          foreignKeys,
        });
      }

      const dbSchema: DbSchema = {
        tables: tables.reduce((acc, t) => {
          acc[t.name] = t;
          return acc;
        }, {} as Record<string, TableSchema>),
      };

      // 2. Fetch saved layout
      const layoutStr = await loadErLayout(connId);
      let saved: SavedLayout | null = null;
      if (layoutStr) {
        try {
          saved = JSON.parse(layoutStr);
        } catch {
          console.error("Failed to parse saved layout JSON");
        }
      }

      // 3. Compute layouts & nodes
      const defaultPositions = computeLayout(tables);
      const initialNodes: Node[] = tables.map((t) => {
        const savedNode = saved?.nodes.find((n) => n.id === t.name);
        return {
          id: t.name,
          type: "tableNode",
          position: savedNode?.position || defaultPositions[t.name] || { x: 100, y: 100 },
          data: { 
            tableSchema: t, 
            color: savedNode?.color || "#3b82f6", // Default Tailwind blue-500
          },
        };
      });

      // 4. Construct edges from Foreign Keys
      const initialEdges: Edge[] = [];
      for (const t of tables) {
        for (const fk of t.foreignKeys) {
          // Columns in fk.columns and fk.referenced_columns are usually comma-separated in compound keys
          const localCols = fk.columns.split(",");
          const refCols = fk.referenced_columns.split(",");
          
          // Draw lines column-to-column based on first matching index key
          const localCol = localCols[0]?.trim();
          const refCol = refCols[0]?.trim();

          if (localCol && refCol) {
            initialEdges.push({
              id: `fk-${t.name}-${localCol}-${fk.referenced_table}-${refCol}`,
              source: t.name,
              sourceHandle: `${localCol}-right`,
              target: fk.referenced_table,
              targetHandle: `${refCol}-left`,
              style: { stroke: "#3b82f6", strokeWidth: 2 },
              className: "sql-edge",
              animated: false,
            });
          }
        }
      }

      // Add saved virtual edges (for MongoDB or custom references)
      if (saved?.virtualEdges) {
        for (const ve of saved.virtualEdges) {
          // Verify tables still exist
          if (dbSchema.tables[ve.source] && dbSchema.tables[ve.target]) {
            initialEdges.push({
              id: ve.id,
              source: ve.source,
              sourceHandle: ve.sourceHandle,
              target: ve.target,
              targetHandle: ve.targetHandle,
              style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "5,5" }, // Yellow dashed for virtual
              className: "virtual-edge",
              data: { isVirtual: true },
            });
          }
        }
      }

      set({
        nodes: initialNodes,
        edges: initialEdges,
        initialSchema: dbSchema,
        currentSchema: JSON.parse(JSON.stringify(dbSchema)), // deep clone
        loading: false,
      });

      // If no saved layout, save initial layout positions now
      if (!saved) {
        await get().saveLayout();
      }
    } catch (e: any) {
      set({ error: e.message || "Failed to load database schema", loading: false });
    }
  },

  saveLayout: async () => {
    const { nodes, edges, connectionId } = get();
    if (!connectionId) return;

    set({ saving: true });
    try {
      const savedNodes = nodes.map((n) => ({
        id: n.id,
        position: n.position,
        color: n.data?.color as string | undefined,
      }));

      const virtualEdges = edges
        .filter((e) => e.data?.isVirtual)
        .map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle!,
          target: e.target,
          targetHandle: e.targetHandle!,
        }));

      const layout: SavedLayout = {
        nodes: savedNodes,
        virtualEdges,
      };

      await saveErLayout(connectionId, JSON.stringify(layout));
      set({ saving: false });
    } catch (e: any) {
      set({ error: e.message || "Failed to save layout configuration", saving: false });
    }
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  updateNodePosition: (id, x, y) => {
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)),
    }));
  },

  updateNodeColor: (id, color) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                color,
              },
            }
          : n
      ),
    }));
    get().saveLayout();
  },

  setSelectedTableId: (selectedTableId) => set({ selectedTableId }),

  addTable: (name) => {
    const { currentSchema, nodes } = get();
    if (!currentSchema || currentSchema.tables[name]) return;

    const newTable: TableSchema = {
      name,
      columns: [{ name: "id", data_type: "INT", nullable: false, is_pk: true }],
      foreignKeys: [],
      indexes: [{ name: `pk_${name}`, columns: "id", is_unique: true, index_type: "PRIMARY" }],
    };

    const updatedSchema = {
      ...currentSchema,
      tables: {
        ...currentSchema.tables,
        [name]: newTable,
      },
    };

    // Place node at center of current nodes or top-left
    let x = 150;
    let y = 150;
    if (nodes.length > 0) {
      const avgX = nodes.reduce((sum, n) => sum + n.position.x, 0) / nodes.length;
      const avgY = nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length;
      x = avgX + 50;
      y = avgY + 50;
    }

    const newNode: Node = {
      id: name,
      type: "tableNode",
      position: { x, y },
      data: {
        tableSchema: newTable,
        color: "#10b981", // Emerald-500 for newly created tables
      },
    };

    set((state) => ({
      currentSchema: updatedSchema,
      nodes: [...state.nodes, newNode],
      selectedTableId: name, // Open designer immediately
    }));
    get().saveLayout();
  },

  deleteTable: (name) => {
    const { currentSchema } = get();
    if (!currentSchema) return;

    const updatedTables = { ...currentSchema.tables };
    delete updatedTables[name];

    // Remove foreign keys pointing to this table in other tables
    for (const [tName, table] of Object.entries(updatedTables)) {
      const filteredFks = table.foreignKeys.filter(fk => fk.referenced_table !== name);
      if (filteredFks.length !== table.foreignKeys.length) {
        updatedTables[tName] = {
          ...table,
          foreignKeys: filteredFks,
        };
      }
    }

    const updatedSchema = {
      ...currentSchema,
      tables: updatedTables,
    };

    set((state) => ({
      currentSchema: updatedSchema,
      nodes: state.nodes.filter((n) => n.id !== name),
      edges: state.edges.filter((e) => e.source !== name && e.target !== name),
      selectedTableId: state.selectedTableId === name ? null : state.selectedTableId,
    }));
    get().saveLayout();
  },

  updateTable: (oldName, updated) => {
    const { currentSchema, edges } = get();
    if (!currentSchema) return;

    const updatedTables = { ...currentSchema.tables };
    delete updatedTables[oldName];
    updatedTables[updated.name] = updated;

    // Update foreign keys that reference this table if it was renamed
    if (oldName !== updated.name) {
      for (const [tName, table] of Object.entries(updatedTables)) {
        const mappedFks = table.foreignKeys.map(fk => {
          if (fk.referenced_table === oldName) {
            return { ...fk, referenced_table: updated.name };
          }
          return fk;
        });
        updatedTables[tName] = {
          ...table,
          foreignKeys: mappedFks,
        };
      }
    }

    const updatedSchema = {
      ...currentSchema,
      tables: updatedTables,
    };

    // Update Nodes
    const updatedNodes = get().nodes.map((n) => {
      if (n.id === oldName) {
        return {
          ...n,
          id: updated.name,
          data: {
            ...n.data,
            tableSchema: updated,
          },
        };
      }
      return n;
    });

    // Update Edges
    const updatedEdges = edges.map((e) => {
      let nextEdge = { ...e };
      if (e.source === oldName) {
        nextEdge.source = updated.name;
        // Map handle ids if columns renamed? (simplified for now: keeps handle id as column name)
      }
      if (e.target === oldName) {
        nextEdge.target = updated.name;
      }
      return nextEdge;
    });

    set({
      currentSchema: updatedSchema,
      nodes: updatedNodes,
      edges: updatedEdges,
      selectedTableId: get().selectedTableId === oldName ? updated.name : get().selectedTableId,
    });
    get().saveLayout();
  },

  addEdgeConnection: (sourceTable, sourceCol, targetTable, targetCol) => {
    const { currentSchema, dbType } = get();
    if (!currentSchema) return;

    const sourceTableSchema = currentSchema.tables[sourceTable];
    const targetTableSchema = currentSchema.tables[targetTable];
    if (!sourceTableSchema || !targetTableSchema) return;

    const fkName = `fk_${sourceTable}_${sourceCol}`;
    
    // 1. If SQL connection, add it structurally to the table schema
    const isMongo = dbType === "mongodb";
    let updatedSchema = { ...currentSchema };

    if (!isMongo) {
      const newFk: ForeignKeyInfo = {
        name: fkName,
        columns: sourceCol,
        referenced_table: targetTable,
        referenced_columns: targetCol,
        on_update: "CASCADE",
        on_delete: "SET NULL",
      };

      updatedSchema.tables[sourceTable] = {
        ...sourceTableSchema,
        foreignKeys: [...sourceTableSchema.foreignKeys, newFk],
      };
    }

    // 2. Draw visual edge
    const newEdge: Edge = {
      id: `fk-${sourceTable}-${sourceCol}-${targetTable}-${targetCol}`,
      source: sourceTable,
      sourceHandle: `${sourceCol}-right`,
      target: targetTable,
      targetHandle: `${targetCol}-left`,
      style: isMongo 
        ? { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "5,5" } 
        : { stroke: "#3b82f6", strokeWidth: 2 }, // Visual blue for edited FKs
      className: isMongo ? "virtual-edge" : "sql-edge",
      animated: true,
      data: { isVirtual: isMongo },
    };

    set((state) => ({
      currentSchema: updatedSchema,
      edges: [...state.edges, newEdge],
      nodes: state.nodes.map((n) =>
        n.id === sourceTable && !isMongo
          ? {
              ...n,
              data: {
                ...n.data,
                tableSchema: updatedSchema.tables[sourceTable],
              },
            }
          : n
      ),
    }));
    get().saveLayout();
  },

  deleteEdgeConnection: (edgeId) => {
    const { currentSchema, edges, dbType } = get();
    if (!currentSchema) return;

    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;

    let updatedSchema = { ...currentSchema };
    const isMongo = dbType === "mongodb" || edge.data?.isVirtual;

    if (!isMongo) {
      const sourceTable = edge.source;
      const sourceTableSchema = currentSchema.tables[sourceTable];
      
      if (sourceTableSchema) {
        // Find which foreign key maps to this connection (simplified matching)
        const sourceCol = edge.sourceHandle?.replace("-right", "");
        const targetTable = edge.target;

        const filteredFks = sourceTableSchema.foreignKeys.filter(
          (fk) => !(fk.columns === sourceCol && fk.referenced_table === targetTable)
        );

        updatedSchema.tables[sourceTable] = {
          ...sourceTableSchema,
          foreignKeys: filteredFks,
        };
      }
    }

    set((state) => ({
      currentSchema: updatedSchema,
      edges: state.edges.filter((e) => e.id !== edgeId),
      nodes: state.nodes.map((n) =>
        n.id === edge.source && !isMongo
          ? {
              ...n,
              data: {
                ...n.data,
                tableSchema: updatedSchema.tables[edge.source],
              },
            }
          : n
      ),
    }));
    get().saveLayout();
  },

  resetLayout: () => {
    const { currentSchema } = get();
    if (!currentSchema) return;

    const tables = Object.values(currentSchema.tables);
    const newPositions = computeLayout(tables);

    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        position: newPositions[n.id] || { x: 100, y: 100 },
      })),
    }));
    get().saveLayout();
  },
}));
