import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";

export interface BackupJob {
  id: string;
  connId: string;
  dbName?: string;
  outputPath: string;
  status: "running" | "completed" | "failed";
  error?: string;
  startTime: number;
}

interface BackupState {
  jobs: BackupJob[];
  addJob: (job: BackupJob) => void;
  updateJob: (id: string, status: string, error?: string) => void;
  clearHistory: () => void;
}

export const useBackupStore = create<BackupState>((set) => ({
  jobs: [],
  addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),
  updateJob: (id, status, error) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id
          ? {
              ...job,
              status: status as any,
              error,
            }
          : job
      ),
    })),
  clearHistory: () => set((state) => ({ jobs: state.jobs.filter((j) => j.status === "running") })),
}));

// Automatically listen to backend events to update jobs status
listen<{ id: string; status: string; error?: string }>("backup-status", (event) => {
  const { id, status, error } = event.payload;
  useBackupStore.getState().updateJob(id, status, error);
}).catch((e) => console.error("Failed to listen to backup-status events:", e));
