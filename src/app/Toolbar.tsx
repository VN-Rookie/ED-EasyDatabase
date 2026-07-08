import { DatabaseZap, Plus, Settings, Search, Sun, Moon, MonitorSmartphone } from "lucide-react";
import { IconButton } from "../shared/ui/IconButton";
import { Button } from "../shared/ui/Button";
import { Kbd } from "../shared/ui/Kbd";
import { useThemeStore } from "../stores/themeStore";
import { useTranslation } from "../hooks/useTranslation";

interface ToolbarProps {
  onNewConnection?: () => void;
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
}

export function Toolbar({ onNewConnection, onOpenSettings, onOpenPalette }: ToolbarProps) {
  const { pref, setPref } = useThemeStore();
  const { t } = useTranslation();
  const next = pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
  const ThemeIcon = pref === "light" ? Sun : pref === "dark" ? Moon : MonitorSmartphone;

  return (
    <header className="h-12 flex-shrink-0 flex items-center gap-2 px-3 border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex items-center gap-2 pr-2">
        <DatabaseZap size={19} className="text-accent" />
        <span className="font-bold text-sm text-fg tracking-tight">EasyDatabase</span>
      </div>
      <div className="w-px h-5 bg-border" />

      <Button variant="subtle" size="sm" icon={Search} onClick={onOpenPalette}>
        {t("searchButton")}
        <Kbd>⌘K</Kbd>
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <IconButton icon={ThemeIcon} label={`${t("themeTooltip")}: ${pref}`} onClick={() => setPref(next)} />
        <Button variant="subtle" size="sm" icon={Plus} onClick={onNewConnection}>
          {t("newConnection")}
        </Button>
        <IconButton icon={Settings} label={t("settingsTooltip")} onClick={onOpenSettings} />
      </div>
    </header>
  );
}
