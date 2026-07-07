import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Eye, EyeOff, CheckCircle, XCircle, Loader2, Download, ExternalLink } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import type { Settings } from "../stores/settingsStore";
import { OPENAI_PRESETS } from "../stores/settingsStore";

interface AuditEntry { timestamp: string; conn_id: string; sql: string; }

interface Props { onClose: () => void; }

// ── small reusable field ──────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#7d8590] mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder, mono = false, className = "" }: {
  value: string; onChange: (v: string) => void; type?: string;
  placeholder?: string; mono?: boolean; className?: string;
}) {
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-[#21262d] border border-[#30363d] hover:border-[#484f58] focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-[#e6edf3] outline-none transition-colors placeholder:text-[#484f58] ${mono ? "font-mono" : ""} ${className}`}
    />
  );
}

// ── main component ────────────────────────────────────────────────────────────
export function SettingsPanel({ onClose }: Props) {
  const { settings, saveSettings, checkOllama } = useSettings();
  const [form, setForm] = useState<Settings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keyWarning, setKeyWarning] = useState(false);
  const [activeTab, setActiveTab] = useState<"interface" | "ai" | "mcp" | "audit">("interface");
  const [ollamaStatus, setOllamaStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => { setForm(settings); }, [settings]);

  useEffect(() => { if (activeTab === "audit") loadAuditLog(); }, [activeTab]);

  const set = (patch: Partial<Settings>) => setForm(f => ({ ...f, ...patch }));

  const handleSave = async () => {
    const needsKey =
      (form.ai_backend === "claude-api" && !form.claude_api_key.trim()) ||
      (form.ai_backend === "openai" && !form.openai_api_key.trim() &&
        !form.openai_base_url.includes("localhost"));
    if (needsKey) { setKeyWarning(true); return; }
    setKeyWarning(false);
    setSaving(true);
    try {
      await saveSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckOllama = async () => {
    setOllamaStatus("checking");
    const ok = await checkOllama();
    setOllamaStatus(ok ? "ok" : "fail");
    setTimeout(() => setOllamaStatus("idle"), 4000);
  };

  const loadAuditLog = async () => {
    setAuditLoading(true);
    try { setAuditLog(await invoke<AuditEntry[]>("get_audit_log", { limit: 200 })); }
    catch { /* ignore */ }
    finally { setAuditLoading(false); }
  };

  const handleExportCsv = async () => {
    try {
      const csv = await invoke<string>("export_audit_log");
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
        download: "easydatabase-audit.csv",
      });
      a.click();
    } catch { /* ignore */ }
  };

  const TABS = [
    { id: "interface", label: "Interface" },
    { id: "ai",        label: "AI Providers" },
    { id: "mcp",       label: "MCP Server" },
    { id: "audit",     label: "Audit Log" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <div>
            <h2 className="text-sm font-semibold text-[#e6edf3]">Settings</h2>
            <p className="text-[10px] text-[#7d8590] mt-0.5">Configure interface, AI providers, and MCP server</p>
          </div>
          <button onClick={onClose} className="text-[#7d8590] hover:text-[#e6edf3] rounded-lg p-1 hover:bg-[#292e36] transition-colors cursor-pointer">
            <X size={15} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[#30363d] px-4">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px cursor-pointer ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-300"
                  : "border-transparent text-[#7d8590] hover:text-[#e6edf3]"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* ── Interface ─────────────────────────────────────── */}
          {activeTab === "interface" && (
            <div className="space-y-6">
              <div>
                <label className="block text-[11px] font-medium text-[#7d8590] uppercase tracking-wider mb-3">UI Scale</label>
                <p className="text-[11px] text-[#7d8590] mb-4">Adjust the size of the entire interface. Useful on high-DPI or large monitors.</p>
                <div className="grid grid-cols-4 gap-2">
                  {([0.85, 1.0, 1.15, 1.3] as const).map(scale => {
                    const labels: Record<number, string> = { 0.85: "Compact", 1.0: "Normal", 1.15: "Comfortable", 1.3: "Large" };
                    const isActive = (form.ui_scale ?? 1.0) === scale;
                    return (
                      <button key={scale} type="button"
                        onClick={async () => {
                          const updated = { ...form, ui_scale: scale };
                          setForm(updated);
                          await saveSettings(updated).catch(() => {});
                        }}
                        className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                          isActive
                            ? "border-blue-500 bg-blue-500/10 text-blue-300"
                            : "border-[#30363d] bg-[#21262d]/40 text-[#7d8590] hover:border-[#484f58] hover:text-[#e6edf3]"
                        }`}>
                        <span className="text-[16px] font-bold font-mono">{scale}×</span>
                        <span className="text-[10px] font-medium">{labels[scale]}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 p-3 bg-[#21262d] border border-[#30363d] rounded-xl">
                  <p className="text-[11px] text-[#7d8590] mb-1">Preview</p>
                  <p style={{ fontSize: `${(form.ui_scale ?? 1.0) * 13}px` }} className="text-[#e6edf3]">
                    The quick brown fox jumps over the lazy dog
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── AI Providers ──────────────────────────────────── */}
          {activeTab === "ai" && <>
            {/* Backend selector */}
            <section>
              <Field label="AI Backend">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "openai",     label: "OpenAI / Compatible" },
                    { id: "claude-api", label: "Claude (Anthropic)" },
                    { id: "ollama",     label: "Ollama (local)" },
                  ] as const).map(b => (
                    <button key={b.id} onClick={() => set({ ai_backend: b.id })}
                      className={`py-2 px-2 rounded-lg border text-[11px] font-medium transition-colors text-center leading-tight ${
                        form.ai_backend === b.id
                          ? "border-blue-500 bg-blue-600/15 text-blue-300"
                          : "border-[#30363d] text-[#7d8590] hover:border-[#484f58] hover:text-[#e6edf3]"
                      }`}>{b.label}</button>
                  ))}
                </div>
              </Field>
            </section>

            {/* OpenAI-compatible */}
            {form.ai_backend === "openai" && <>
              <section className="space-y-3">
                {/* Provider presets */}
                <div>
                  <p className="text-[11px] text-[#7d8590] mb-2">Quick presets</p>
                  <div className="flex flex-wrap gap-1.5">
                    {OPENAI_PRESETS.map(p => (
                      <button key={p.label}
                        onClick={() => set({ openai_base_url: p.base_url, openai_model: p.model })}
                        className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                          form.openai_base_url === p.base_url && form.openai_model === p.model
                            ? "border-blue-500 bg-blue-600/15 text-blue-300"
                            : "border-[#30363d] text-[#7d8590] hover:border-[#484f58] hover:text-[#e6edf3]"
                        }`}>{p.label}</button>
                    ))}
                  </div>
                </div>

                <Field label="API Key">
                  <div className="relative">
                    <Input type={showOpenAiKey ? "text" : "password"} value={form.openai_api_key}
                      onChange={v => set({ openai_api_key: v })} placeholder="sk-..." mono />
                    <button type="button" onClick={() => setShowOpenAiKey(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7d8590] hover:text-[#e6edf3]">
                      {showOpenAiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </Field>

                <Field label="Base URL">
                  <Input value={form.openai_base_url} onChange={v => set({ openai_base_url: v })}
                    placeholder="https://api.openai.com/v1" mono />
                </Field>

                <Field label="Model">
                  <Input value={form.openai_model} onChange={v => set({ openai_model: v })}
                    placeholder="gpt-4o" mono />
                </Field>

                {keyWarning && <p className="text-[10px] text-yellow-500">API key is required (unless using localhost).</p>}
                <p className="text-[10px] text-[#7d8590]">
                  Works with any OpenAI-compatible API — DeepSeek, Groq, LM Studio, and more.
                </p>
              </section>
            </>}

            {/* Claude */}
            {form.ai_backend === "claude-api" && <>
              <section className="space-y-3">
                <Field label="API Key">
                  <div className="relative">
                    <Input type={showKey ? "text" : "password"} value={form.claude_api_key}
                      onChange={v => set({ claude_api_key: v })} placeholder="sk-ant-..." mono />
                    <button type="button" onClick={() => setShowKey(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7d8590] hover:text-[#e6edf3]">
                      {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </Field>
                <p className="text-[10px] text-[#7d8590] flex items-center gap-1">
                  Model: claude-sonnet-4-5 (fixed).{" "}
                  <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                    className="text-blue-500 hover:text-blue-400 inline-flex items-center gap-0.5">
                    Get API key <ExternalLink size={9} />
                  </a>
                </p>
                {keyWarning && <p className="text-[10px] text-yellow-500">Claude API key is required.</p>}
              </section>
            </>}

            {/* Ollama */}
            {form.ai_backend === "ollama" && <>
              <section className="space-y-3">
                <Field label="Server URL">
                  <Input value={form.ollama_url} onChange={v => set({ ollama_url: v })} mono />
                </Field>
                <Field label="Model">
                  <Input value={form.ollama_model} onChange={v => set({ ollama_model: v })}
                    placeholder="llama3.1" mono />
                </Field>
                <button onClick={handleCheckOllama} disabled={ollamaStatus === "checking"}
                  className="flex items-center gap-2 text-xs text-[#7d8590] hover:text-[#e6edf3] transition-colors disabled:opacity-40">
                  {ollamaStatus === "checking" && <Loader2 size={12} className="animate-spin" />}
                  {ollamaStatus === "ok" && <CheckCircle size={12} className="text-green-400" />}
                  {ollamaStatus === "fail" && <XCircle size={12} className="text-red-400" />}
                  {ollamaStatus === "idle" && <span className="w-3 inline-block" />}
                  {ollamaStatus === "checking" ? "Checking…" : ollamaStatus === "ok" ? "Reachable ✓" : ollamaStatus === "fail" ? "Cannot reach Ollama" : "Test connection"}
                </button>
              </section>
            </>}

            {/* Privacy note */}
            <div className="rounded-lg bg-[#21262d]/50 border border-[#30363d]/50 px-3 py-2.5">
              <p className="text-[10px] text-[#7d8590] leading-relaxed">
                🔒 <strong className="text-[#e6edf3]">Privacy:</strong> Only schema metadata (table/column names, types) is sent to the AI. Row data is never transmitted.
                Keys stored in <code className="text-[#e6edf3]">~/.config/easydatabase/settings.json</code>.
              </p>
            </div>
          </>}

          {/* ── MCP Server ────────────────────────────────────── */}
          {activeTab === "mcp" && <>
            <section className="space-y-4">
              <p className="text-xs text-[#7d8590]">
                EasyDatabase exposes an MCP server so Claude Code and other AI agents can query your databases directly.
              </p>
              <Field label="Port">
                <div className="flex items-center gap-3">
                  <Input value={String(form.mcp_port)} onChange={v => set({ mcp_port: Number(v) || 3456 })}
                    type="number" mono className="!w-28" />
                  <p className="text-[10px] text-[#7d8590]">Restart app to apply port changes.</p>
                </div>
              </Field>
              <div className="flex items-center justify-between py-0.5">
                <div>
                  <p className="text-xs text-[#e6edf3] font-medium">Read-only mode</p>
                  <p className="text-[10px] text-[#7d8590] mt-0.5">Block INSERT / UPDATE / DELETE from AI agents</p>
                </div>
                <button onClick={() => set({ mcp_read_only: !form.mcp_read_only })}
                  className={`relative w-10 h-[22px] rounded-full transition-colors ${form.mcp_read_only ? "bg-blue-600" : "bg-[#484f58]"}`}>
                  <span className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${form.mcp_read_only ? "translate-x-5" : "translate-x-[3px]"}`} />
                </button>
              </div>
            </section>

            <section>
              <p className="text-[11px] text-[#7d8590] font-medium uppercase tracking-wide mb-2">Claude Code Config</p>
              <pre className="bg-[#21262d] border border-[#30363d]/50 rounded-lg px-3.5 py-3 text-[11px] text-green-300 font-mono overflow-x-auto leading-relaxed">{`// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "easydatabase": {
      "command": "nc",
      "args": ["localhost", "${form.mcp_port}"]
    }
  }
}`}</pre>
            </section>
          </>}

          {/* ── Audit Log ─────────────────────────────────────── */}
          {activeTab === "audit" && <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-medium text-[#e6edf3]">MCP Query Log</h3>
                <p className="text-[10px] text-[#7d8590] mt-0.5">Every query executed via MCP</p>
              </div>
              <div className="flex gap-2">
                <button onClick={loadAuditLog} disabled={auditLoading}
                  className="text-[11px] text-[#7d8590] hover:text-[#e6edf3] transition-colors px-2 py-1 rounded hover:bg-[#292e36]">
                  {auditLoading ? <Loader2 size={11} className="animate-spin inline" /> : "↻ Refresh"}
                </button>
                <button onClick={handleExportCsv}
                  className="flex items-center gap-1 text-[11px] text-[#7d8590] hover:text-[#e6edf3] transition-colors px-2 py-1 rounded hover:bg-[#292e36]">
                  <Download size={11} /> Export CSV
                </button>
              </div>
            </div>
            {auditLoading ? (
              <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-[#484f58]" /></div>
            ) : auditLog.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-xs text-[#7d8590]">No queries logged yet.</p>
                <p className="text-[10px] text-[#484f58] mt-1">MCP queries will appear here.</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {auditLog.map((e, i) => (
                  <div key={i} className="bg-[#21262d]/50 border border-[#30363d]/40 rounded-lg px-3 py-2 group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] text-[#7d8590] font-mono">{e.timestamp}</span>
                    </div>
                    <p className="text-xs text-[#e6edf3] font-mono truncate" title={e.sql}>{e.sql}</p>
                  </div>
                ))}
              </div>
            )}
          </>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#30363d] flex items-center justify-end gap-2.5">
          {activeTab === "audit" && <span className="text-[10px] text-[#7d8590] mr-auto">Last 200 entries</span>}
          {saved && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>}
          <button onClick={onClose} className="text-xs text-[#7d8590] hover:text-[#e6edf3] px-3 py-1.5 rounded-lg hover:bg-[#292e36] transition-colors">
            Cancel
          </button>
          {activeTab !== "audit" && (
            <button onClick={handleSave} disabled={saving}
              className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
              {saving && <Loader2 size={11} className="animate-spin" />}
              Save settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
