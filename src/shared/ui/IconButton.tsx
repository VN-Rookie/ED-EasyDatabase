import type { ElementType } from "react";

interface IconButtonProps {
  icon: ElementType;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}

export function IconButton({ icon: Icon, label, onClick, active, disabled, size = 14 }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-[var(--radius-md)] transition-all duration-[var(--dur-fast)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "text-accent bg-accent/12" : "text-muted hover:text-fg hover:bg-hover"
      }`}
    >
      <Icon size={size} />
    </button>
  );
}
