import { Loader2 } from "lucide-react";

export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-muted ${className}`} />;
}
