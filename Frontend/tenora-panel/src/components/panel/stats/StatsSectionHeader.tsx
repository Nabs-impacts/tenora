// === src/components/panel/stats/StatsSectionHeader.tsx — NOUVEAU ===
interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function StatsSectionHeader({ title, subtitle, right }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 border-b-2 border-border pb-3">
      <div>
        <p className="eyebrow text-muted-foreground">// SECTION</p>
        <h2 className="display text-2xl tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="mono text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export default StatsSectionHeader;
