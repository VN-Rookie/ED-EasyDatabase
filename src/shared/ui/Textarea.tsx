import type { TextareaHTMLAttributes, Ref } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className = "", ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={`min-h-[60px] w-full px-3 py-2 text-sm bg-elevated text-fg rounded-[var(--radius-md)] border border-border placeholder:text-faint transition-colors duration-[var(--dur-fast)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 resize-y ${className}`}
    />
  );
}
