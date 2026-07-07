import { X, Loader2, CheckCircle2, AlertCircle, Trash2, Globe } from "lucide-react";
import { Button } from "../../shared/ui/Button";
import { useBackupStore } from "../../stores/backupStore";

interface Props {
  onClose: () => void;
}

export function BackupJobsModal({ onClose }: Props) {
  const { jobs, clearHistory } = useBackupStore();

  const getFileName = (path: string) => {
    return path.split(/[/\\]/).pop() || path;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 size={16} className="animate-spin text-accent" />;
      case "completed":
        return <CheckCircle2 size={16} className="text-success" />;
      case "failed":
        return <AlertCircle size={16} className="text-danger" />;
      default:
        return null;
    }
  };

  const labelCls = "block text-[10px] font-bold tracking-wider text-muted uppercase";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-fade-in">
      <div className="w-[580px] max-h-[80vh] bg-surface border border-border rounded-[var(--radius-lg)] shadow-2xl flex flex-col anim-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg">Backup Tasks Manager</span>
            {jobs.some((j) => j.status === "running") && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[9px] font-bold text-accent animate-pulse uppercase">
                Active Tasks
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-muted hover:text-fg hover:bg-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto min-h-[300px] flex flex-col">
          {jobs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Globe size={32} className="text-muted/40 mb-3" />
              <p className="text-xs text-muted font-medium">No backup tasks recorded yet</p>
              <p className="text-[10px] text-faint mt-1 max-w-[280px]">
                Start a backup from any database connection or schema tree node to track its background progress here.
              </p>
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              <div className="flex justify-between items-center pb-1">
                <label className={labelCls}>Tasks History</label>
                {jobs.some((j) => j.status !== "running") && (
                  <button
                    onClick={clearHistory}
                    className="text-[10px] text-muted hover:text-danger flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 size={11} />
                    <span>Clear completed</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 border border-border/80 rounded-[var(--radius-md)] bg-elevated/40 hover:bg-elevated flex items-start justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-fg font-semibold truncate block">
                          {getFileName(job.outputPath)}
                        </span>
                        <span className="text-[9px] text-faint font-medium">
                          {new Date(job.startTime).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted flex items-center gap-1.5 flex-wrap">
                        <span className="text-accent font-medium">
                          {job.dbName ? `DB: ${job.dbName}` : "Connection"}
                        </span>
                        <span className="text-faint">•</span>
                        <span className="truncate max-w-[280px]" title={job.outputPath}>
                          Path: {job.outputPath}
                        </span>
                      </div>
                      {job.error && (
                        <div className="text-[10px] text-danger font-medium pt-1">
                          Error: {job.error}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center pt-0.5">
                      <div
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] border text-[10px] font-medium capitalize ${
                          job.status === "running"
                            ? "bg-accent/5 border-accent/10 text-accent"
                            : job.status === "completed"
                            ? "bg-success/5 border-success/10 text-success"
                            : "bg-danger/5 border-danger/10 text-danger"
                        }`}
                      >
                        {getStatusIcon(job.status)}
                        <span>{job.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
