import { useEffect } from "react";
import { X, Copy } from "lucide-react";

interface CellExpandModalProps {
  column: string;
  value: unknown;
  onClose: () => void;
}

export function CellExpandModal({ column, value, onClose }: CellExpandModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let raw = "";
  let isJson = false;

  if (value === null || value === undefined) {
    raw = "NULL";
  } else if (typeof value === "object") {
    raw = JSON.stringify(value, null, 2);
    isJson = true;
  } else {
    const str = String(value);
    if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
      try {
        const parsed = JSON.parse(str);
        raw = JSON.stringify(parsed, null, 2);
        isJson = true;
      } catch {
        raw = str;
      }
    } else {
      raw = str;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm anim-fade">
      <div
        className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-lg anim-pop w-[560px] max-w-[95vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-xs font-mono text-fg truncate">
            <span className="text-sky-400">{column}</span>
            {isJson && (
              <span className="ml-2 text-[10px] text-muted bg-elevated border border-border rounded px-1.5 py-0.5">
                JSON
              </span>
            )}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                navigator.clipboard.writeText(raw);
                onClose();
              }}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-fg bg-elevated hover:bg-hover border border-border px-2 py-1 rounded-lg transition-all"
            >
              <Copy size={10} />
              Copy
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono text-fg whitespace-pre-wrap break-words leading-relaxed">
            {raw}
          </pre>
        </div>
      </div>
    </div>
  );
}
