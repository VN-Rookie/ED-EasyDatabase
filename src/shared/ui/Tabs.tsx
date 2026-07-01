import type { ElementType } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: ElementType;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function Tabs({ tabs, activeId, onSelect }: TabsProps) {
  return (
    <div className="flex -mb-px">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium transition-all duration-[var(--dur-base)] border-b-2 ${
            activeId === id
              ? "border-accent text-fg"
              : "border-transparent text-muted hover:text-fg hover:bg-hover"
          }`}
        >
          {Icon && <Icon size={11} className={activeId === id ? "text-accent" : ""} />}
          {label}
        </button>
      ))}
    </div>
  );
}
