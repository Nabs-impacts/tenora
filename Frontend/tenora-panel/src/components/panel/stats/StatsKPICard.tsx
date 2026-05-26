// === src/components/panel/stats/StatsKPICard.tsx — NOUVEAU ===
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  deltaPct?: number | null;
  periodLabel?: string;
  suffix?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

export function StatsKPICard({ label, value, deltaPct, periodLabel, suffix, icon: Icon }: Props) {
  const hasDelta = typeof deltaPct === "number" && !Number.isNaN(deltaPct);
  const up = hasDelta && deltaPct! > 0;
  const down = hasDelta && deltaPct! < 0;
  const neutral = hasDelta && deltaPct === 0;

  const deltaColor = up
    ? "text-success"
    : down
    ? "text-destructive"
    : "text-muted-foreground";

  return (
    <div className="border-2 border-border bg-card p-4 brackets">
      <div className="flex items-start justify-between mb-3">
        <p className="eyebrow text-muted-foreground">// {label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />}
      </div>
      <p className="display text-3xl tracking-tight text-foreground">
        {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
        {suffix && <span className="text-base text-muted-foreground ml-1">{suffix}</span>}
      </p>
      {hasDelta && (
        <div className={cn("mt-2 flex items-center gap-1 mono text-xs", deltaColor)}>
          {up && <ArrowUp className="h-3 w-3" strokeWidth={3} />}
          {down && <ArrowDown className="h-3 w-3" strokeWidth={3} />}
          {neutral && <Minus className="h-3 w-3" strokeWidth={3} />}
          <span>{deltaPct! > 0 ? "+" : ""}{deltaPct!.toFixed(1)}%</span>
          {periodLabel && <span className="text-muted-foreground">vs {periodLabel}</span>}
        </div>
      )}
    </div>
  );
}

export default StatsKPICard;
