import { useState } from "react";
import { X, Download, AlertTriangle, FolderOpen } from "lucide-react";
import { Button } from "../../shared/ui/Button";
import { save as nativeSave } from "@tauri-apps/plugin-dialog";
import { useToast } from "../../components/Toast";
import { switchMongoDb } from "./schemaApi";
import { invoke } from "@tauri-apps/api/core";
import { useBackupStore } from "../../stores/backupStore";
import { useTranslation } from "../../hooks/useTranslation";

interface Props {
  connId: string;
  dbName?: string;
  engine: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BackupModal({ connId, dbName, engine, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const ext = engine === "mongodb" ? "json" : "sql";
  const defaultFileName = dbName ? `${dbName}_backup.${ext}` : `backup.${ext}`;
  const [filePath, setFilePath] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();
  const addJob = useBackupStore((s) => s.addJob);

  const handleBrowse = async () => {
    try {
      setError("");
      const selected = await nativeSave({
        defaultPath: defaultFileName,
        filters: [
          { name: "Backup File", extensions: [ext] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (selected) {
        setFilePath(selected);
      }
    } catch (e) {
      setError(`${t("failedSaveDialog")}: ${e}`);
    }
  };

  const handleStartBackup = async () => {
    if (!filePath.trim()) {
      setError(t("errorSelectSavePath"));
      return;
    }
    setError("");
    try {
      // For MongoDB and Postgres, if a dbName is provided, switch to it first
      if ((engine === "mongodb" || engine === "postgres") && dbName) {
        await switchMongoDb(connId, dbName);
      }
      
      const backupId = await invoke<string>("start_database_backup", {
        connId,
        outputPath: filePath.trim(),
      });

      addJob({
        id: backupId,
        connId,
        dbName,
        outputPath: filePath.trim(),
        status: "running",
        startTime: Date.now(),
      });

      toast(t("backupStartedSuccess"), "success");
      onSuccess();
      onClose();
    } catch (e) {
      setError(String(e));
      toast(`${t("backupStartFailed")}: ${e}`, "error");
    }
  };

  const labelCls = "block text-xs font-bold tracking-wider text-muted uppercase";
  const inputCls = "w-full px-3 py-2 text-xs bg-surface border border-border rounded-[var(--radius-sm)] text-fg placeholder:text-faint outline-none focus:border-accent transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-fade-in">
      <div className="w-[480px] h-[380px] max-h-[90vh] bg-surface border border-border rounded-[var(--radius-lg)] shadow-2xl flex flex-col anim-slide-up resize overflow-hidden min-w-[360px] min-h-[250px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-fg">
            {dbName ? `${t("backupTitleDb")}: ${dbName}` : t("backupTitleConn")}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-muted hover:text-fg hover:bg-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {error && (
            <div className="flex gap-2 p-2.5 bg-danger/10 border border-danger/20 rounded-[var(--radius-md)] text-xs text-danger">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className={labelCls}>{t("dbTypeLabel")}</label>
            <div className="text-xs text-muted font-semibold bg-elevated border border-border px-3 py-2 rounded-[var(--radius-sm)] capitalize">
              {engine}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>{t("savePathDestinationLabel")}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder={`e.g. /path/to/${defaultFileName}`}
                className={`${inputCls} flex-1`}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBrowse}
                className="shrink-0 border border-border h-9"
              >
                <FolderOpen size={16} className="mr-1.5 text-muted" />
                {t("browseBtn")}
              </Button>
            </div>
            <p className="text-xs text-muted">
              {t("chooseSavePathDesc")} (extension: <code className="font-mono text-accent">.{ext}</code>).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("cancelButton")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleStartBackup}
            disabled={!filePath.trim()}
          >
            <Download size={15} className="mr-1" />
            {t("startBackupBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
