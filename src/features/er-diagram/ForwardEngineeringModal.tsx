import { useState, useEffect } from "react";
import { X, Play, Copy, Check, Info, AlertTriangle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { useErStore } from "./erStore";
import { generateDiff, generateSql, generateMongooseCode, generatePrismaCode } from "./ddlGenerator";
import { Button } from "../../shared/ui/Button";
import { useTranslation } from "../../hooks/useTranslation";

interface ForwardEngineeringModalProps {
  onClose: () => void;
}

export function ForwardEngineeringModal({ onClose }: ForwardEngineeringModalProps) {
  const { t } = useTranslation();
  const { initialSchema, currentSchema, dbType, connectionId, loadSchema } = useErStore();
  const [activeTab, setActiveTab] = useState<"sql" | "mongoose" | "prisma">("sql");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const diff = generateDiff(initialSchema, currentSchema);
  const isMongo = dbType === "mongodb";

  // Auto select correct tab and generate content
  useEffect(() => {
    if (isMongo) {
      setActiveTab("mongoose");
    } else {
      setActiveTab("sql");
    }
  }, [isMongo]);

  useEffect(() => {
    if (isMongo) {
      if (activeTab === "mongoose" && currentSchema) {
        setCode(generateMongooseCode(currentSchema));
      } else if (activeTab === "prisma" && currentSchema) {
        setCode(generatePrismaCode(currentSchema, "mongodb"));
      }
    } else {
      if (activeTab === "sql") {
        setCode(generateSql(diff, dbType as "postgres" | "mysql"));
      } else if (activeTab === "prisma" && currentSchema) {
        setCode(generatePrismaCode(currentSchema, dbType as "postgres" | "mysql"));
      }
    }
  }, [activeTab, currentSchema, dbType, isMongo]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Clipboard copy failed");
    }
  };

  const handleExecute = async () => {
    if (!connectionId || isMongo || executing) return;
    setExecuting(true);
    setError(null);
    setSuccess(null);

    try {
      // In a real database client, execute the raw SQL script
      await invoke("run_query", { connId: connectionId, sql: code });
      setSuccess(t("feSuccessMsg"));
      
      // Reload schema from database to sync current and initial states
      setTimeout(async () => {
        await loadSchema(connectionId, dbType!);
        setExecuting(false);
        onClose();
      }, 1500);
    } catch (e: any) {
      setError(e.message || t("feFailedMsg"));
      setExecuting(false);
    }
  };

  // Check if there are any visual differences
  const hasChanges =
    diff.tablesToCreate.length > 0 ||
    diff.tablesToDrop.length > 0 ||
    diff.tablesToAlter.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 anim-fade">
      <div className="bg-surface border border-border w-[768px] h-[640px] max-w-[95vw] max-h-[90vh] rounded-xl shadow-2xl flex flex-col resize overflow-hidden min-w-[500px] min-h-[400px]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-border/80 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-fg">{t("feDesignerTitle")}</h3>
            <p className="text-[10px] text-muted">{t("feDesignerDesc")}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-fg hover:bg-hover p-1 rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Headers */}
        <div className="flex items-center justify-between px-5 border-b border-border/50 shrink-0 bg-surface/50">
          <div className="flex items-center gap-1">
            {!isMongo && (
              <button
                onClick={() => setActiveTab("sql")}
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === "sql" ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {t("feTabSql")}
              </button>
            )}
            {isMongo && (
              <button
                onClick={() => setActiveTab("mongoose")}
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === "mongoose" ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {t("feTabMongoose")}
              </button>
            )}
            <button
              onClick={() => setActiveTab("prisma")}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "prisma" ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {t("feTabPrisma")}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleCopy}
              size="sm"
              variant="subtle"
              className="!py-1 !px-2.5 flex items-center gap-1.5 text-[10px] h-auto"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-500" /> {t("feCopied")}
                </>
              ) : (
                <>
                  <Copy size={14} /> {t("feCopyCode")}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Summary Panel */}
          {!isMongo && activeTab === "sql" && (
            <div className="p-3 bg-surface/50 border border-border rounded-lg text-xs space-y-1.5 shrink-0">
              <h4 className="font-semibold text-fg flex items-center gap-1.5">
                <Info size={16} className="text-accent" /> {t("feDiffTitle")}
              </h4>
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[10px]">
                <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/10 text-emerald-400">
                  + {t("feDiffCreate")}: {diff.tablesToCreate.length} {t("feTablesCount")}
                </div>
                <div className="p-1.5 rounded bg-red-500/5 border border-red-500/10 text-red-400">
                  - {t("feDiffDrop")}: {diff.tablesToDrop.length} {t("feTablesCount")}
                </div>
                <div className="p-1.5 rounded bg-blue-500/5 border border-blue-500/10 text-blue-400">
                  ~ {t("feDiffAlter")}: {diff.tablesToAlter.length} {t("feTablesCount")}
                </div>
              </div>
            </div>
          )}

          {/* Code Viewer */}
          <div className="rounded-lg overflow-hidden border border-border flex-1 min-h-[240px] text-[11px] font-mono shadow-inner">
            <CodeMirror
              value={code}
              theme={oneDark}
              extensions={[sql()]}
              readOnly={true}
              height="100%"
              style={{ fontSize: "11px" }}
            />
          </div>

          {/* Feedback Blocks */}
          {error && (
            <div className="p-3 border border-red-500/20 bg-red-500/5 text-red-400 text-xs rounded-lg flex items-center gap-2 shrink-0">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs rounded-lg flex items-center gap-2 shrink-0">
              <Check size={16} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Safe Alert warning for SQL execution */}
          {!isMongo && activeTab === "sql" && hasChanges && !success && (
            <div className="p-3 border border-yellow-500/20 bg-yellow-500/5 text-yellow-500/80 text-[10px] rounded-lg flex items-start gap-2.5 leading-relaxed shrink-0">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-yellow-500">{t("feCaution")}:</span> {t("feCautionDesc")}
              </div>
            </div>
          )}

          {!isMongo && activeTab === "sql" && !hasChanges && (
            <div className="p-6 border border-dashed border-border rounded-lg text-center text-muted text-xs bg-surface/30">
              {t("feNoChanges")}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-border/80 bg-surface/80 flex items-center justify-between shrink-0">
          <Button
            onClick={onClose}
            variant="subtle"
            className="text-xs"
            disabled={executing}
          >
            {t("cancelButton")}
          </Button>

          <div className="flex items-center gap-2">
            {!isMongo && activeTab === "sql" && hasChanges && (
              <Button
                onClick={handleExecute}
                className="text-xs flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white"
                disabled={executing || !!success}
              >
                {executing ? (
                  <>{t("feMigrating")}</>
                ) : (
                  <>
                    <Play size={14} fill="currentColor" /> {t("feExecuteBtn")}
                  </>
                )}
              </Button>
            )}
            {isMongo && (
              <span className="text-[10px] text-muted pr-2">
                {t("feMongoGeneratedDesc")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
