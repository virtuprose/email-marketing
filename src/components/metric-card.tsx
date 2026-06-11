import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  icon,
  label,
  value,
  note,
  className
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("metric-card", className)}>
      <CardContent className="metric-card-content">
        <p className="metric-label">
          {icon} {label}
        </p>
        <p className="metric-value">{value}</p>
        {note ? <p className="metric-note">{note}</p> : null}
      </CardContent>
    </Card>
  );
}
