import type { SelectHTMLAttributes, ReactNode } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { children: ReactNode; }

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={`h-9 w-full px-3 text-sm bg-elevated text-fg rounded-[var(--radius-md)] border border-border transition-colors duration-[var(--dur-fast)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 ${className}`}
    >
      {children}
    </select>
  );
}
