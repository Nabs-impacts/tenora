// === src/components/panel/stats/StatsSectionHeader.tsx ===
// v2 — empile titre + actions sur mobile pour ne plus étouffer la page.
interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function StatsSectionHeader({ title, subtitle, right }: Props) {
  return (
    <div className="flex flex-col gap-3 border-b-2 border-border pb-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="eyebrow text-muted-foreground">// SECTION</p>
        <h2 className="display text-xl sm:text-2xl tracking-tight text-foreground truncate">
          {title}
        </h2>
        {subtitle && (
          <p className="mono text-[11px] sm:text-xs text-muted-foreground mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {right && (
        <div className="flex flex-wrap items-center gap-2 -mx-1 px-1 overflow-x-auto lg:overflow-visible lg:flex-nowrap">
          {right}
        </div>
      )}
    </div>
  );
}

export default StatsSectionHeader;
