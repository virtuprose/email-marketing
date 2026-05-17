import { statusTone } from "@/lib/status";
import clsx from "clsx";

export function StatusBadge({ label, status }: { label: string; status: string }) {
  return <span className={clsx("status", `status-${statusTone(status as never)}`)}>{label}</span>;
}
