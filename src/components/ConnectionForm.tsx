import { useState } from "react";
import { X, Loader2, CheckCircle2, XCircle, Database, Layers } from "lucide-react";
import type { ConnectionConfig, DbType } from "../types";
import { DEFAULT_PORTS } from "../types";
import { useConnections } from "../hooks/useConnections";

interface Props { initial?: ConnectionConfig; onClose: () => void; }

const DB_TYPES: {
  value: DbType; label: string; desc: string;
  icon: React.ElementType; color: string; border: string; bg: string;
}[] = [
  { value: "postgres", label: "PostgreSQL", desc: "Relational",  icon: Database, color: "text-sky-400",     border: "border-sky-500/50",     bg: "bg-sky-500/10"     },
  { value: "mysql",    label: "MySQL",      desc: "Relational",  icon: Database, color: "text-orange-400",  border: "border-orange-500/50",  bg: "bg-orange-500/10"  },
  { value: "mongodb",  label: "MongoDB",    desc: "Document DB", icon: Layers,   color: "text-emerald-400", border: "border-emerald-500/50", bg: "bg-emerald-500/10" },
];

type TestState = "idle" | "testing" | "ok" | "fail";

function makeNew(): ConnectionConfig {
  return {
    id: crypto.randomUUID(), name: "", db_type: "postgres",
    host: "localhost", port: DEFAULT_PORTS.postgres,
    database: "", username: "", password: "",
    connection_string: "mongodb://localhost:27017",
  };
}

export function ConnectionForm({ initial, onClose }: Props) {
  const { save, connect, testConnection } = useConnections();
  const [form, setForm]           = useState<ConnectionConfig>(initial ?? makeNew());
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const patch = (f: Partial<ConnectionConfig>) => setForm(p => ({ ...p, ...f }));

  const handleDbType = (db_type: DbType) => {
    patch(db_type === "mongodb" ? { db_type } : { db_type, port: DEFAULT_PORTS[db_type] });
    setTestState("idle");
  };

  const handleTest = async () => {
    setTestState("testing"); setTestError("");
    try { await testConnection(form); setTestState("ok"); }
    catch (e) { setTestState("fail"); setTestError(String(e)); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    try { const saved = await save(form); await connect(saved); onClose(); }
    catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  const isMongo = form.db_type === "mongodb";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-[500px] shadow-2xl shadow-black/60 overflow-auto max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d]">
          <h2 className="font-semibold text-[15px] text-[#e6edf3]">
            {initial ? "Edit Connection" : "New Connection"}
          </h2>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#292e36] transition-all">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* DB Type icon cards (UI-6) */}
          <div>
            <label className={labelCls}>Database Type</label>
            <div className="grid grid-cols-3 gap-2">
              {DB_TYPES.map(t => {
                const sel = form.db_type === t.value;
                const Icon = t.icon;
                return (
                  <button key={t.value} type="button" onClick={() => handleDbType(t.value)}
                    className={`flex flex-col items-center gap-2 py-3.5 rounded-xl border-2 transition-all ${
                      sel
                        ? `${t.border} ${t.bg}`
                        : "border-[#30363d] bg-[#0d1117]/50 hover:border-[#484f58] hover:bg-[#292e36]"
                    }`}>
                    <Icon size={20} className={sel ? t.color : "text-[#484f58]"} />
                    <div className="text-center leading-tight">
                      <div className={`text-[11px] font-semibold ${sel ? "text-[#e6edf3]" : "text-[#7d8590]"}`}>{t.label}</div>
                      <div className={`text-[9px] mt-0.5 ${sel ? "text-[#7d8590]" : "text-[#484f58]"}`}>{t.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <Field label="Name">
            <input required value={form.name} onChange={e => patch({ name: e.target.value })}
              placeholder={isMongo ? "Local MongoDB" : "Local Postgres"}
              className={inputCls} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
          </Field>

          {/* MongoDB fields */}
          {isMongo ? (
            <>
              <Field label="Connection String">
                <input required value={form.connection_string}
                  onChange={e => patch({ connection_string: e.target.value })}
                  placeholder="mongodb://localhost:27017"
                  className={`${inputCls} font-mono text-[12px]`} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                <p className="mt-1.5 text-[11px] text-[#7d8590]">Supports replica sets, TLS, SRV, and auth options</p>
              </Field>
              <Field label="Default Database (optional)">
                <input value={form.database} onChange={e => patch({ database: e.target.value })}
                  placeholder="leave blank to browse all databases"
                  className={inputCls} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
              </Field>
            </>
          ) : (
            <>
              <div className="flex gap-3">
                <Field label="Host" className="flex-1">
                  <input required value={form.host} onChange={e => patch({ host: e.target.value })}
                    placeholder="localhost" className={inputCls} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                </Field>
                <Field label="Port" className="w-24">
                  <input required type="number" value={form.port}
                    onChange={e => patch({ port: Number(e.target.value) })}
                    className={inputCls} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                </Field>
              </div>
              <Field label="Database">
                <input required value={form.database} onChange={e => patch({ database: e.target.value })}
                  placeholder="myapp" className={inputCls} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
              </Field>
              <div className="flex gap-3">
                <Field label="Username" className="flex-1">
                  <input value={form.username} onChange={e => patch({ username: e.target.value })}
                    placeholder="postgres" className={inputCls} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                </Field>
                <Field label="Password" className="flex-1">
                  <input type="password" value={form.password}
                    onChange={e => patch({ password: e.target.value })}
                    placeholder="••••••••" className={inputCls} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                </Field>
              </div>
            </>
          )}

          {/* Test result banners */}
          {testState === "ok" && (
            <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
              <CheckCircle2 size={13} className="shrink-0" /> Connected successfully
            </div>
          )}
          {testState === "fail" && (
            <div className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              <XCircle size={13} className="mt-0.5 shrink-0" />
              <span className="break-words">{testError}</span>
            </div>
          )}
          {error && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</div>
          )}

          {/* Footer */}
          <div className="flex justify-between pt-1 border-t border-[#21262d] mt-2">
            <button type="button" onClick={handleTest} disabled={testState === "testing"}
              className="flex items-center gap-1.5 text-xs text-[#e6edf3] hover:text-white bg-[#21262d] hover:bg-[#292e36] border border-[#30363d] hover:border-white/[0.18] rounded-xl px-4 py-2 transition-all disabled:opacity-50">
              {testState === "testing"
                ? <Loader2 size={12} className="animate-spin" />
                : null}
              Test Connection
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="text-xs text-[#7d8590] hover:text-[#e6edf3] px-4 py-2 rounded-xl hover:bg-[#292e36] transition-all">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-1.5 text-xs text-white font-semibold rounded-xl px-5 py-2 transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 12px rgba(37,99,235,0.25)" }}>
                {saving && <Loader2 size={12} className="animate-spin" />}
                Save & Connect
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

const labelCls = "block text-[11px] font-medium text-[#7d8590] uppercase tracking-wider mb-1.5";
const inputCls  = "w-full bg-[#0d1117] border border-[#30363d] hover:border-[#484f58] focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] outline-none transition-all";
