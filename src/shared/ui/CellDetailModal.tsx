import { useEffect } from "react";
import { X, Copy, Check } from "lucide-react";
import { useState } from "react";

interface CellDetailModalProps {
  column: string;
  value: string;
  onClose: () => void;
}

export function CellDetailModal({ column, value, onClose }: CellDetailModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm anim-fade"
    >
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-lg anim-pop w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider truncate">{column}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={copy}
              className="flex items-center gap-1 text-xs text-muted hover:text-fg px-2 py-1 rounded hover:bg-hover transition-colors"
              title="Copy value"
            >
              {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors"
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="p-4 overflow-auto flex-1 min-h-0">
          <pre className="text-xs font-mono text-fg whitespace-pre-wrap break-words">{value}</pre>
        </div>
      </div>
    </div>
  );
}
