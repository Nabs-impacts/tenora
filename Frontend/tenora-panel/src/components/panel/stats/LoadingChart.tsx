// === src/components/panel/stats/LoadingChart.tsx — NOUVEAU ===
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingChart({ height = 280 }: { height?: number }) {
  return (
    <div className="border-2 border-border p-3">
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

export default LoadingChart;
