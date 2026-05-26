// === src/components/panel/stats/ChartTooltipDark.tsx ===
// v2 — tooltip très lisible : fond opaque, texte clair, taille confortable,
// crochets néon façon Tenora.
import type { TooltipProps } from "recharts";

export function ChartTooltipDark({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className="relative"
      style={{
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        minWidth: 180,
        background: "hsl(var(--card))",
        border: "2px solid hsl(var(--primary))",
        padding: "10px 12px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
        color: "hsl(var(--foreground))",
      }}
    >
      {/* Coins en crochets façon Tenora */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[3px] -left-[3px] w-2.5 h-2.5"
        style={{
          borderTop: "2px solid hsl(var(--primary))",
          borderLeft: "2px solid hsl(var(--primary))",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[3px] -right-[3px] w-2.5 h-2.5"
        style={{
          borderTop: "2px solid hsl(var(--primary))",
          borderRight: "2px solid hsl(var(--primary))",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[3px] -left-[3px] w-2.5 h-2.5"
        style={{
          borderBottom: "2px solid hsl(var(--primary))",
          borderLeft: "2px solid hsl(var(--primary))",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[3px] -right-[3px] w-2.5 h-2.5"
        style={{
          borderBottom: "2px solid hsl(var(--primary))",
          borderRight: "2px solid hsl(var(--primary))",
        }}
      />

      {label !== undefined && (
        <p
          className="mb-2 uppercase tracking-[0.18em] font-semibold"
          style={{
            color: "hsl(var(--primary))",
            fontSize: 11,
            lineHeight: 1.2,
          }}
        >
          // {String(label)}
        </p>
      )}

      <div className="space-y-1.5">
        {payload.map((p, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4"
            style={{ fontSize: 13, lineHeight: 1.25 }}
          >
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5"
                style={{
                  background: (p.color as string) ?? "hsl(var(--primary))",
                }}
              />
              <span
                style={{
                  color: "hsl(var(--foreground))",
                  fontWeight: 500,
                }}
              >
                {p.name}
              </span>
            </span>
            <span
              style={{
                color: "hsl(var(--foreground))",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {typeof p.value === "number"
                ? p.value.toLocaleString("fr-FR")
                : String(p.value ?? "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChartTooltipDark;
