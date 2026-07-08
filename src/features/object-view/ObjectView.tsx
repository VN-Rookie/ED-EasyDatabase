import { Table2, ListTree, Hash, FileCode } from "lucide-react";
import { Tabs, type TabItem } from "../../shared/ui/Tabs";
import { DataViewShell } from "./DataViewShell";
import { StructureShell } from "./StructureShell";
import { IndexesShell } from "./IndexesShell";
import { DdlShell } from "./DdlShell";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { ObjectSubView, OpenObject } from "../../stores/workspaceStore";
import { useTranslation } from "../../hooks/useTranslation";

export function ObjectView({ object }: { object: OpenObject }) {
  const { t } = useTranslation();
  const { subView, setSubView } = useWorkspaceStore();
  const isMongo = object.engine === "mongodb";
  const tabs: TabItem[] = [
    { id: "data", label: isMongo ? t("tabDocuments") : t("tabData"), icon: Table2 },
    { id: "structure", label: t("tabStructure"), icon: ListTree },
    { id: "indexes", label: t("tabIndexes"), icon: Hash },
    ...(isMongo ? [] : [{ id: "ddl", label: t("tabDdl"), icon: FileCode }]),
  ];
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center border-b border-border px-3 bg-surface">
        <Tabs tabs={tabs} activeId={subView} onSelect={(v) => setSubView(v as ObjectSubView)} />
        <span className="ml-auto text-[11px] font-mono text-muted bg-elevated border border-border rounded-[var(--radius-md)] px-2 py-0.5">{object.label}</span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {subView === "data" && <DataViewShell object={object} />}
        {subView === "structure" && <StructureShell object={object} />}
        {subView === "indexes" && <IndexesShell object={object} />}
        {subView === "ddl" && !isMongo && <DdlShell object={object} />}
      </div>
    </div>
  );
}
