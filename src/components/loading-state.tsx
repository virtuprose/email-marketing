import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div>
        <p className="eyebrow">{label}</p>
        <Skeleton className="loading-title" />
      </div>
      <div className="grid grid-4">
        <Skeleton className="loading-card" />
        <Skeleton className="loading-card" />
        <Skeleton className="loading-card" />
        <Skeleton className="loading-card" />
      </div>
      <Skeleton className="loading-panel" />
    </div>
  );
}
