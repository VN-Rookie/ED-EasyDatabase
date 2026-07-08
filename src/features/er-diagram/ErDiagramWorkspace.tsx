import { useEffect, useCallback, useMemo, useState } from "react";
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  BackgroundVariant, 
  type Connection, 
  type Edge, 
  type Node 
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { 
  Sparkles, 
  Plus, 
  Save, 
  Database, 
  Loader2, 
  RefreshCw, 
  HelpCircle 
} from "lucide-react";

import { useErStore } from "./erStore";
import { TableNode } from "./TableNode";
import { TableDesignerDrawer } from "./TableDesignerDrawer";
import { ForwardEngineeringModal } from "./ForwardEngineeringModal";
import { Button } from "../../shared/ui/Button";
import { useTranslation } from "../../hooks/useTranslation";

interface ErDiagramWorkspaceProps {
  connId: string;
  dbType: "postgres" | "mysql" | "mongodb" | "redis";
}

export function ErDiagramWorkspace({ connId, dbType }: ErDiagramWorkspaceProps) {
  const { t } = useTranslation();
  const { 
    nodes, 
    edges, 
    loading, 
    saving, 
    loadSchema, 
    saveLayout, 
    onNodesChange, 
    onEdgesChange, 
    updateNodePosition, 
    setSelectedTableId, 
    addEdgeConnection, 
    deleteEdgeConnection, 
    addTable, 
    resetLayout 
  } = useErStore();

  const [showSyncModal, setShowSyncModal] = useState(false);

  // Load database metadata when connection changes
  useEffect(() => {
    loadSchema(connId, dbType);
  }, [connId, dbType, loadSchema]);

  // Bind custom node components
  const nodeTypes = useMemo(() => ({ tableNode: TableNode }), []);

  // Update node position in store when visual drag stops
  const handleNodeDragStop = useCallback((_: any, node: Node) => {
    updateNodePosition(node.id, node.position.x, node.position.y);
  }, [updateNodePosition]);

  // Handle double clicking nodes to open table designer drawer
  const handleNodeDoubleClick = useCallback((_: any, node: Node) => {
    setSelectedTableId(node.id);
  }, [setSelectedTableId]);

  // Handle drawing new connection edges (Foreign Key constraints)
  const handleConnect = useCallback((connection: Connection) => {
    const sourceTable = connection.source;
    const sourceCol = connection.sourceHandle?.replace("-right", "");
    const targetTable = connection.target;
    const targetCol = connection.targetHandle?.replace("-left", "");

    if (sourceTable && sourceCol && targetTable && targetCol) {
      addEdgeConnection(sourceTable, sourceCol, targetTable, targetCol);
    }
  }, [addEdgeConnection]);

  // Handle keyboard deletes on Edges
  const handleEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
    for (const e of edgesToDelete) {
      deleteEdgeConnection(e.id);
    }
  }, [deleteEdgeConnection]);

  const handleAddTable = () => {
    const name = prompt(t("erPromptNewTableName"));
    if (name && name.trim()) {
      addTable(name.trim());
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-surface/30">
        <Loader2 className="animate-spin text-accent mb-2" size={24} />
        <span className="text-xs text-muted">{t("erReadingMeta")}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg relative">
      {/* Top Toolbar */}
      <div className="px-4 py-2 border-b border-border bg-surface flex items-center justify-between shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-wider text-fg uppercase flex items-center gap-1.5">
            <Database size={12} className="text-accent" /> {t("erDesignerTitle")}
          </span>
          <span className="text-[10px] bg-hover text-muted px-2 py-0.5 rounded font-mono">
            {dbType}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex">
          {/* Reload from DB */}
          <Button
            onClick={() => loadSchema(connId, dbType)}
            variant="subtle"
            className="!p-1.5 h-8 flex items-center gap-1.5 text-[11px]"
            title={t("erReloadSchemaTooltip")}
          >
            <RefreshCw size={12} />
          </Button>

          {/* Add Table */}
          <Button
            onClick={handleAddTable}
            variant="subtle"
            className="!py-1 !px-2.5 h-8 flex items-center gap-1.5 text-[11px]"
          >
            <Plus size={13} /> {t("erAddTableBtn")}
          </Button>

          {/* Auto Layout */}
          <Button
            onClick={resetLayout}
            variant="subtle"
            className="!py-1 !px-2.5 h-8 flex items-center gap-1.5 text-[11px]"
            title={t("erArrangeTablesTooltip")}
          >
            <Sparkles size={12} /> {t("erCleanLayoutBtn")}
          </Button>

          {/* Save Coordinates */}
          <Button
            onClick={saveLayout}
            variant="subtle"
            className="!py-1 !px-2.5 h-8 flex items-center gap-1.5 text-[11px]"
            disabled={saving}
          >
            <Save size={12} /> {saving ? t("erSavingStatus") : t("erSaveLayoutBtn")}
          </Button>

          {/* Sync DB / Forward Engineering */}
          <Button
            onClick={() => setShowSyncModal(true)}
            className="!py-1 !px-2.5 h-8 flex items-center gap-1.5 text-[11px] bg-accent hover:bg-accent-hover text-white font-medium"
          >
            <Database size={12} /> {t("erSyncDbBtn")}
          </Button>
        </div>
      </div>

      {/* Helper User Guide overlay */}
      <div className="absolute top-14 left-4 p-2.5 bg-surface/80 backdrop-blur border border-border/80 rounded-lg text-[10px] text-muted space-y-1.5 max-w-[200px] z-10 pointer-events-none select-none shadow-md">
        <div className="font-bold flex items-center gap-1 text-fg">
          <HelpCircle size={11} /> {t("erCanvasGuideTitle")}
        </div>
        <ul className="list-disc pl-3 space-y-0.5">
          <li>{t("erGuidePoint1")}</li>
          <li>{t("erGuidePoint2")}</li>
          <li>{t("erGuidePoint3")}</li>
        </ul>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onEdgesDelete={handleEdgesDelete}
          onNodeDragStop={handleNodeDragStop}
          onNodeDoubleClick={handleNodeDoubleClick}
          nodeTypes={nodeTypes}
          fitView
          className="dark"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
          <Controls className="!bg-surface !border-border !text-fg" />
          <MiniMap 
            nodeColor={(n) => (n.data?.color as string) || "#3b82f6"} 
            className="!bg-surface !border-border"
            maskColor="rgba(0,0,0,0.4)"
          />
        </ReactFlow>
      </div>

      {/* Table Designer Drawer */}
      <TableDesignerDrawer />

      {/* Forward Engineering Modal */}
      {showSyncModal && (
        <ForwardEngineeringModal onClose={() => setShowSyncModal(false)} />
      )}
    </div>
  );
}
