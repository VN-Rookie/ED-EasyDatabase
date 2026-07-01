import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../stores/settingsStore";
import { useSettingsStore } from "../stores/settingsStore";

export function useSettings() {
  const store = useSettingsStore();

  const loadSettings = async () => {
    try {
      const s = await invoke<Settings>("load_settings");
      store.setSettings(s);
      store.setLoaded();
    } catch (e) {
      // Still mark loaded so the app doesn't hang — but keep defaults
      store.setLoaded();
      console.warn("Settings load failed, using defaults:", e);
    }
  };

  const saveSettings = async (s: Settings) => {
    const saved = await invoke<Settings>("save_settings", { settings: s });
    store.setSettings(saved);
    return saved;
  };

  const checkOllama = async (): Promise<boolean> => {
    return invoke<boolean>("check_ollama");
  };

  return { loadSettings, saveSettings, checkOllama, settings: store.settings };
}
