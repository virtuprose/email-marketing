import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageScaffold({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("page-scaffold", className)}>{children}</div>;
}
