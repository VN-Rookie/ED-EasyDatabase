import { useState } from "react";
import { X, Download, AlertTriangle, FolderOpen } from "lucide-react";
import { Button } from "../../shared/ui/Button";
import { save as nativeSave } from "@tauri-apps/plugin-dialog";
import { useToast } from "../../components/Toast";
import { switchMongoDb } from "./schemaApi";
import { invoke } from "@tauri-apps/api/core";
import { useBackupStore } from "../../stores/backupStore";

interface Props {
  connId: string;
  dbName?: string;
  engine: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BackupModal({ connId, dbName, engine, onClose, onSuccess }: Props) {
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
      setError(`Failed to open save dialog: ${e}`);
    }
  };

  const handleStartBackup = async () => {
    if (!filePath.trim()) {
      setError("Please select or enter a save file path");
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

      toast(`Backup started in the background`, "success");
      onSuccess();
      onClose();
    } catch (e) {
      setError(String(e));
      toast(`Backup failed to start: ${e}`, "error");
    }
  };

  const labelCls = "block text-[10px] font-bold tracking-wider text-muted uppercase";
  const inputCls = "w-full px-3 py-2 text-xs bg-surface border border-border rounded-[var(--radius-sm)] text-fg placeholder:text-faint outline-none focus:border-accent transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-fade-in">
      <div className="w-[480px] bg-surface border border-border rounded-[var(--radius-lg)] shadow-2xl flex flex-col anim-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-fg">
            Backup {dbName ? `Database: ${dbName}` : "Connection"}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-muted hover:text-fg hover:bg-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex gap-2 p-2.5 bg-danger/10 border border-danger/20 rounded-[var(--radius-md)] text-xs text-danger">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className={labelCls}>Database Type</label>
            <div className="text-xs text-muted font-semibold bg-elevated border border-border px-3 py-2 rounded-[var(--radius-sm)] capitalize">
              {engine}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Save Path Destination</label>
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
                <FolderOpen size={14} className="mr-1.5 text-muted" />
                Browse
              </Button>
            </div>
            <p className="text-[10px] text-muted">
              Choose where to save the logical backup file (extension: <code className="font-mono text-accent">.{ext}</code>).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleStartBackup}
            disabled={!filePath.trim()}
          >
            <Download size={12} className="mr-1" />
            Start Backup
          </Button>
        </div>
      </div>
    </div>
  );
}
