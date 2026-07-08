import { useState, useEffect } from "react";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { ResizableSplit } from "../shared/ui/ResizableSplit";
import { ExplorerTree } from "../features/explorer/ExplorerTree";
import { Workspace } from "../features/workspace/Workspace";
import { ConnectionDialogShell } from "../features/connection/ConnectionDialogShell";
import { SettingsShell } from "../features/settings/SettingsShell";
import { CommandPalette } from "../features/command-palette/CommandPalette";
import { usePaletteHotkey, usePaletteStore } from "../features/command-palette/useCommandPalette";
import { useLayoutStore } from "../stores/layoutStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useConnectionStore } from "../features/connection/connectionStore";
import { useTheme } from "../shared/ui/useTheme";
import { BackupProgressWidget } from "../features/explorer/BackupProgressWidget";
import { useSettings } from "../hooks/useSettings";
import { useSettingsStore } from "../stores/settingsStore";
import type { ConnectionConfig } from "../shared/types";

export function AppShell() {
  useTheme();
  usePaletteHotkey();
  const { loadSettings } = useSettings();
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const size = Number(settings.system_font_size);
    if (!isNaN(size) && size >= 9 && size <= 24) {
      document.documentElement.style.fontSize = `${size}px`;
    } else {
      document.documentElement.style.fontSize = "12px";
    }
  }, [settings.system_font_size]);

  useEffect(() => {
    if (settings.system_font_family) {
      document.documentElement.style.fontFamily = settings.system_font_family;
      document.documentElement.style.setProperty("--font-sans", settings.system_font_family);
    } else {
      document.documentElement.style.fontFamily = "";
      document.documentElement.style.removeProperty("--font-sans");
    }
  }, [settings.system_font_family]);

  useEffect(() => {
    const size = Number(settings.editor_font_size);
    if (!isNaN(size) && size >= 9 && size <= 32) {
      document.documentElement.style.setProperty("--editor-font-size", `${size}px`);
    } else {
      document.documentElement.style.setProperty("--editor-font-size", "14px");
    }
  }, [settings.editor_font_size]);

  useEffect(() => {
    if (settings.editor_font_family) {
      document.documentElement.style.setProperty("--font-mono", settings.editor_font_family);
    } else {
      document.documentElement.style.removeProperty("--font-mono");
    }
  }, [settings.editor_font_family]);

  const paletteOpen = usePaletteStore((s) => s.open);
  const setPaletteOpen = usePaletteStore((s) => s.setOpen);
  const { explorerWidth, setExplorerWidth } = useLayoutStore();
  const active = useWorkspaceStore((s) => s.openObjects.find((o) => o.id === s.activeObjectId));
  const { activeConnections } = useConnectionStore();
  const activeConn = active ? activeConnections.find((c) => c.id === active.connId) : null;
  const connectionName = activeConn ? activeConn.name : undefined;
  const [dialog, setDialog] = useState<{ open: boolean; initial?: ConnectionConfig }>({ open: false });
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-bg text-fg select-none overflow-hidden">
      <Toolbar
        onNewConnection={() => setDialog({ open: true })}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <ResizableSplit
        leftWidth={explorerWidth}
        onLeftWidthChange={setExplorerWidth}
        left={<ExplorerTree onEdit={(config) => setDialog({ open: true, initial: config })} />}
        right={<Workspace />}
      />
      <StatusBar engine={active?.engine} connection={connectionName} object={active?.label} rowCount={active ? 42 : undefined} />
      {dialog.open && <ConnectionDialogShell initial={dialog.initial} onClose={() => setDialog({ open: false })} />}
      {settingsOpen && <SettingsShell onClose={() => setSettingsOpen(false)} />}
      {paletteOpen && (
        <CommandPalette
          onNewConnection={() => setDialog({ open: true })}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <BackupProgressWidget />
    </div>
  );
}
