import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { ConnectionConfig, DbType } from "../../shared/types";
import { DEFAULT_PORTS } from "../../shared/types";
import { saveConnection, connectConnection, testConnection } from "./connectionApi";
import { useConnectionStore } from "./connectionStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { ENGINE_META } from "./engineMeta";
import { useTranslation } from "../../hooks/useTranslation";

interface ConnectionDialogShellProps {
  onClose: () => void;
  initial?: ConnectionConfig;
}

const ENGINE_IDS: DbType[] = ["postgres", "mysql", "mongodb", "redis"];

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
  const { t } = useTranslation();
  const { upsertSavedConnection, addActiveConnection, setActiveConnectionId } = useConnectionStore();
  const [form, setForm] = useState<ConnectionConfig>(initial ?? makeNew());
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameInputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const patch = (f: Partial<ConnectionConfig>) => setForm((p) => ({ ...p, ...f }));
  const isMongo = form.db_type === "mongodb";
  const isRedis = form.db_type === "redis";
  const isValid = isMongo
    ? form.name.trim() !== "" && form.connection_string.trim() !== ""
    : isRedis
      ? form.name.trim() !== "" && form.host.trim() !== ""
      : form.name.trim() !== "" && form.host.trim() !== "" && form.database.trim() !== "" && form.username.trim() !== "";

  const handleEngine = (db_type: DbType) => {
    patch(
      db_type === "mongodb"
        ? { db_type }
        : { db_type, port: DEFAULT_PORTS[db_type], connection_string: "" }
    );
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
      <div
        className="bg-surface border border-border rounded-[var(--radius-lg)] anim-pop w-[500px] h-[620px] max-h-[90vh] shadow-lg flex flex-col resize overflow-hidden min-w-[400px] min-h-[400px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-[15px] text-fg">{initial ? t("editConnTitle") : t("newConnTitle")}</h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-[var(--radius-md)] text-muted hover:text-fg hover:bg-hover transition-all" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 flex-1 overflow-y-auto">
          <div>
            <label className={labelCls}>{t("dbTypeLabel")}</label>
            <div className="grid grid-cols-4 gap-2">
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
                    <Icon size={24} className={selected ? meta.color : "text-muted"} />
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
            <label className={labelCls}>{t("connNameLabel")}</label>
            <Input ref={nameInputRef} value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder={t("connNamePlaceholder")} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
          </div>

          {isMongo ? (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t("connStringLabel")}</label>
                <Input value={form.connection_string} onChange={(e) => patch({ connection_string: e.target.value })} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                <p className="mt-1.5 text-[11px] text-muted">{t("connStringDesc")}</p>
              </div>
              <div>
                <label className={labelCls}>{t("databaseLabel")}</label>
                <Input value={form.database} onChange={(e) => patch({ database: e.target.value })} placeholder={t("databasePlaceholder")} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>{t("hostLabel")}</label>
                  <Input value={form.host} onChange={(e) => patch({ host: e.target.value })} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                </div>
                <div className="w-24">
                  <label className={labelCls}>{t("portLabel")}</label>
                  <Input type="number" value={form.port} onChange={(e) => patch({ port: Number(e.target.value) })} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                </div>
              </div>
              <div>
                <label className={labelCls}>
                  {form.db_type === "redis" ? t("redisDbLabel") : t("databaseLabel")}
                </label>
                <Input
                  value={form.database}
                  onChange={(e) => patch({ database: e.target.value })}
                  placeholder={form.db_type === "redis" ? t("redisDbPlaceholder") : ""}
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>
                    {form.db_type === "redis" ? t("redisUserLabel") : t("userLabel")}
                  </label>
                  <Input value={form.username} onChange={(e) => patch({ username: e.target.value })} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>
                    {form.db_type === "redis" ? t("redisPassLabel") : t("passLabel")}
                  </label>
                  <Input type="password" value={form.password} onChange={(e) => patch({ password: e.target.value })} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                </div>
              </div>
            </>
          )}

          {testState === "ok" && (
            <div className="flex items-center gap-2 text-xs text-ok bg-ok/10 border border-ok/20 rounded-[var(--radius-md)] px-3 py-2">
              <CheckCircle2 size={16} className="shrink-0" /> {t("testSuccess")}
            </div>
          )}
          {testState === "fail" && (
            <div className="flex items-start gap-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-[var(--radius-md)] px-3 py-2">
              <XCircle size={16} className="mt-0.5 shrink-0" /><span className="break-words">{testError}</span>
            </div>
          )}
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-[var(--radius-md)] px-3 py-2 break-words">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <Button variant="subtle" size="sm" onClick={handleTest} disabled={testState === "testing"}>
            {testState === "testing" ? <Loader2 size={15} className="animate-spin" /> : null}
            {t("testConnBtn")}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>{t("cancelButton")}</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving || !isValid}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {t("saveConnectBtn")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
