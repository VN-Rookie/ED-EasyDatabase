import { useState } from "react";
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
import { useTheme } from "../shared/ui/useTheme";
import type { ConnectionConfig } from "../shared/types";

export function AppShell() {
  useTheme();
  usePaletteHotkey();
  const paletteOpen = usePaletteStore((s) => s.open);
  const setPaletteOpen = usePaletteStore((s) => s.setOpen);
  const { explorerWidth, setExplorerWidth } = useLayoutStore();
  const active = useWorkspaceStore((s) => s.openObjects.find((o) => o.id === s.activeObjectId));
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
      <StatusBar engine={active?.engine} connection={active ? "mock-connection" : undefined} object={active?.label} rowCount={active ? 42 : undefined} />
      {dialog.open && <ConnectionDialogShell initial={dialog.initial} onClose={() => setDialog({ open: false })} />}
      {settingsOpen && <SettingsShell onClose={() => setSettingsOpen(false)} />}
      {paletteOpen && (
        <CommandPalette
          onNewConnection={() => setDialog({ open: true })}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
    </div>
  );
}
