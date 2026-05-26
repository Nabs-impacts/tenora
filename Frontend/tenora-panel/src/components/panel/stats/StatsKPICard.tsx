// === src/components/panel/stats/StatsKPICard.tsx ===
// v2 — responsive : valeur plus petite sur mobile, troncature douce pour ne
// jamais déborder la carte.
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

export function StatsKPICard({
  label,
  value,
  deltaPct,
  periodLabel,
  suffix,
  icon: Icon,
}: Props) {
  const hasDelta = typeof deltaPct === "number" && !Number.isNaN(deltaPct);
  const up = hasDelta && deltaPct! > 0;
  const down = hasDelta && deltaPct! < 0;
  const neutral = hasDelta && deltaPct === 0;

  const deltaColor = up
    ? "text-success"
    : down
    ? "text-destructive"
    : "text-muted-foreground";

  const displayValue =
    typeof value === "number" ? value.toLocaleString("fr-FR") : value;

  return (
    <div className="border-2 border-border bg-card p-3 sm:p-4 brackets min-w-0">
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <p className="eyebrow text-muted-foreground text-[10px] sm:text-[11px] truncate">
          // {label}
        </p>
        {Icon && (
          <Icon
            className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
        )}
      </div>
      <p
        className={cn(
          "display text-foreground tracking-tight leading-[1.05] break-words",
          // Mobile : plus petit + permet le wrap ; desktop : grand
          "text-xl sm:text-2xl xl:text-3xl"
        )}
        title={typeof displayValue === "string" ? displayValue : undefined}
      >
        {displayValue}
        {suffix && (
          <span className="text-xs sm:text-sm xl:text-base text-muted-foreground ml-1">
            {suffix}
          </span>
        )}
      </p>
      {hasDelta && (
        <div
          className={cn(
            "mt-2 flex items-center gap-1 flex-wrap mono text-[10px] sm:text-xs",
            deltaColor
          )}
        >
          {up && <ArrowUp className="h-3 w-3" strokeWidth={3} />}
          {down && <ArrowDown className="h-3 w-3" strokeWidth={3} />}
          {neutral && <Minus className="h-3 w-3" strokeWidth={3} />}
          <span>
            {deltaPct! > 0 ? "+" : ""}
            {deltaPct!.toFixed(1)}%
          </span>
          {periodLabel && (
            <span className="text-muted-foreground truncate">
              vs {periodLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default StatsKPICard;
