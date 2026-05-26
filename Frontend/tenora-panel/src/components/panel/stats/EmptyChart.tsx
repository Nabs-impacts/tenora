// === src/components/panel/stats/EmptyChart.tsx — NOUVEAU ===
export function EmptyChart({ height = 280, message = "Aucune donnée sur cette période" }: { height?: number; message?: string }) {
  return (
    <div
      className="border-2 border-dashed border-border flex items-center justify-center"
      style={{ height }}
    >
      <p className="eyebrow text-muted-foreground">// {message}</p>
    </div>
  );
}

export default EmptyChart;
