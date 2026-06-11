import { statusTone } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusPill({
  label,
  status,
  className
}: {
  label: string;
  status: string;
  className?: string;
}) {
  return <span className={cn("status", `status-${statusTone(status as never)}`, className)}>{label}</span>;
}
