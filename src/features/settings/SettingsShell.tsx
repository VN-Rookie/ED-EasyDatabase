import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Save, Loader2, History, Settings as SettingsIcon } from "lucide-react";
import { useSettingsStore, OPENAI_PRESETS, type Settings } from "../../stores/settingsStore";
import { useThemeStore } from "../../stores/themeStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { Select } from "../../shared/ui/Select";
import { getAuditLog, exportAuditLog } from "./auditApi";
import type { AuditEntry } from "../../shared/types";
import { save as nativeSave } from "@tauri-apps/plugin-dialog";
import { useToast } from "../../components/Toast";
import { useTranslation } from "../../hooks/useTranslation";

interface Props { onClose: () => void }

export function SettingsShell({ onClose }: Props) {
  const { t } = useTranslation();
  const { settings: stored, setSettings } = useSettingsStore();
  const { pref: themePref, setPref: setThemePref } = useThemeStore();
  const [draft, setDraft] = useState<Settings>(stored);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"general" | "audit">("general");
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const { toast } = useToast();

  useEffect(() => { setDraft(stored); }, [stored]);

  useEffect(() => {
    if (activeTab === "audit") {
      setLoadingAudit(true);
      getAuditLog(100)
        .then(setAuditLog)
        .catch((e) => toast(`${t("failedLoadAudit")}: ${e}`, "error"))
        .finally(() => setLoadingAudit(false));
    }
  }, [activeTab, toast, t]);

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
      const sanitizedDraft = { ...draft };
      if (sanitizedDraft.system_font_size < 9) sanitizedDraft.system_font_size = 9;
      if (sanitizedDraft.system_font_size > 24) sanitizedDraft.system_font_size = 24;
      if (sanitizedDraft.editor_font_size < 9) sanitizedDraft.editor_font_size = 9;
      if (sanitizedDraft.editor_font_size > 32) sanitizedDraft.editor_font_size = 32;

      const savedSettings = await invoke<Settings>("save_settings", { settings: sanitizedDraft });
      setSettings(savedSettings);
      setDraft(savedSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      toast(t("settingsSavedSuccess"), "success");
    } catch (e) {
      toast(`${t("settingsSavedFail")}: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleExportAudit = async () => {
    try {
      const csv = await exportAuditLog();
      const filePath = await nativeSave({
        defaultPath: "tool_sql_audit_log.csv",
        filters: [
          { name: "CSV", extensions: ["csv"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!filePath) return;
      await invoke("save_to_file", { path: filePath, content: csv });
      const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
      toast(`${t("successExport")} ${fileName}`, "success");
    } catch (e) {
      toast(`${t("exportFailed")}: ${e}`, "error");
    }
  };

  const labelCls = "block text-xs font-medium text-muted mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] anim-fade">
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-lg anim-pop w-[560px] h-[550px] flex flex-col resize overflow-hidden min-w-[400px] min-h-[350px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-fg">{t("settingsTitle")}</span>
          <button onClick={onClose} className="text-muted hover:text-fg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-border bg-surface/40 px-2 shrink-0">
          <button
            onClick={() => setActiveTab("general")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "general"
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            <SettingsIcon size={16} />
            {t("generalSettingsTab")}
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "audit"
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            <History size={16} />
            {t("auditLogTab")}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "general" ? (
            <div className="space-y-5">
              {/* Appearance */}
              <section>
                <h3 className="text-xs font-semibold text-fg uppercase tracking-wide mb-3">{t("appearanceSection")}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t("themeLabel")}</label>
                    <Select
                      value={themePref}
                      onChange={(e) => setThemePref(e.target.value as "light" | "dark" | "system")}
                    >
                      <option value="light">{t("themeLight")}</option>
                      <option value="dark">{t("themeDark")}</option>
                      <option value="system">{t("themeSystem")}</option>
                    </Select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("languageLabel")}</label>
                    <Select
                      value={draft.language || "en"}
                      onChange={(e) => set("language", e.target.value as "en" | "vi")}
                    >
                      <option value="en">{t("languageEn")}</option>
                      <option value="vi">{t("languageVi")}</option>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-3.5">
                  <div>
                    <label className={labelCls}>{t("systemFontSizeLabel")}</label>
                    <Input
                      type="number"
                      min={9}
                      max={24}
                      value={draft.system_font_size || 12}
                      onChange={(e) => set("system_font_size", Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{t("consoleFontSizeLabel")}</label>
                    <Input
                      type="number"
                      min={9}
                      max={32}
                      value={draft.editor_font_size || 14}
                      onChange={(e) => set("editor_font_size", Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3.5">
                  <div>
                    <label className={labelCls}>{t("systemFontFamilyLabel")}</label>
                    <Select
                      value={draft.system_font_family || ""}
                      onChange={(e) => set("system_font_family", e.target.value)}
                    >
                      <option value="">{t("defaultSystemFont")}</option>
                      <option value="Inter, system-ui, sans-serif">Inter</option>
                      <option value="Roboto, sans-serif">Roboto</option>
                      <option value="-apple-system, BlinkMacSystemFont, sans-serif">SF Pro / macOS Default</option>
                      <option value="'Segoe UI', sans-serif">Segoe UI</option>
                    </Select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("consoleFontFamilyLabel")}</label>
                    <Select
                      value={draft.editor_font_family || ""}
                      onChange={(e) => set("editor_font_family", e.target.value)}
                    >
                      <option value="">{t("defaultMonospaceFont")}</option>
                      <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                      <option value="Fira Code, monospace">Fira Code</option>
                      <option value="SF Mono, Menlo, monospace">SF Mono / Menlo</option>
                      <option value="Consolas, monospace">Consolas</option>
                      <option value="Source Code Pro, monospace">Source Code Pro</option>
                    </Select>
                  </div>
                </div>
              </section>

              {/* AI Backend */}
              <section>
                <h3 className="text-xs font-semibold text-fg uppercase tracking-wide mb-3">{t("aiBackendSection")}</h3>
                <div className="mb-3">
                  <label className={labelCls}>{t("providerLabel")}</label>
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
                      <label className={labelCls}>{t("quickPresetLabel")}</label>
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
                      <label className={labelCls}>{t("apiKeyLabel")}</label>
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
                        <label className={labelCls}>{t("baseUrlLabel")}</label>
                        <Input
                          value={draft.openai_base_url}
                          onChange={(e) => set("openai_base_url", e.target.value)}
                          className="font-mono"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t("modelLabel")}</label>
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
                    <label className={labelCls}>{t("anthropicApiKeyLabel")}</label>
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
                      <label className={labelCls}>{t("ollamaUrlLabel")}</label>
                      <Input
                        value={draft.ollama_url}
                        onChange={(e) => set("ollama_url", e.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t("modelLabel")}</label>
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
                <h3 className="text-xs font-semibold text-fg uppercase tracking-wide mb-3">{t("mcpServerSection")}</h3>
                <div className="flex items-center gap-4">
                  <div>
                    <label className={labelCls}>{t("portLabel")}</label>
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
                    <span className="text-xs text-fg">{t("readOnlyModeLabel")}</span>
                  </label>
                </div>
              </section>
            </div>
          ) : (
            <div className="h-full flex flex-col overflow-hidden">
              {loadingAudit ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <Loader2 className="animate-spin text-accent" size={28} />
                  <span className="text-xs text-muted mt-2">{t("loadingAuditLogs")}</span>
                </div>
              ) : auditLog.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8 text-xs text-muted italic">
                  {t("noOperationsRecorded")}
                </div>
              ) : (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="flex justify-between items-center mb-3 shrink-0">
                    <span className="text-xs text-muted font-medium">{t("recentOperations")}</span>
                    <Button variant="subtle" size="sm" onClick={handleExportAudit}>
                      {t("exportCsvButton")}
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto border border-border rounded-[var(--radius-md)] bg-elevated">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-surface text-muted sticky top-0">
                          <th className="p-2 font-medium w-[140px]">{t("timeCol")}</th>
                          <th className="p-2 font-medium w-[90px]">{t("connIdCol")}</th>
                          <th className="p-2 font-medium">{t("sqlCol")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLog.map((entry, idx) => (
                          <tr key={idx} className="border-b border-border/40 hover:bg-hover last:border-b-0">
                            <td className="p-2 text-[10px] font-mono text-muted">{new Date(entry.timestamp).toLocaleString()}</td>
                            <td className="p-2 text-[10px] font-mono text-muted truncate max-w-[90px]" title={entry.conn_id}>{entry.conn_id}</td>
                            <td className="p-2 font-mono text-[11px] text-fg break-all whitespace-pre-wrap">{entry.sql}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>{t("cancelButton")}</Button>
          {activeTab === "general" && (
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saved ? t("savedButton") : t("saveButton")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
