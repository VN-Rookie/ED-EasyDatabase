import type { ButtonHTMLAttributes, ElementType, ReactNode } from "react";

type Variant = "primary" | "subtle" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ElementType;
  children?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong shadow-sm",
  subtle:  "bg-elevated text-fg border border-border hover:bg-hover",
  ghost:   "text-muted hover:text-fg hover:bg-hover",
  danger:  "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20",
};
const SIZE: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-9 px-3.5 text-sm gap-2 rounded-[var(--radius-md)]",
};

export function Button({ variant = "subtle", size = "md", icon: Icon, children, className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center font-medium transition-all duration-[var(--dur-fast)] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {Icon && <Icon size={size === "sm" ? 13 : 15} />}
      {children}
    </button>
  );
}
