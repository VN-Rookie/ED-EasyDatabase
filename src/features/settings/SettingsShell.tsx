import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Save, Loader2 } from "lucide-react";
import { useSettingsStore, OPENAI_PRESETS, type Settings } from "../../stores/settingsStore";
import { useThemeStore } from "../../stores/themeStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { Select } from "../../shared/ui/Select";

interface Props { onClose: () => void }

export function SettingsShell({ onClose }: Props) {
  const { settings: stored, setSettings } = useSettingsStore();
  const { pref: themePref, setPref: setThemePref } = useThemeStore();
  const [draft, setDraft] = useState<Settings>(stored);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(stored); }, [stored]);

  const set = <K extends keyof Settings>(key: K, val: Settings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const applyPreset = (preset: typeof OPENAI_PRESETS[number]) => {
    setDraft((prev) => ({
      ...prev,
      ai_backend: "openai",
      openai_base_url: preset.base_url,
      openai_model: preset.model,
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const savedSettings = await invoke<Settings>("save_settings", { settings: draft });
      setSettings(savedSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "block text-xs font-medium text-muted mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] anim-fade">
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-lg anim-pop w-[520px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-fg">Settings</span>
          <button onClick={onClose} className="text-muted hover:text-fg transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Theme */}
          <section>
            <h3 className="text-xs font-semibold text-fg uppercase tracking-wide mb-3">Appearance</h3>
            <div>
              <label className={labelCls}>Theme</label>
              <Select
                value={themePref}
                onChange={(e) => setThemePref(e.target.value as "light" | "dark" | "system")}
                className="w-48"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </Select>
            </div>
          </section>

          {/* AI Backend */}
          <section>
            <h3 className="text-xs font-semibold text-fg uppercase tracking-wide mb-3">AI Backend</h3>
            <div className="mb-3">
              <label className={labelCls}>Provider</label>
              <Select
                value={draft.ai_backend}
                onChange={(e) => set("ai_backend", e.target.value as Settings["ai_backend"])}
              >
                <option value="openai">OpenAI-compatible (OpenAI, DeepSeek, Groq…)</option>
                <option value="claude-api">Claude (Anthropic)</option>
                <option value="ollama">Ollama (local)</option>
              </Select>
            </div>

            {draft.ai_backend === "openai" && (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Quick preset</label>
                  <div className="flex flex-wrap gap-1.5">
                    {OPENAI_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p)}
                        className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-xs border transition-colors ${
                          draft.openai_base_url === p.base_url
                            ? "bg-accent/10 border-accent text-accent"
                            : "bg-elevated border-border text-muted hover:text-fg hover:border-fg/30"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>API Key</label>
                  <Input
                    type="password"
                    value={draft.openai_api_key}
                    onChange={(e) => set("openai_api_key", e.target.value)}
                    placeholder="sk-..."
                    className="font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Base URL</label>
                    <Input
                      value={draft.openai_base_url}
                      onChange={(e) => set("openai_base_url", e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Model</label>
                    <Input
                      value={draft.openai_model}
                      onChange={(e) => set("openai_model", e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {draft.ai_backend === "claude-api" && (
              <div>
                <label className={labelCls}>Anthropic API Key</label>
                <Input
                  type="password"
                  value={draft.claude_api_key}
                  onChange={(e) => set("claude_api_key", e.target.value)}
                  placeholder="sk-ant-..."
                  className="font-mono"
                />
              </div>
            )}

            {draft.ai_backend === "ollama" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Ollama URL</label>
                  <Input
                    value={draft.ollama_url}
                    onChange={(e) => set("ollama_url", e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className={labelCls}>Model</label>
                  <Input
                    value={draft.ollama_model}
                    onChange={(e) => set("ollama_model", e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
            )}
          </section>

          {/* MCP */}
          <section>
            <h3 className="text-xs font-semibold text-fg uppercase tracking-wide mb-3">MCP Server</h3>
            <div className="flex items-center gap-4">
              <div>
                <label className={labelCls}>Port</label>
                <Input
                  type="number"
                  value={draft.mcp_port}
                  onChange={(e) => set("mcp_port", Number(e.target.value))}
                  className="w-24"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer mt-4">
                <input
                  type="checkbox"
                  checked={draft.mcp_read_only}
                  onChange={(e) => set("mcp_read_only", e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-xs text-fg">Read-only mode</span>
              </label>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
