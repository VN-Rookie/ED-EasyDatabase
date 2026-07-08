import { useState } from "react";
import { X, Loader2, Sparkles, AlertTriangle, Play } from "lucide-react";
import { getRefactorPreview, executeRefactor, type DependencyInfo } from "./schemaApi";
import { useToast } from "../../components/Toast";
import { useTranslation } from "../../hooks/useTranslation";

interface RefactorModalProps {
  connId: string;
  table: string;
  column: string | null; // null if refactoring table
  oldName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RefactorModal({
  connId,
  table,
  column,
  oldName,
  onClose,
  onSuccess,
}: RefactorModalProps) {
  const { t } = useTranslation();
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [dependencies, setDependencies] = useState<DependencyInfo[]>([]);
  const [ddl, setDdl] = useState("");
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const { toast } = useToast();

  const isColumn = column !== null;

  const handlePreview = async () => {
    if (!newName.trim() || newName.trim() === oldName) {
      toast(t("toastEnterDifferentName"), "info");
      return;
    }
    setLoading(true);
    try {
      const preview = await getRefactorPreview(connId, table, column, newName.trim());
      setDependencies(preview.dependencies);
      setDdl(preview.generated_ddl);
      setPreviewLoaded(true);
    } catch (e) {
      toast(`${t("toastRefactorPreviewFailed")}: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!ddl.trim()) return;
    setExecuting(true);
    try {
      await executeRefactor(connId, ddl);
      toast(
        isColumn
          ? t("toastRefactorSuccessColumn")
          : t("toastRefactorSuccessTable"),
        "success"
      );
      onSuccess();
      onClose();
    } catch (e) {
      toast(`${t("toastRefactorExecutionFailed")}: ${e}`, "error");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-[var(--radius-md)] shadow-xl flex flex-col resize overflow-hidden min-w-[650px] max-w-[850px] min-h-[500px] max-h-[750px] w-full h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-fg">
              {t("refactorRenameTitle")}: {isColumn ? `${t("columnLabel")} ${table}.${column}` : `${t("tableLabel")} ${table}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-fg rounded p-1 hover:bg-hover transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-4 shrink-0 bg-elevated/40 border border-border/60 rounded p-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted font-semibold uppercase tracking-wider">{t("oldNameLabel")}</span>
              <input
                disabled
                value={oldName}
                className="bg-surface border border-border/60 rounded-[var(--radius-sm)] text-xs text-muted px-2.5 py-1.5 focus:outline-none opacity-60"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted font-semibold uppercase tracking-wider">{t("newNameLabel")}</span>
              <div className="flex gap-2">
                <input
                  autoFocus
                  placeholder={t("enterNewNamePlaceholder")}
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setPreviewLoaded(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handlePreview();
                    }
                  }}
                  className="flex-1 bg-surface border border-border rounded-[var(--radius-sm)] text-xs text-fg px-2.5 py-1.5 focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handlePreview}
                  disabled={loading || !newName.trim() || newName.trim() === oldName}
                  className="px-3 py-1.5 bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50 text-xs font-semibold rounded-[var(--radius-sm)] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {loading && <Loader2 size={12} className="animate-spin" />}
                  {t("previewBtn")}
                </button>
              </div>
            </div>
          </div>

          {/* Warning banner */}
          <div className="flex gap-2 bg-warn/10 border border-warn/25 rounded p-3 shrink-0">
            <AlertTriangle size={15} className="text-warn shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-fg">{t("refactorSafetyAlertTitle")}</span>
              <p className="text-[11px] text-muted leading-relaxed">
                {t("refactorSafetyAlertDesc")}
              </p>
            </div>
          </div>

          {/* Tab / Results Area */}
          {previewLoaded && (
            <div className="flex-1 flex flex-col min-h-0 gap-3">
              {/* Dependencies List */}
              <div className="flex-1 border border-border rounded overflow-hidden flex flex-col min-h-[120px]">
                <div className="bg-elevated px-3 py-1.5 border-b border-border shrink-0 flex items-center justify-between">
                  <span className="text-[10px] text-muted font-bold uppercase tracking-wider">
                    {t("affectedDependenciesLabel")} ({dependencies.length})
                  </span>
                </div>
                <div className="flex-1 overflow-auto bg-surface/50">
                  {dependencies.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-faint italic">
                      {t("noDependenciesFound")}
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-elevated/40">
                          <th className="px-3 py-1.5 text-[9px] font-bold text-muted uppercase">{t("typeCol")}</th>
                          <th className="px-3 py-1.5 text-[9px] font-bold text-muted uppercase">{t("objectNameCol")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dependencies.map((dep, idx) => (
                          <tr key={idx} className="border-b border-border/40 hover:bg-hover">
                            <td className="px-3 py-2 text-xs font-semibold text-accent">{dep.object_type}</td>
                            <td className="px-3 py-2 text-xs font-mono text-fg">{dep.object_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* SQL Preview Box */}
              <div className="flex-1 border border-border rounded overflow-hidden flex flex-col min-h-[150px]">
                <div className="bg-elevated px-3 py-1.5 border-b border-border shrink-0 flex items-center justify-between">
                  <span className="text-[10px] text-muted font-bold uppercase tracking-wider">
                    {t("refactoringSqlScriptLabel")}
                  </span>
                </div>
                <textarea
                  value={ddl}
                  onChange={(e) => setDdl(e.target.value)}
                  className="flex-1 p-3 bg-surface text-xs font-mono text-fg/90 border-0 outline-none resize-none overflow-auto whitespace-pre leading-relaxed"
                  spellCheck={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-surface shrink-0 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-border text-xs font-semibold text-muted hover:text-fg hover:bg-hover rounded-[var(--radius-sm)] transition-colors cursor-pointer"
          >
            {t("cancelButton")}
          </button>
          <button
            onClick={handleExecute}
            disabled={executing || !previewLoaded || !ddl.trim()}
            className="px-4 py-1.5 bg-warn text-fg hover:bg-warn-strong disabled:opacity-50 text-xs font-semibold rounded-[var(--radius-sm)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {executing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {t("executeRefactoringBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
