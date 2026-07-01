import { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info" | "default";

interface ToastItem { id: string; message: string; type: ToastType; }
interface ToastContextValue { toast: (message: string, type?: ToastType) => void; }

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

// ── Styles ────────────────────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastType, { wrap: string; icon: string }> = {
  success: { wrap: "border-emerald-700/50 text-emerald-200", icon: "text-emerald-400" },
  error:   { wrap: "border-rose-700/50 text-rose-200",       icon: "text-rose-400" },
  info:    { wrap: "border-blue-700/50 text-blue-200",       icon: "text-blue-400" },
  default: { wrap: "border-white/10 text-[#e6edf3]",          icon: "text-[#7d8590]" },
};

const TOAST_ICONS: Record<ToastType, React.ElementType | null> = {
  success: CheckCircle2,
  error:   AlertCircle,
  info:    Info,
  default: null,
};

// ── Single toast ──────────────────────────────────────────────────────────────

function ToastBubble({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const style = TOAST_STYLES[item.type];
  const Icon  = TOAST_ICONS[item.type];
  return (
    <div className={`toast-enter flex items-start gap-2.5 min-w-[220px] max-w-[300px] px-3.5 py-2.5 rounded-xl border bg-[#21262d]/95 shadow-xl shadow-black/50 ${style.wrap}`}>
      {Icon && <Icon size={13} className={`mt-0.5 shrink-0 ${style.icon}`} />}
      <span className="text-[12px] flex-1 leading-relaxed">{item.message}</span>
      <button onClick={onDismiss} className="mt-0.5 opacity-40 hover:opacity-80 transition-opacity shrink-0">
        <X size={11} />
      </button>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "default") => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2600);
  }, []);

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastBubble item={t} onDismiss={() => dismiss(t.id)} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
