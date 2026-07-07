import { invoke } from "@tauri-apps/api/core";
import type { AuditEntry } from "../../shared/types";

export const getAuditLog = (limit?: number) =>
  invoke<AuditEntry[]>("get_audit_log", { limit });

export const exportAuditLog = () =>
  invoke<string>("export_audit_log");
