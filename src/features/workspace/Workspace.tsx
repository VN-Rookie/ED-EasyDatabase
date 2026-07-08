import { Table2, Terminal, X, GitFork } from "lucide-react";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ObjectView } from "../object-view/ObjectView";
import { SqlConsoleShell } from "../sql-console/SqlConsoleShell";
import { ErDiagramWorkspace } from "../er-diagram/ErDiagramWorkspace";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { OpenObject } from "../../stores/workspaceStore";
import { ENGINE_META } from "../connection/engineMeta";

export function Workspace() {
  const { 
    openObjects, 
    activeObjectId, 
    setActiveObject, 
    closeObject
  } = useWorkspaceStore();
  
  const active = openObjects.find((o) => o.id === activeObjectId);

  const getIcon = (o: OpenObject) => {
    const meta = o.engine ? ENGINE_META[o.engine] : null;
    const EngineIcon = meta ? meta.icon : Table2;
    const color = meta ? meta.color : "text-muted";

    switch (o.type) {
      case "sql-console":
        return <Terminal size={11} className={color} />;
      case "er-diagram":
        return <GitFork size={11} className={`rotate-90 ${color}`} />;
      default:
        return <EngineIcon size={11} className={color} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-surface px-2 shrink-0 overflow-x-auto">
        {openObjects.map((o) => {
          const isActive = o.id === activeObjectId;
          return (
            <div
              key={o.id}
              className={`group flex items-center shrink-0 rounded-t-[var(--radius-md)] border-b-2 -mb-px transition-all duration-[var(--dur-fast)] ${
                isActive ? "border-accent text-fg bg-bg" : "border-transparent text-muted hover:text-fg hover:bg-hover"
              }`}
            >
              <button
                onClick={() => setActiveObject(o.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap"
              >
                {getIcon(o)}
                {o.label}
              </button>
              <button
                onClick={() => closeObject(o.id)}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-fg pr-1.5 transition-opacity"
                aria-label={`Close ${o.label}`}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Tab contents */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Keep all SqlConsoleShells mounted to preserve query state in editor tabs */}
        {openObjects.map((o) => {
          if (o.type === "sql-console") {
            const isVisible = o.id === activeObjectId;
            return (
              <div key={o.id} className={isVisible ? "flex-1 overflow-hidden flex flex-col anim-fade" : "hidden"}>
                <SqlConsoleShell connId={o.connId} />
              </div>
            );
          }
          return null;
        })}

        {/* Keep all ErDiagramWorkspaces mounted to preserve canvas layouts and zooms */}
        {openObjects.map((o) => {
          if (o.type === "er-diagram") {
            const isVisible = o.id === activeObjectId;
            return (
              <div key={o.id} className={isVisible ? "flex-1 overflow-hidden flex flex-col anim-fade" : "hidden"}>
                <ErDiagramWorkspace connId={o.connId} dbType={o.engine} />
              </div>
            );
          }
          return null;
        })}

        {/* Render active table details view */}
        {active && (active.type === "table" || !active.type) && (
          <div key={active.id} className="flex-1 overflow-hidden flex flex-col anim-fade">
            <ObjectView object={active} />
          </div>
        )}

        {/* Empty state */}
        {!active && (
          <EmptyState 
            icon={Table2} 
            title="No tab open" 
            subtitle="Double-click a table, or open a console/ER diagram from the sidebar actions menu to begin." 
          />
        )}
      </div>
    </div>
  );
}
