// === src/components/panel/stats/ChartTooltipDark.tsx — NOUVEAU ===
import type { TooltipProps } from "recharts";

export function ChartTooltipDark({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="border-2 mono text-[11px] p-2"
      style={{
        background: "hsl(var(--background))",
        borderColor: "hsl(var(--border))",
        fontFamily: "'JetBrains Mono', monospace",
        minWidth: 140,
      }}
    >
      {label !== undefined && (
        <p className="eyebrow mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          // {String(label)}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2"
              style={{ background: (p.color as string) ?? "hsl(var(--primary))" }}
            />
            <span style={{ color: "hsl(var(--muted-foreground))" }}>{p.name}</span>
          </span>
          <span className="text-foreground font-semibold">
            {typeof p.value === "number" ? p.value.toLocaleString("fr-FR") : String(p.value ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}

export default ChartTooltipDark;
