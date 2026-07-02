import type { InputHTMLAttributes, Ref } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className = "", ref, ...rest }: InputProps) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`h-9 w-full px-3 text-sm bg-elevated text-fg rounded-[var(--radius-md)] border border-border placeholder:text-faint transition-colors duration-[var(--dur-fast)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 ${className}`}
    />
  );
}
