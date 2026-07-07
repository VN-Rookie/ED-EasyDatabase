import { useBackupStore } from "../../stores/backupStore";
import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, AlertCircle, X, ExternalLink } from "lucide-react";
import { BackupJobsModal } from "./BackupJobsModal";

export function BackupProgressWidget() {
  const jobs = useBackupStore((s) => s.jobs);
  const runningJobs = jobs.filter((j) => j.status === "running");
  
  const [showManager, setShowManager] = useState(false);
  const [visible, setVisible] = useState(false);
  const [latestJob, setLatestJob] = useState<any>(null);

  // Auto-show/hide widget based on active jobs or recently completed/failed jobs
  useEffect(() => {
    if (jobs.length === 0) {
      setVisible(false);
      return;
    }

    const latest = jobs[0]; // jobs are sorted latest-first in store
    setLatestJob(latest);

    if (runningJobs.length > 0) {
      setVisible(true);
    } else if (latest.status === "completed" || latest.status === "failed") {
      // Show for recently completed/failed tasks
      setVisible(true);
      // Auto-hide after 5 seconds if completed
      if (latest.status === "completed") {
        const timer = setTimeout(() => {
          setVisible(false);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [jobs, runningJobs.length]);

  if (!visible || !latestJob) return null;

  const getFileName = (path: string) => {
    return path.split(/[/\\]/).pop() || path;
  };

  return (
    <>
      <div
        onClick={() => setShowManager(true)}
        className="fixed bottom-10 right-4 z-40 max-w-[320px] bg-surface/90 backdrop-blur border border-border rounded-[var(--radius-md)] shadow-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-accent/40 hover:bg-surface transition-all duration-[var(--dur-fast)] anim-slide-up"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {latestJob.status === "running" ? (
            <Loader2 size={14} className="animate-spin text-accent shrink-0" />
          ) : latestJob.status === "completed" ? (
            <CheckCircle2 size={14} className="text-success shrink-0" />
          ) : (
            <AlertCircle size={14} className="text-danger shrink-0" />
          )}

          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-fg truncate">
              {latestJob.status === "running"
                ? "Backing up database..."
                : latestJob.status === "completed"
                ? "Backup Completed!"
                : "Backup Failed!"}
            </div>
            <div className="text-[9px] text-muted truncate">
              {getFileName(latestJob.outputPath)}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowManager(true);
            }}
            title="Open backups manager"
            className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setVisible(false);
            }}
            title="Dismiss"
            className="p-1 rounded text-muted hover:text-danger hover:bg-hover transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {showManager && <BackupJobsModal onClose={() => setShowManager(false)} />}
    </>
  );
}
