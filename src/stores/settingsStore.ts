import { create } from "zustand";

export interface Settings {
  // AI backend selection
  ai_backend: "openai" | "claude-api" | "ollama";

  // OpenAI-compatible (covers OpenAI, DeepSeek, LM Studio, any custom endpoint)
  openai_api_key: string;
  openai_base_url: string;
  openai_model: string;

  // Claude (Anthropic direct)
  claude_api_key: string;

  // Ollama (local)
  ollama_model: string;
  ollama_url: string;

  // MCP server
  mcp_port: number;
  mcp_read_only: boolean;
  /** UI zoom scale: 0.85 | 1.0 | 1.15 | 1.3 */
  ui_scale: number;
  system_font_size: number;
  editor_font_size: number;
  system_font_family: string;
  editor_font_family: string;
  language: "en" | "vi";
}

export const DEFAULT_SETTINGS: Settings = {
  ai_backend: "openai",
  openai_api_key: "",
  openai_base_url: "https://api.openai.com/v1",
  openai_model: "gpt-4o",
  claude_api_key: "",
  ollama_model: "llama3.1",
  ollama_url: "http://localhost:11434",
  mcp_port: 3456,
  mcp_read_only: true,
  ui_scale: 1.3,
  system_font_size: 12,
  editor_font_size: 14,
  system_font_family: "",
  editor_font_family: "",
  language: "en",
};

/** Well-known OpenAI-compatible provider presets */
export const OPENAI_PRESETS = [
  { label: "OpenAI",    base_url: "https://api.openai.com/v1",    model: "gpt-4o" },
  { label: "DeepSeek",  base_url: "https://api.deepseek.com/v1",  model: "deepseek-chat" },
  { label: "Groq",      base_url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "LM Studio", base_url: "http://localhost:1234/v1",      model: "local-model" },
] as const;

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  setSettings: (s: Settings) => void;
  setLoaded: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  setSettings: (settings) => set({ settings }),
  setLoaded: () => set({ loaded: true }),
}));
