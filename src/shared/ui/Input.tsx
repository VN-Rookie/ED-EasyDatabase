import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`h-9 w-full px-3 text-sm bg-elevated text-fg rounded-[var(--radius-md)] border border-border placeholder:text-faint transition-colors duration-[var(--dur-fast)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 ${className}`}
    />
  );
}
