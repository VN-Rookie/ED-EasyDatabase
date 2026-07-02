import { useState, useEffect, useRef, useCallback, type ElementType } from "react";
import { Search, Settings, Plus, Moon, Database } from "lucide-react";
import { usePaletteStore } from "./useCommandPalette";
import { useConnectionStore } from "../connection/connectionStore";
import { useThemeStore } from "../../stores/themeStore";

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: ElementType;
  action: () => void;
}

interface CommandPaletteProps {
  onNewConnection: () => void;
  onOpenSettings: () => void;
}

export function CommandPalette({ onNewConnection, onOpenSettings }: CommandPaletteProps) {
  const setOpen = usePaletteStore((s) => s.setOpen);
  const savedConnections = useConnectionStore((s) => s.savedConnections);
  const { pref, setPref } = useThemeStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const staticActions: PaletteItem[] = [
    {
      id: "new-connection",
      label: "New Connection",
      description: "Add a database connection",
      icon: Plus,
      action: () => { close(); onNewConnection(); },
    },
    {
      id: "open-settings",
      label: "Open Settings",
      description: "AI backend, MCP server",
      icon: Settings,
      action: () => { close(); onOpenSettings(); },
    },
    {
      id: "toggle-theme",
      label: `Toggle Theme (current: ${pref})`,
      description: "Cycle light → dark → system",
      icon: Moon,
      action: () => {
        const next = pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
        setPref(next);
        close();
      },
    },
  ];

  const connectionItems: PaletteItem[] = savedConnections.map((conn) => ({
    id: `conn:${conn.id}`,
    label: conn.name,
    description: conn.db_type,
    icon: Database,
    action: () => { close(); },
  }));

  const allItems = [...staticActions, ...connectionItems];

  const filtered = query.trim()
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        (item.description ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); filtered[selectedIndex]?.action(); }
    if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  useEffect(() => { setSelectedIndex(0); }, [query]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-[var(--overlay)] anim-fade" />
      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg mt-[12vh] mx-4 bg-elevated border border-border rounded-[var(--radius-lg)] shadow-lg anim-pop overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search size={14} className="text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search actions, connections…"
              className="flex-1 bg-transparent text-sm text-fg placeholder:text-faint outline-none"
            />
            <kbd className="text-[10px] text-faint border border-border rounded px-1">Esc</kbd>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-faint">No results</div>
            ) : (
              filtered.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors duration-[var(--dur-fast)] ${
                      i === selectedIndex ? "bg-accent/10 text-fg" : "text-fg hover:bg-hover"
                    }`}
                  >
                    <Icon size={14} className={i === selectedIndex ? "text-accent" : "text-muted"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.label}</div>
                      {item.description && (
                        <div className="text-[11px] text-muted truncate">{item.description}</div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
