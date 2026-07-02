import { useState } from "react";
import { X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { ConnectionConfig, DbType } from "../../shared/types";
import { DEFAULT_PORTS } from "../../shared/types";
import { saveConnection, connectConnection, testConnection } from "./connectionApi";
import { useConnectionStore } from "./connectionStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { ENGINE_META } from "./engineMeta";

interface ConnectionDialogShellProps {
  onClose: () => void;
  initial?: ConnectionConfig;
}

const ENGINE_IDS: DbType[] = ["postgres", "mysql", "mongodb"];

type TestState = "idle" | "testing" | "ok" | "fail";

const labelCls = "block text-[11px] font-medium text-muted mb-1.5";

function makeNew(): ConnectionConfig {
  return {
    id: crypto.randomUUID(), name: "", db_type: "postgres",
    host: "localhost", port: DEFAULT_PORTS.postgres,
    database: "", username: "", password: "",
    connection_string: "mongodb://localhost:27017",
  };
}

export function ConnectionDialogShell({ onClose, initial }: ConnectionDialogShellProps) {
  const { upsertSavedConnection, addActiveConnection, setActiveConnectionId } = useConnectionStore();
  const [form, setForm] = useState<ConnectionConfig>(initial ?? makeNew());
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patch = (f: Partial<ConnectionConfig>) => setForm((p) => ({ ...p, ...f }));
  const isMongo = form.db_type === "mongodb";

  const handleEngine = (db_type: DbType) => {
    patch(db_type === "mongodb" ? { db_type } : { db_type, port: DEFAULT_PORTS[db_type] });
    setTestState("idle");
  };

  const handleTest = async () => {
    setTestState("testing"); setTestError("");
    try { await testConnection(form); setTestState("ok"); }
    catch (e) { setTestState("fail"); setTestError(String(e)); }
  };

  const handleSubmit = async () => {
    setError(""); setSaving(true);
    try {
      const saved = await saveConnection(form);
      upsertSavedConnection(saved);
      const meta = await connectConnection(saved);
      addActiveConnection(meta);
      setActiveConnectionId(meta.id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50 p-4 anim-fade">
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] anim-pop w-[500px] shadow-lg overflow-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-[15px] text-fg">{initial ? "Edit Connection" : "New Connection"}</h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-[var(--radius-md)] text-muted hover:text-fg hover:bg-hover transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className={labelCls}>Database Type</label>
            <div className="grid grid-cols-3 gap-2">
              {ENGINE_IDS.map((id) => {
                const meta = ENGINE_META[id];
                const Icon = meta.icon;
                const selected = form.db_type === id;
                return (
                  <button key={id} type="button" onClick={() => handleEngine(id)}
                    className={`flex flex-col items-center gap-2 py-3.5 rounded-[var(--radius-md)] border-2 transition-all ${
                      selected
                        ? `${meta.border} ${meta.bg}`
                        : "border-border bg-transparent hover:border-accent/40 hover:bg-hover"
                    }`}>
                    <Icon size={20} className={selected ? meta.color : "text-muted"} />
                    <div className="text-center leading-tight">
                      <div className={`text-[11px] font-semibold ${selected ? "text-fg" : "text-muted"}`}>{meta.label}</div>
                      <div className={`text-[9px] mt-0.5 ${selected ? "text-muted" : "text-muted/70"}`}>{meta.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={labelCls}>Name</label>
            <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="My connection" />
          </div>

          {isMongo ? (
            <div>
              <label className={labelCls}>Connection String</label>
              <Input value={form.connection_string} onChange={(e) => patch({ connection_string: e.target.value })} />
              <p className="mt-1.5 text-[11px] text-muted">Supports replica sets, TLS, SRV, and auth options</p>
              <label className={`${labelCls} mt-3`}>Database</label>
              <Input value={form.database} onChange={(e) => patch({ database: e.target.value })} placeholder="test" />
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Host</label>
                  <Input value={form.host} onChange={(e) => patch({ host: e.target.value })} />
                </div>
                <div className="w-24">
                  <label className={labelCls}>Port</label>
                  <Input type="number" value={form.port} onChange={(e) => patch({ port: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Database</label>
                <Input value={form.database} onChange={(e) => patch({ database: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Username</label>
                  <Input value={form.username} onChange={(e) => patch({ username: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Password</label>
                  <Input type="password" value={form.password} onChange={(e) => patch({ password: e.target.value })} />
                </div>
              </div>
            </>
          )}

          {testState === "ok" && (
            <div className="flex items-center gap-2 text-xs text-ok bg-ok/10 border border-ok/20 rounded-[var(--radius-md)] px-3 py-2">
              <CheckCircle2 size={13} className="shrink-0" /> Connected successfully
            </div>
          )}
          {testState === "fail" && (
            <div className="flex items-start gap-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-[var(--radius-md)] px-3 py-2">
              <XCircle size={13} className="mt-0.5 shrink-0" /><span className="break-words">{testError}</span>
            </div>
          )}
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-[var(--radius-md)] px-3 py-2 break-words">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <Button variant="subtle" size="sm" onClick={handleTest} disabled={testState === "testing"}>
            {testState === "testing" ? <Loader2 size={12} className="animate-spin" /> : null}
            Test Connection
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              Save & Connect
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
