import { useState, useEffect, useRef, useCallback, type ElementType } from "react";
import { Search, Settings, Plus, Moon, Database, Terminal, GitFork, Table2, Bookmark, History, Command, Loader2, Sparkles } from "lucide-react";
import { usePaletteStore } from "./useCommandPalette";
import { useConnectionStore } from "../connection/connectionStore";
import { useThemeStore } from "../../stores/themeStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useViewStore } from "../../stores/viewStore";
import { useSavedQueries } from "../../hooks/useSavedQueries";
import { listTables } from "../explorer/schemaApi";
import { connectConnection } from "../connection/connectionApi";
import type { DbType } from "../../shared/types";
import { useTranslation } from "../../hooks/useTranslation";

interface PaletteItem {
  id: string;
  category: "commands" | "tables" | "snippets" | "history";
  label: string;
  description?: string;
  icon: ElementType;
  action: () => void;
}

interface CommandPaletteProps {
  onNewConnection: () => void;
  onOpenSettings: () => void;
}

type SearchCategory = "all" | "commands" | "tables" | "snippets" | "history";

interface TableSearchItem {
  connId: string;
  connName: string;
  dbType: DbType;
  tableName: string;
  database?: string;
}

export function CommandPalette({ onNewConnection, onOpenSettings }: CommandPaletteProps) {
  const { t } = useTranslation();
  const setOpen = usePaletteStore((s) => s.setOpen);
  const paletteOpen = usePaletteStore((s) => s.open);
  const { savedConnections, activeConnections, addActiveConnection, setActiveConnectionId } = useConnectionStore();
  const { openObject } = useWorkspaceStore();
  const { queryHistory } = useViewStore();
  const { pref, setPref } = useThemeStore();
  const { load: loadSaved, queries: savedQueries } = useSavedQueries();

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeTables, setActiveTables] = useState<TableSearchItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const close = useCallback(() => setOpen(false), [setOpen]);

  // Load saved queries and active connection tables
  useEffect(() => {
    if (!paletteOpen) return;

    loadSaved();

    const fetchActiveMetadata = async () => {
      setLoadingData(true);
      try {
        const tablesList: TableSearchItem[] = [];

        await Promise.all(
          activeConnections.map(async (conn) => {
            try {
              // Fetch tables/collections
              const tbls = await listTables(conn.id);
              tbls.forEach((t) => {
                tablesList.push({
                  connId: conn.id,
                  connName: conn.name,
                  dbType: conn.db_type,
                  tableName: t.name,
                });
              });
            } catch (err) {
              console.error("Failed to load search data for active connection:", conn.name, err);
            }
          })
        );

        setActiveTables(tablesList);
      } finally {
        setLoadingData(false);
      }
    };

    fetchActiveMetadata();
  }, [paletteOpen, activeConnections, loadSaved]);

  // Static Action Commands
  const staticActions: PaletteItem[] = [
    {
      id: "action:new-console",
      category: "commands",
      label: t("lblNewConsole"),
      description: t("descNewConsole"),
      icon: Terminal,
      action: () => {
        close();
        const activeConn = activeConnections[0] || savedConnections[0];
        if (activeConn) {
          openObject({
            id: `console:${activeConn.id}:${activeConn.db_type === "postgres" ? "public" : "default"}`,
            connId: activeConn.id,
            table: "",
            label: `Console: ${activeConn.name}`,
            engine: activeConn.db_type,
            type: "sql-console",
          });
        } else {
          onNewConnection();
        }
      },
    },
    {
      id: "action:er-diagram",
      category: "commands",
      label: t("lblErDiagram"),
      description: t("descErDiagram"),
      icon: GitFork,
      action: () => {
        close();
        const activeConn = activeConnections[0] || savedConnections[0];
        if (activeConn) {
          openObject({
            id: `er-diagram:${activeConn.id}:${activeConn.db_type === "postgres" ? "public" : "default"}`,
            connId: activeConn.id,
            table: "",
            label: `ER: ${activeConn.name}`,
            engine: activeConn.db_type,
            type: "er-diagram",
          });
        } else {
          onNewConnection();
        }
      },
    },
    {
      id: "action:new-connection",
      category: "commands",
      label: t("lblNewConnection"),
      description: t("descNewConnection"),
      icon: Plus,
      action: () => {
        close();
        onNewConnection();
      },
    },
    {
      id: "action:open-settings",
      category: "commands",
      label: t("lblOpenSettings"),
      description: t("descOpenSettings"),
      icon: Settings,
      action: () => {
        close();
        onOpenSettings();
      },
    },
    {
      id: "action:toggle-theme",
      category: "commands",
      label: `${t("lblToggleTheme")} (${t("lblThemeCurrent")}: ${pref})`,
      description: t("descToggleTheme"),
      icon: Moon,
      action: () => {
        const next = pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
        setPref(next);
        close();
      },
    },
  ];

  // Connections Items
  const connectionItems: PaletteItem[] = savedConnections.map((conn) => {
    const isActive = activeConnections.some((c) => c.id === conn.id);
    return {
      id: `conn:${conn.id}`,
      category: "commands",
      label: isActive ? `${t("lblSwitchContext")} ${conn.name}` : `${t("lblConnectTo")} ${conn.name}`,
      description: `${conn.db_type} · ${conn.host || conn.connection_string.split("@")[1] || "local"}:${conn.port || ""}`,
      icon: Database,
      action: async () => {
        close();
        if (isActive) {
          setActiveConnectionId(conn.id);
        } else {
          try {
            const meta = await connectConnection(conn);
            addActiveConnection(meta);
            setActiveConnectionId(meta.id);
          } catch (e) {
            console.error("Connection failed from palette:", e);
          }
        }
      },
    };
  });

  // Table items
  const tableItems: PaletteItem[] = activeTables.map((tItem) => ({
    id: `table:${tItem.connId}:${tItem.tableName}`,
    category: "tables",
    label: tItem.tableName,
    description: `${t("cmdDescTable")} ${tItem.connName} (${tItem.dbType})`,
    icon: Table2,
    action: () => {
      close();
      openObject({
        id: `${tItem.connId}:default:${tItem.tableName}`,
        connId: tItem.connId,
        table: tItem.tableName,
        label: tItem.tableName,
        engine: tItem.dbType,
      });
    },
  }));

  // Snippets
  const snippetItems: PaletteItem[] = savedQueries.map((q) => ({
    id: `snippet:${q.id}`,
    category: "snippets",
    label: q.name,
    description: q.sql.length > 80 ? `${q.sql.slice(0, 80)}...` : q.sql,
    icon: Bookmark,
    action: () => {
      close();
      const activeTab = useViewStore.getState().activeTabId;
      useViewStore.getState().setTabSql(activeTab, q.sql);
      useViewStore.getState().setActiveView("query");
    },
  }));

  // Query History
  const historyItems: PaletteItem[] = queryHistory.slice(0, 15).map((sql, idx) => ({
    id: `history:${idx}`,
    category: "history",
    label: sql.length > 50 ? `${sql.slice(0, 50)}...` : sql,
    description: t("descHistoryClick"),
    icon: History,
    action: () => {
      close();
      const activeTab = useViewStore.getState().activeTabId;
      useViewStore.getState().setTabSql(activeTab, sql);
      useViewStore.getState().setActiveView("query");
    },
  }));

  // Combine all items
  const allItems = [...staticActions, ...connectionItems, ...tableItems, ...snippetItems, ...historyItems];

  // Process search shortcut prefix (e.g., "/t users")
  useEffect(() => {
    if (query.startsWith("/t ")) {
      setActiveCategory("tables");
      setQuery(query.slice(3));
    } else if (query.startsWith("/s ")) {
      setActiveCategory("snippets");
      setQuery(query.slice(3));
    } else if (query.startsWith("/h ")) {
      setActiveCategory("history");
      setQuery(query.slice(3));
    } else if (query.startsWith("/c ")) {
      setActiveCategory("commands");
      setQuery(query.slice(3));
    }
  }, [query]);

  // Filters items by category & search query
  const filtered = allItems.filter((item) => {
    // 1. Filter by category first
    if (activeCategory !== "all" && item.category !== activeCategory) {
      return false;
    }
    // 2. Filter by search query
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q)
    );
  });

  // Keep selected index in bound
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
    if (!activeEl) return;

    const containerHeight = listRef.current.clientHeight;
    const scrollTop = listRef.current.scrollTop;
    const elementTop = activeEl.offsetTop;
    const elementHeight = activeEl.clientHeight;

    if (elementTop < scrollTop) {
      listRef.current.scrollTop = elementTop;
    } else if (elementTop + elementHeight > scrollTop + containerHeight) {
      listRef.current.scrollTop = elementTop + elementHeight - containerHeight;
    }
  }, [selectedIndex]);

  // Handle key navigation
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[selectedIndex]?.action();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      // Cycle tabs
      const categories: SearchCategory[] = ["all", "commands", "tables", "snippets", "history"];
      const nextIndex = (categories.indexOf(activeCategory) + (e.shiftKey ? -1 : 1) + categories.length) % categories.length;
      setActiveCategory(categories[nextIndex]);
    }
  };

  const getCategoryCount = (cat: SearchCategory) => {
    if (cat === "all") return allItems.length;
    return allItems.filter(i => i.category === cat).length;
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-[var(--overlay)] anim-fade" onClick={close} />
      
      {/* Search Panel */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl mt-[10vh] mx-4 bg-elevated border border-border rounded-[var(--radius-lg)] shadow-2xl anim-pop overflow-hidden flex flex-col max-h-[70vh]">
          
          {/* Input Box */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-surface/50">
            <Search size={16} className="text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t("cmdPalettePlaceholder")}
              className="flex-1 bg-transparent text-sm text-fg placeholder:text-faint outline-none font-medium"
            />
            {loadingData && <Loader2 size={14} className="animate-spin text-accent shrink-0" />}
            <kbd className="text-[10px] text-faint border border-border rounded px-1.5 py-0.5 shadow-sm font-mono shrink-0">Esc</kbd>
          </div>

          {/* Categories Tab Bar */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/60 bg-surface/30 overflow-x-auto shrink-0 select-none">
            {(["all", "commands", "tables", "snippets", "history"] as SearchCategory[]).map((cat) => {
              const count = getCategoryCount(cat);
              const label = 
                cat === "all" ? t("cmdCatAll") :
                cat === "commands" ? t("cmdCatCommands") :
                cat === "tables" ? t("cmdCatTables") :
                cat === "snippets" ? t("cmdCatSnippets") : t("cmdCatHistory");
              
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] text-xs font-semibold transition-all duration-[var(--dur-fast)] cursor-pointer ${
                    active 
                      ? "bg-accent/15 text-accent border border-accent/25 shadow-sm" 
                      : "text-muted hover:bg-hover hover:text-fg border border-transparent"
                  }`}
                >
                  {label}
                  <span className={`text-[10px] font-mono rounded-full px-1.5 py-0.2 ${
                    active ? "bg-accent/20 text-accent" : "bg-elevated text-faint"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Results List */}
          <div ref={listRef} className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <Sparkles size={24} className="text-faint mb-2" />
                <p className="text-sm text-muted font-medium">{t("cmdNoResultsTitle")}</p>
                <p className="text-xs text-faint mt-1">{t("cmdNoResultsDesc")}</p>
              </div>
            ) : (
              (() => {
                let currentCategory = "";
                return filtered.map((item, i) => {
                  const Icon = item.icon;
                  const isSelected = i === selectedIndex;
                  const showHeader = activeCategory === "all" && item.category !== currentCategory;
                  
                  if (showHeader) {
                    currentCategory = item.category;
                  }

                  const categoryLabel = 
                    item.category === "commands" ? t("cmdHeaderCommands") :
                    item.category === "tables" ? t("cmdHeaderTables") :
                    item.category === "snippets" ? t("cmdHeaderSnippets") : t("cmdHeaderHistory");

                  return (
                    <div key={item.id}>
                      {showHeader && (
                        <div className="px-4 py-1.5 text-[10px] font-bold text-muted uppercase tracking-wider bg-surface/50 border-y border-border/30 first:border-t-0 select-none">
                          {categoryLabel}
                        </div>
                      )}
                      <button
                        onClick={item.action}
                        className={`w-full flex items-start gap-3.5 px-4 py-2.5 text-left transition-all duration-[var(--dur-fast)] border-l-2 ${
                          isSelected 
                            ? "bg-accent/8 border-accent text-fg" 
                            : "border-transparent text-fg hover:bg-hover/80"
                        }`}
                      >
                        <div className={`p-1.5 rounded-[var(--radius-sm)] transition-colors ${
                          isSelected ? "bg-accent/15 text-accent" : "bg-surface text-muted"
                        }`}>
                          <Icon size={14} className="shrink-0" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate flex items-center justify-between">
                            <span>{item.label}</span>
                            {isSelected && (
                              <span className="text-[10px] text-accent font-semibold flex items-center gap-0.5">
                                <Command size={10} /> Enter
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <div className={`text-xs mt-0.5 truncate font-medium ${
                              isSelected ? "text-fg/80" : "text-muted"
                            }`}>
                              {item.description}
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                });
              })()
            )}
          </div>

          {/* Quick Help Footer */}
          <div className="px-4 py-2 border-t border-border bg-surface/40 text-[10px] text-faint flex items-center justify-between select-none">
            <div className="flex items-center gap-3">
              <span>↑↓ {t("cmdHelpMove")}</span>
              <span>•</span>
              <span>Enter {t("cmdHelpSelect")}</span>
              <span>•</span>
              <span>Tab {t("cmdHelpTab")}</span>
              <span>•</span>
              <span>Esc {t("cmdHelpClose")}</span>
            </div>
            <div className="flex items-center gap-1.5 font-semibold">
              <span>{t("cmdHelpQuick")}:</span>
              <code className="bg-elevated px-1 py-0.5 rounded border border-border">/t {t("tabData")}</code>
              <code className="bg-elevated px-1 py-0.5 rounded border border-border">/s Snippets</code>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
