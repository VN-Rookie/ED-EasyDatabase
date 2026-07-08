import { invoke } from "@tauri-apps/api/core";

export const loadErLayout = (connId: string) =>
  invoke<string | null>("load_er_layout", { connId });

export const saveErLayout = (connId: string, layoutJson: string) =>
  invoke<void>("save_er_layout", { connId, layoutJson });
