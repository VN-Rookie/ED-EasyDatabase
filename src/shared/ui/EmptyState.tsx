import type { ElementType } from "react";

interface EmptyStateProps {
  icon: ElementType;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center flex-col gap-3 anim-fade">
      <div className="w-14 h-14 bg-elevated border border-border shadow-sm rounded-[var(--radius-lg)] flex items-center justify-center">
        <Icon size={24} className="text-muted" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-fg text-sm font-medium">{title}</p>
        {subtitle && <p className="text-muted text-xs">{subtitle}</p>}
      </div>
    </div>
  );
}
