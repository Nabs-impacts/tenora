// === src/components/panel/stats/PeriodSelector.tsx ===
// v2 — scrollable horizontalement sur mobile, inputs date qui ne débordent
// jamais.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Period = "7j" | "30j" | "90j" | "12m" | "custom";

interface Props {
  period: Period;
  dateFrom: string;
  dateTo: string;
  onChange: (next: { period: Period; date_from: string; date_to: string }) => void;
}

const PRESETS: { value: Period; label: string }[] = [
  { value: "7j", label: "7J" },
  { value: "30j", label: "30J" },
  { value: "90j", label: "90J" },
  { value: "12m", label: "12M" },
];

export function PeriodSelector({ period, dateFrom, dateTo, onChange }: Props) {
  const [localFrom, setLocalFrom] = useState(dateFrom);
  const [localTo, setLocalTo] = useState(dateTo);

  return (
    <div className="flex items-center gap-2 flex-wrap max-w-full">
      <div className="flex border-2 border-border overflow-x-auto no-scrollbar max-w-full">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() =>
              onChange({ period: p.value, date_from: "", date_to: "" })
            }
            className={cn(
              "mono text-[11px] sm:text-xs uppercase tracking-wider px-2.5 sm:px-3 py-1.5 border-r-2 border-border last:border-r-0 transition-colors shrink-0",
              period === p.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() =>
            onChange({ period: "custom", date_from: localFrom, date_to: localTo })
          }
          className={cn(
            "mono text-[11px] sm:text-xs uppercase tracking-wider px-2.5 sm:px-3 py-1.5 transition-colors shrink-0",
            period === "custom"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-foreground hover:bg-muted"
          )}
        >
          CUSTOM
        </button>
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-1 flex-wrap">
          <Input
            type="date"
            value={localFrom}
            onChange={(e) => setLocalFrom(e.target.value)}
            className="mono text-xs h-8 w-[8.5rem] sm:w-36 rounded-none border-2"
          />
          <span className="mono text-muted-foreground">→</span>
          <Input
            type="date"
            value={localTo}
            onChange={(e) => setLocalTo(e.target.value)}
            className="mono text-xs h-8 w-[8.5rem] sm:w-36 rounded-none border-2"
          />
          <Button
            size="sm"
            variant="outline"
            className="rounded-none border-2 mono uppercase text-xs tracking-wider"
            onClick={() =>
              onChange({ period: "custom", date_from: localFrom, date_to: localTo })
            }
          >
            OK
          </Button>
        </div>
      )}
    </div>
  );
}

export default PeriodSelector;
