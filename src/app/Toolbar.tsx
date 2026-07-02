import { DatabaseZap, Plus, Settings, Search, Sun, Moon, MonitorSmartphone } from "lucide-react";
import { IconButton } from "../shared/ui/IconButton";
import { Button } from "../shared/ui/Button";
import { Kbd } from "../shared/ui/Kbd";
import { useThemeStore } from "../stores/themeStore";

interface ToolbarProps {
  onNewConnection?: () => void;
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
}

export function Toolbar({ onNewConnection, onOpenSettings, onOpenPalette }: ToolbarProps) {
  const { pref, setPref } = useThemeStore();
  const next = pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
  const ThemeIcon = pref === "light" ? Sun : pref === "dark" ? Moon : MonitorSmartphone;

  return (
    <header className="h-12 flex-shrink-0 flex items-center gap-2 px-3 border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex items-center gap-2 pr-2">
        <DatabaseZap size={16} className="text-accent" />
        <span className="font-bold text-sm text-fg tracking-tight">tool-sql</span>
      </div>
      <div className="w-px h-5 bg-border" />

      <Button variant="subtle" size="sm" icon={Search} onClick={onOpenPalette}>
        Tìm kiếm
        <Kbd>⌘K</Kbd>
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <IconButton icon={ThemeIcon} label={`Theme: ${pref}`} onClick={() => setPref(next)} />
        <Button variant="subtle" size="sm" icon={Plus} onClick={onNewConnection}>
          New Connection
        </Button>
        <IconButton icon={Settings} label="Settings (⌘,)" onClick={onOpenSettings} />
      </div>
    </header>
  );
}
