import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center h-5 px-1.5 text-[10px] font-medium font-sans text-muted bg-elevated border border-border rounded-[var(--radius-sm)] shadow-sm">
      {children}
    </kbd>
  );
}
