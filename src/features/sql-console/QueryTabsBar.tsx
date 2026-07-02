import { X, Plus, FileCode } from "lucide-react";

export interface QueryTab {
  id: string;
  title: string;
  query: string;
  isModified: boolean;
}

interface QueryTabsBarProps {
  tabs: QueryTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, title: string) => void;
}

export function QueryTabsBar({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
}: QueryTabsBarProps) {
  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onCloseTab(tabId);
  };

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 border-b border-border bg-surface shrink-0 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelectTab(tab.id)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-t-[var(--radius-sm)] border transition-all min-w-0 max-w-[180px] group ${
            activeTabId === tab.id
              ? "bg-elevated border-border border-b-transparent text-fg"
              : "border-transparent text-muted hover:text-fg hover:bg-hover"
          }`}
        >
          <FileCode size={11} className="shrink-0" />
          <span className="truncate">{tab.title}</span>
          {tab.isModified && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent" title="Unsaved changes" />
          )}
          {tabs.length > 1 && (
            <button
              onClick={(e) => handleClose(e, tab.id)}
              className="shrink-0 p-0.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors opacity-0 group-hover:opacity-100"
              title="Close tab"
            >
              <X size={10} />
            </button>
          )}
        </button>
      ))}
      <button
        onClick={onAddTab}
        className="shrink-0 p-1.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors"
        title="New query tab"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
