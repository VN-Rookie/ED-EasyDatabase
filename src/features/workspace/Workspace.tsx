import { useState } from "react";
import { Table2, Terminal, X } from "lucide-react";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ObjectView } from "../object-view/ObjectView";
import { SqlConsoleShell } from "../sql-console/SqlConsoleShell";
import { useWorkspaceStore } from "../../stores/workspaceStore";

export function Workspace() {
  const { openObjects, activeObjectId, setActiveObject, closeObject } = useWorkspaceStore();
  const [consoleOpen, setConsoleOpen] = useState(false);
  const active = openObjects.find((o) => o.id === activeObjectId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center border-b border-border bg-surface px-2 shrink-0 overflow-x-auto">
        {openObjects.map((o) => {
          const isActive = o.id === activeObjectId && !consoleOpen;
          return (
            <div
              key={o.id}
              className={`group flex items-center shrink-0 rounded-t-[var(--radius-md)] border-b-2 -mb-px transition-all duration-[var(--dur-fast)] ${
                isActive ? "border-accent text-fg bg-bg" : "border-transparent text-muted hover:text-fg hover:bg-hover"
              }`}
            >
              <button
                onClick={() => { setActiveObject(o.id); setConsoleOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap"
              >
                <Table2 size={11} />{o.label}
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
        <button
          onClick={() => setConsoleOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium shrink-0 rounded-t-[var(--radius-md)] border-b-2 -mb-px transition-all duration-[var(--dur-fast)] ${
            consoleOpen ? "border-accent text-fg bg-bg" : "border-transparent text-muted hover:text-fg hover:bg-hover"
          }`}
        >
          <Terminal size={11} />SQL Console
        </button>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Keep SqlConsoleShell always mounted to preserve editor state */}
        <div className={consoleOpen ? "flex-1 overflow-hidden flex flex-col" : "hidden"}>
          <SqlConsoleShell />
        </div>
        {!consoleOpen && (
          <div key={activeObjectId ?? "empty"} className="flex-1 overflow-hidden flex flex-col anim-fade">
            {active
              ? <ObjectView object={active} />
              : <EmptyState icon={Table2} title="No object open" subtitle="Pick a table or collection from the Explorer to begin" />
            }
          </div>
        )}
      </div>
    </div>
  );
}
