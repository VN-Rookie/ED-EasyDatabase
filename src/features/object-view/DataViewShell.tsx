import { Table2, ListTree, FileText } from "lucide-react";
import { DataGridShell } from "./DataGridShell";
import { DocumentView } from "./DocumentView";
import { TextView } from "./TextView";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { OpenObject } from "../../stores/workspaceStore";
import { useTranslation } from "../../hooks/useTranslation";

export function DataViewShell({ object }: { object: OpenObject }) {
  const { t } = useTranslation();
  const { dataViewModes, setDataViewMode } = useWorkspaceStore();
  const isMongo = object.engine === "mongodb";
  
  const currentMode = dataViewModes.get(object.id) ?? (isMongo ? "tree" : "table");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface">
      {/* Premium Segmented Switcher Control */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-wider uppercase text-muted/70 mr-1.5 select-none">
            {t("viewModeLabel") || "View"}
          </span>
          <div className="inline-flex bg-elevated/40 border border-border/80 p-0.5 rounded-lg shadow-inner">
            <button
              onClick={() => setDataViewMode(object.id, "table")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all duration-200 cursor-pointer ${
                currentMode === "table"
                  ? "bg-surface text-fg font-semibold shadow-sm border border-border/60"
                  : "text-muted hover:text-fg hover:bg-hover/50 border border-transparent"
              }`}
            >
              <Table2 size={13} className={currentMode === "table" ? "text-accent" : "text-muted"} />
              <span>{t("viewModeTable") || "Table"}</span>
            </button>
            <button
              onClick={() => setDataViewMode(object.id, "tree")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all duration-200 cursor-pointer ${
                currentMode === "tree"
                  ? "bg-surface text-fg font-semibold shadow-sm border border-border/60"
                  : "text-muted hover:text-fg hover:bg-hover/50 border border-transparent"
              }`}
            >
              <ListTree size={13} className={currentMode === "tree" ? "text-accent" : "text-muted"} />
              <span>{t("viewModeTree") || "Tree"}</span>
            </button>
            <button
              onClick={() => setDataViewMode(object.id, "text")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all duration-200 cursor-pointer ${
                currentMode === "text"
                  ? "bg-surface text-fg font-semibold shadow-sm border border-border/60"
                  : "text-muted hover:text-fg hover:bg-hover/50 border border-transparent"
              }`}
            >
              <FileText size={13} className={currentMode === "text" ? "text-accent" : "text-muted"} />
              <span>{t("viewModeText") || "Text"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {currentMode === "table" && <DataGridShell object={object} />}
        {currentMode === "tree" && <DocumentView object={object} />}
        {currentMode === "text" && <TextView object={object} />}
      </div>
    </div>
  );
}
