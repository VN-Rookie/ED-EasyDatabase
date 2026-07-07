import { Database, Layers } from "lucide-react";
import type { DbType } from "../../shared/types";

export interface EngineMeta {
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  border: string;
  bg: string;
}

export const ENGINE_META: Record<DbType, EngineMeta> = {
  postgres: {
    label: "PostgreSQL",
    desc: "Relational",
    icon: Database,
    color: "text-sky-400",
    border: "border-sky-500/50",
    bg: "bg-sky-500/10",
  },
  mysql: {
    label: "MySQL",
    desc: "Relational",
    icon: Database,
    color: "text-orange-400",
    border: "border-orange-500/50",
    bg: "bg-orange-500/10",
  },
  mongodb: {
    label: "MongoDB",
    desc: "Document DB",
    icon: Layers,
    color: "text-emerald-400",
    border: "border-emerald-500/50",
    bg: "bg-emerald-500/10",
  },
  redis: {
    label: "Redis",
    desc: "Key-Value Store",
    icon: Database,
    color: "text-red-400",
    border: "border-red-500/50",
    bg: "bg-red-500/10",
  },
};
