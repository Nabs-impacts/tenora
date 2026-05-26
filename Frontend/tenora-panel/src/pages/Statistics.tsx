// === src/pages/Statistics.tsx ===
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Wallet, Package, Users, Tag,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Bar, LineChart, ReferenceLine, PieChart, Pie, Cell,
  AreaChart, ScatterChart, Scatter, ZAxis, Treemap,
} from "recharts";

import { cn } from "@/lib/utils";
import {
  useStatisticsOverview, useStatisticsOrders, useStatisticsRevenue,
  useStatisticsProducts, useStatisticsCustomers, useStatisticsCoupons,
} from "@/lib/queries/admin";

import { StatsKPICard }      from "@/components/panel/stats/StatsKPICard";
import { StatsSectionHeader } from "@/components/panel/stats/StatsSectionHeader";
import { PeriodSelector, type Period } from "@/components/panel/stats/PeriodSelector";
import { ExportButtons }     from "@/components/panel/stats/ExportButtons";
import { ChartTooltipDark }  from "@/components/panel/stats/ChartTooltipDark";
import { EmptyChart }        from "@/components/panel/stats/EmptyChart";
import { LoadingChart }      from "@/components/panel/stats/LoadingChart";
import { StatsTable }        from "@/components/panel/stats/StatsTable";

// ─── Types / Constantes ───────────────────────────────────────────────────────
type SectionKey = "overview" | "orders" | "revenue" | "products" | "customers" | "coupons";

const SECTIONS: {
  key: SectionKey;
  label: string;
  code: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { key: "overview",  label: "Vue Globale", code: "01", icon: LayoutDashboard },
  { key: "orders",    label: "Commandes",   code: "02", icon: ShoppingCart },
  { key: "revenue",   label: "Revenus",     code: "03", icon: Wallet },
  { key: "products",  label: "Produits",    code: "04", icon: Package },
  { key: "customers", label: "Clients",     code: "05", icon: Users },
  { key: "coupons",   label: "Coupons",     code: "06", icon: Tag },
];

const STATUS_COLORS: Record<string, string> = {
  pending:    "#F59E0B",
  processing: "#3B82F6",
  completed:  "#22C55E",
  rejected:   "#EF4444",
  refunded:   "#8B5CF6",
};

const PRIMARY = "hsl(var(--primary))";
const BORDER  = "hsl(var(--border))";
const MUTED   = "hsl(var(--muted-foreground))";

// fontSize augmenté 9 → 11 pour la lisibilité des axes
const axisStyle = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  fill: "hsl(var(--foreground) / 0.75)",
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} F`;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function StatsSidebar({ active, onSelect }: { active: SectionKey; onSelect: (k: SectionKey) => void }) {
  return (
    <aside className="w-56 shrink-0 border-2 border-border bg-card h-fit">
      <div className="px-3 py-3 border-b-2 border-border">
        <p className="eyebrow text-foreground/70 text-[11px] tracking-widest font-semibold">
          // SECTIONS
        </p>
      </div>
      <nav className="p-2 space-y-1">
        {SECTIONS.map((s) => {
          const isActive = active === s.key;
          return (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 border-2 transition-all",
                "mono text-xs uppercase tracking-[0.12em] font-semibold text-left",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-transparent text-foreground hover:border-border hover:bg-muted/40",
              )}
            >
              <span className={cn("text-[9px] tracking-widest", isActive ? "text-primary-foreground/70" : "text-foreground/50")}>
                {s.code}
              </span>
              <s.icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span className="flex-1">{s.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ─── ChartFrame ───────────────────────────────────────────────────────────────
function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="border-2 border-border bg-card p-3">{children}</div>;
}

// Titre de section dans les charts — meilleure lisibilité
function ChartTitle({ text }: { text: string }) {
  return (
    <p className="mono text-xs font-semibold text-foreground/80 tracking-wider mb-2 uppercase">
      {text}
    </p>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Page principale
// ═════════════════════════════════════════════════════════════════════════════
export default function Statistics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section   = (searchParams.get("section") as SectionKey) || "overview";
  const period    = (searchParams.get("period")  as Period)     || "30j";
  const dateFrom  = searchParams.get("date_from") || "";
  const dateTo    = searchParams.get("date_to")   || "";

  const setSection = (k: SectionKey) => {
    const next = new URLSearchParams(searchParams);
    next.set("section", k);
    setSearchParams(next, { replace: true });
  };

  const setPeriod = (p: { period: Period; date_from: string; date_to: string }) => {
    const next = new URLSearchParams(searchParams);
    next.set("period", p.period);
    if (p.period === "custom" && p.date_from && p.date_to) {
      next.set("date_from", p.date_from);
      next.set("date_to",   p.date_to);
    } else {
      next.delete("date_from");
      next.delete("date_to");
    }
    setSearchParams(next, { replace: true });
  };

  const params = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = { period };
    if (period === "custom" && dateFrom && dateTo) {
      p.date_from = dateFrom;
      p.date_to   = dateTo;
    }
    return p;
  }, [period, dateFrom, dateTo]);

  const periodLabel = period === "custom" ? "période précédente" : `${period} précédents`;

  return (
    <div className="flex gap-6 h-full animate-fade-up">
      <StatsSidebar active={section} onSelect={setSection} />

      <div className="flex-1 min-w-0 overflow-y-auto space-y-6 pb-12">
        <StatsSectionHeader
          title={SECTIONS.find((s) => s.key === section)?.label ?? "Statistiques"}
          subtitle="Analyse avancée — données en temps réel"
          right={
            <>
              <PeriodSelector period={period} dateFrom={dateFrom} dateTo={dateTo} onChange={setPeriod} />
              <ExportButtons section={section} params={params} />
            </>
          }
        />

        {section === "overview"  && <OverviewSection  params={params} periodLabel={periodLabel} />}
        {section === "orders"    && <OrdersSection    params={params} />}
        {section === "revenue"   && <RevenueSection   params={params} />}
        {section === "products"  && <ProductsSection  params={params} />}
        {section === "customers" && <CustomersSection params={params} />}
        {section === "coupons"   && <CouponsSection   params={params} />}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5.1 — Vue Globale
// ═════════════════════════════════════════════════════════════════════════════
function OverviewSection({ params, periodLabel }: { params: Record<string, string>; periodLabel: string }) {
  const { data, isLoading } = useStatisticsOverview(params);

  if (isLoading) {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <LoadingChart key={i} height={96} />)}
        </div>
        <LoadingChart height={320} />
        <LoadingChart height={280} />
      </>
    );
  }
  if (!data) return <EmptyChart />;

  const k       = data.kpis ?? {};
  const chart   = (data.chart ?? []) as Array<{ date: string; revenue: number; orders: number }>;
  const dist    = (data.status_distribution ?? []) as Array<{ status: string; count: number; pct: number }>;
  const summary = (data.weekly_summary ?? []) as Array<Record<string, unknown>>;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatsKPICard label="CHIFFRE D'AFFAIRES" value={fmtMoney(k.revenue)} deltaPct={k.revenue_delta_pct} periodLabel={periodLabel} />
        <StatsKPICard label="COMMANDES"           value={k.orders ?? 0}       deltaPct={k.orders_delta_pct}  periodLabel={periodLabel} />
        <StatsKPICard label="PANIER MOYEN"        value={fmtMoney(k.avg_basket)} deltaPct={k.avg_basket_delta_pct} periodLabel={periodLabel} />
        <StatsKPICard label="TAUX DE COMPLÉTION"  value={`${(k.completion_rate ?? 0).toFixed(1)}`} suffix="%" deltaPct={k.completion_rate_delta_pct} periodLabel={periodLabel} />
      </div>

      <ChartFrame>
        <ChartTitle text="// Activité — Revenu & Commandes" />
        {chart.length === 0 ? <EmptyChart height={320} /> : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={PRIMARY} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={PRIMARY} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date"   tick={axisStyle} stroke={BORDER} />
              <YAxis yAxisId="left"   tick={axisStyle} stroke={BORDER} />
              <YAxis yAxisId="right" orientation="right" tick={axisStyle} stroke={BORDER} />
              <Tooltip content={<ChartTooltipDark />} />
              <Legend wrapperStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
              <Area  yAxisId="left"  type="monotone" dataKey="revenue" name="Revenu (F)"  stroke={PRIMARY}    fill="url(#gradRev)" />
              <Line  yAxisId="right" type="monotone" dataKey="orders"  name="Commandes"   stroke="#3B82F6"     strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartFrame>
          <ChartTitle text="// Répartition par statut" />
          {dist.length === 0 ? <EmptyChart height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={dist} dataKey="count" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {dist.map((d, i) => (
                    <Cell key={i} fill={STATUS_COLORS[d.status] ?? PRIMARY} stroke={BORDER} strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltipDark />} />
                <Legend wrapperStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <ChartFrame>
          <ChartTitle text="// Synthèse hebdomadaire" />
          <StatsTable
            rows={summary as Array<Record<string, unknown>>}
            pageSize={10}
            columns={[
              { key: "week",            label: "Semaine" },
              { key: "orders",          label: "Commandes",    align: "right" },
              { key: "revenue",         label: "Revenu (F)",   align: "right", render: (r) => fmtMoney(r.revenue as number) },
              { key: "avg_basket",      label: "Panier moy.",  align: "right", render: (r) => fmtMoney(r.avg_basket as number) },
              { key: "completion_rate", label: "Complétion %", align: "right", render: (r) => `${(r.completion_rate as number ?? 0).toFixed(1)}%` },
            ]}
            emptyMessage="Pas de synthèse"
          />
        </ChartFrame>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5.2 — Commandes
// ═════════════════════════════════════════════════════════════════════════════
function OrdersSection({ params }: { params: Record<string, string> }) {
  const { data, isLoading } = useStatisticsOrders(params);
  if (isLoading) return <LoadingChart height={400} />;
  if (!data) return <EmptyChart />;

  const k      = data.kpis ?? {};
  const daily  = (data.daily_breakdown ?? []) as Array<Record<string, number | string>>;
  const hourly = (data.hourly_distribution ?? []) as Array<{ hour: number; count: number }>;
  const funnel = data.funnel ?? {};

  const dailyTotals = daily.map((d) => ({
    date:  d.date as string,
    total: (["completed", "pending", "rejected", "processing", "refunded"] as const)
      .reduce((s, k2) => s + ((d[k2] as number) ?? 0), 0),
  }));
  const avg = dailyTotals.length
    ? dailyTotals.reduce((s, d) => s + d.total, 0) / dailyTotals.length
    : 0;
  const maxPoint = dailyTotals.reduce((m, d) => (d.total > m.total ? d : m), { date: "", total: 0 });
  const maxHour  = Math.max(1, ...hourly.map((h) => h.count));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatsKPICard label="TOTAL COMMANDES"    value={k.total ?? 0} />
        <StatsKPICard label="AUJOURD'HUI"         value={k.today ?? 0} />
        <StatsKPICard label="TAUX DE REJET"       value={`${(k.rejection_rate ?? 0).toFixed(1)}`} suffix="%" />
        <StatsKPICard label="TRAITEMENT MOYEN"    value={k.avg_processing_hours != null ? `${k.avg_processing_hours.toFixed(1)}` : "—"} suffix="h" />
      </div>

      <ChartFrame>
        <ChartTitle text="// Ventilation quotidienne par statut" />
        {daily.length === 0 ? <EmptyChart height={280} /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date"       tick={axisStyle} stroke={BORDER} />
              <YAxis                      tick={axisStyle} stroke={BORDER} />
              <Tooltip content={<ChartTooltipDark />} />
              <Legend wrapperStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
              <Bar dataKey="completed" name="Complétées"    fill={STATUS_COLORS.completed} />
              <Bar dataKey="pending"   name="En attente"    fill={STATUS_COLORS.pending}   />
              <Bar dataKey="rejected"  name="Rejetées"      fill={STATUS_COLORS.rejected}  />
              <Bar dataKey="refunded"  name="Remboursées"   fill={STATUS_COLORS.refunded}  />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>

      <ChartFrame>
        <ChartTitle text="// Évolution quotidienne (lissée)" />
        {dailyTotals.length === 0 ? <EmptyChart height={240} /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyTotals}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={axisStyle} stroke={BORDER} />
              <YAxis                tick={axisStyle} stroke={BORDER} />
              <Tooltip content={<ChartTooltipDark />} />
              <ReferenceLine
                y={avg}
                stroke={MUTED}
                strokeDasharray="4 4"
                label={{ value: `moy ${avg.toFixed(1)}`, fill: MUTED, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
              />
              <Line type="monotone" dataKey="total" name="Total" stroke={PRIMARY} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {maxPoint.date && (
          <p className="mono text-xs text-foreground/70 mt-2">
            // Pic : {maxPoint.date} — {maxPoint.total} commandes
          </p>
        )}
      </ChartFrame>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartFrame>
          <ChartTitle text="// Entonnoir de traitement" />
          <div className="space-y-2">
            {[
              { label: "Total reçu",       value: funnel.total      ?? 0, pct: 100 },
              { label: "En traitement",    value: funnel.processing ?? 0, pct: funnel.processing_pct ?? 0 },
              { label: "Complétées",       value: funnel.completed  ?? 0, pct: funnel.completion_pct ?? 0 },
            ].map((step, i) => (
              <div key={i} className="border-2 border-border">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <span className="mono text-xs font-semibold text-foreground uppercase">{step.label}</span>
                  <span className="mono text-xs font-bold text-foreground">{step.value} ({(step.pct as number).toFixed(1)}%)</span>
                </div>
                <div className="h-2 bg-background">
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, step.pct as number)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </ChartFrame>

        <ChartFrame>
          <ChartTitle text="// Top heures de commande" />
          <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
            {[...hourly].sort((a, b) => b.count - a.count).slice(0, 10).map((h) => (
              <div key={h.hour} className="flex items-center gap-2">
                <span className="mono text-xs w-10 text-foreground/70">{String(h.hour).padStart(2, "0")}h</span>
                <div className="flex-1 h-4 bg-muted/30 border border-border">
                  <div className="h-full bg-primary" style={{ width: `${(h.count / maxHour) * 100}%` }} />
                </div>
                <span className="mono text-xs w-8 text-right text-foreground">{h.count}</span>
              </div>
            ))}
          </div>
        </ChartFrame>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5.3 — Revenus
// ═════════════════════════════════════════════════════════════════════════════
function RevenueSection({ params }: { params: Record<string, string> }) {
  const { data, isLoading } = useStatisticsRevenue(params);
  if (isLoading) return <LoadingChart height={400} />;
  if (!data) return <EmptyChart />;

  const k         = data.kpis ?? {};
  const cumulative = (data.cumulative ?? []) as Array<{ date: string; revenue: number; cumulative: number }>;
  const byMethod   = (data.by_payment_method ?? []) as Array<{ method: string; revenue: number; orders: number }>;
  const byCat      = (data.by_category ?? []) as Array<{ category: string; revenue: number; orders: number; avg_basket: number; share_pct: number }>;
  const scatter    = (data.scatter ?? []) as Array<{ hour: number; amount: number; status: string }>;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatsKPICard label="CHIFFRE D'AFFAIRES"      value={fmtMoney(k.total_revenue)} />
        <StatsKPICard label="REVENU JOURNALIER MOY."  value={fmtMoney(k.daily_avg)} />
        <StatsKPICard label="MEILLEURE JOURNÉE"       value={k.best_day?.date ?? "—"} suffix={k.best_day?.revenue ? ` · ${fmtMoney(k.best_day.revenue)}` : ""} />
        <StatsKPICard label="REMISES COUPONS"         value={fmtMoney(k.total_discounts)} />
      </div>

      <ChartFrame>
        <ChartTitle text="// Chiffre d'affaires cumulé" />
        {cumulative.length === 0 ? <EmptyChart height={300} /> : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cumulative}>
              <defs>
                <linearGradient id="gradCum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#22C55E" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date"       tick={axisStyle} stroke={BORDER} />
              <YAxis                      tick={axisStyle} stroke={BORDER} />
              <Tooltip content={<ChartTooltipDark />} />
              <Area type="monotone" dataKey="cumulative" name="CA cumulé (F)" stroke="#22C55E" fill="url(#gradCum)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartFrame>
          <ChartTitle text="// Par méthode de paiement" />
          {byMethod.length === 0 ? <EmptyChart height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byMethod}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="method"                    tick={axisStyle} stroke={BORDER} />
                <YAxis yAxisId="left"                      tick={axisStyle} stroke={BORDER} />
                <YAxis yAxisId="right" orientation="right" tick={axisStyle} stroke={BORDER} />
                <Tooltip content={<ChartTooltipDark />} />
                <Legend wrapperStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
                <Bar yAxisId="left"  dataKey="revenue" name="Revenu (F)"  fill={PRIMARY}    />
                <Bar yAxisId="right" dataKey="orders"  name="Commandes"   fill="#3B82F6"    />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <ChartFrame>
          <ChartTitle text="// Heure de commande × Montant" />
          {scatter.length === 0 ? <EmptyChart height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="hour"   name="Heure"   domain={[0, 23]} tick={axisStyle} stroke={BORDER} />
                <YAxis dataKey="amount" name="Montant"                   tick={axisStyle} stroke={BORDER} />
                <ZAxis range={[40, 40]} />
                <Tooltip content={<ChartTooltipDark />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatter} fill={PRIMARY}>
                  {scatter.map((p, i) => (
                    <Cell key={i} fill={STATUS_COLORS[p.status] ?? PRIMARY} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>

      <ChartFrame>
        <ChartTitle text="// Chiffre d'affaires par catégorie" />
        <StatsTable
          rows={byCat as Array<Record<string, unknown>>}
          pageSize={20}
          columns={[
            { key: "category",   label: "Catégorie" },
            { key: "revenue",    label: "Revenu (F)",    align: "right", render: (r) => fmtMoney(r.revenue as number) },
            { key: "orders",     label: "Commandes",     align: "right" },
            { key: "avg_basket", label: "Panier moyen",  align: "right", render: (r) => fmtMoney(r.avg_basket as number) },
            { key: "share_pct",  label: "Part (%)",      align: "right", render: (r) => (
              <div className="flex items-center justify-end gap-2">
                <div className="w-20 h-1.5 bg-muted/30 border border-border">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, r.share_pct as number)}%` }} />
                </div>
                <span>{(r.share_pct as number).toFixed(1)}%</span>
              </div>
            )},
          ]}
        />
      </ChartFrame>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5.4 — Produits
// ═════════════════════════════════════════════════════════════════════════════
function ProductsSection({ params }: { params: Record<string, string> }) {
  const { data, isLoading } = useStatisticsProducts(params);
  if (isLoading) return <LoadingChart height={400} />;
  if (!data) return <EmptyChart />;

  const k     = data.kpis ?? {};
  const top   = (data.top_products ?? []) as Array<{ name: string; revenue: number; sales_count: number; category: string }>;
  const tree  = (data.treemap ?? []) as Array<{ name: string; children?: Array<{ name: string; value: number }> }>;
  const table = (data.table ?? []) as Array<Record<string, unknown>>;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatsKPICard label="MEILLEURE VENTE (QTÉ)" value={k.top_seller_name ?? "—"}  suffix={k.top_seller_qty  ? ` · ${k.top_seller_qty}` : ""} />
        <StatsKPICard label="MEILLEUR REVENU"        value={k.top_revenue_name ?? "—"} suffix={k.top_revenue_amount ? ` · ${fmtMoney(k.top_revenue_amount)}` : ""} />
        <StatsKPICard label="TAUX PRODUITS ACTIFS"   value={`${(k.active_rate_pct ?? 0).toFixed(1)}`} suffix="%" />
        <StatsKPICard label="SANS VENTE"             value={k.zero_sales_count ?? 0} />
      </div>

      <ChartFrame>
        <ChartTitle text="// Top 10 produits par chiffre d'affaires" />
        {top.length === 0 ? <EmptyChart height={320} /> : (
          <ResponsiveContainer width="100%" height={Math.max(240, top.length * 40)}>
            <BarChart data={top.slice(0, 10)} layout="vertical" margin={{ left: 100, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis type="number"   tick={axisStyle} stroke={BORDER} />
              <YAxis type="category" dataKey="name" tick={axisStyle} stroke={BORDER} width={140} />
              <Tooltip content={<ChartTooltipDark />} />
              <Bar dataKey="revenue" name="Revenu (F)" fill={PRIMARY} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>

      <ChartFrame>
        <ChartTitle text="// Répartition par catégorie (Treemap)" />
        {tree.length === 0 ? <EmptyChart height={300} /> : (
          <ResponsiveContainer width="100%" height={300}>
            <Treemap data={tree} dataKey="value" stroke={BORDER} fill={PRIMARY} aspectRatio={4 / 3} />
          </ResponsiveContainer>
        )}
      </ChartFrame>

      <ChartFrame>
        <ChartTitle text="// Catalogue complet" />
        <StatsTable
          rows={table}
          pageSize={20}
          columns={[
            { key: "name",       label: "Produit" },
            { key: "category",   label: "Catégorie" },
            { key: "sales",      label: "Ventes",    align: "right" },
            { key: "revenue",    label: "Revenu (F)", align: "right", render: (r) => fmtMoney(r.revenue as number) },
            { key: "avg_basket", label: "Panier moy.", align: "right", render: (r) => fmtMoney(r.avg_basket as number) },
            { key: "stock",      label: "Stock",      align: "right", render: (r) => r.stock == null ? "—" : String(r.stock) },
            { key: "is_active",  label: "Statut",     align: "center", render: (r) => (
              <span className={cn("mono text-[10px] px-2 py-0.5 border font-semibold", r.is_active ? "border-success text-success" : "border-muted text-muted-foreground")}>
                {r.is_active ? "ACTIF" : "INACTIF"}
              </span>
            )},
          ]}
        />
      </ChartFrame>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5.5 — Clients
// ═════════════════════════════════════════════════════════════════════════════
function CustomersSection({ params }: { params: Record<string, string> }) {
  const { data, isLoading } = useStatisticsCustomers(params);
  if (isLoading) return <LoadingChart height={400} />;
  if (!data) return <EmptyChart />;

  const k         = data.kpis ?? {};
  const newPerDay = (data.new_per_day ?? []) as Array<{ date: string; new_users: number }>;
  const dist      = (data.orders_distribution ?? []) as Array<{ bucket: string; label: string; customer_count: number }>;
  const top       = (data.top_customers ?? []) as Array<Record<string, unknown>>;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatsKPICard label="NOUVEAUX CLIENTS"     value={k.new_customers ?? 0} />
        <StatsKPICard label="CLIENTS RÉCURRENTS"   value={k.returning_customers ?? 0} />
        <StatsKPICard label="TAUX DE RÉTENTION"    value={`${(k.retention_rate_pct ?? 0).toFixed(1)}`} suffix="%" />
        <StatsKPICard label="MEILLEUR CLIENT"       value={k.top_customer_email_masked ?? "—"} suffix={k.top_customer_revenue ? ` · ${fmtMoney(k.top_customer_revenue)}` : ""} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartFrame>
          <ChartTitle text="// Nouveaux clients / jour" />
          {newPerDay.length === 0 ? <EmptyChart height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={newPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="date"      tick={axisStyle} stroke={BORDER} />
                <YAxis                     tick={axisStyle} stroke={BORDER} />
                <Tooltip content={<ChartTooltipDark />} />
                <Line type="monotone" dataKey="new_users" name="Nouveaux clients" stroke={PRIMARY} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <ChartFrame>
          <ChartTitle text="// Répartition par nombre de commandes" />
          {dist.length === 0 ? <EmptyChart height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dist}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="label"      tick={axisStyle} stroke={BORDER} />
                <YAxis                      tick={axisStyle} stroke={BORDER} />
                <Tooltip content={<ChartTooltipDark />} />
                <Bar dataKey="customer_count" name="Nombre de clients" fill={PRIMARY} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>

      <ChartFrame>
        <ChartTitle text="// Top 20 clients" />
        <StatsTable
          rows={top}
          pageSize={20}
          columns={[
            { key: "email_masked",   label: "Email" },
            { key: "orders_count",   label: "Commandes",     align: "right" },
            { key: "total_revenue",  label: "Revenu total (F)", align: "right", render: (r) => fmtMoney(r.total_revenue as number) },
            { key: "last_order_at",  label: "Dernière commande", render: (r) => r.last_order_at ? String(r.last_order_at).slice(0, 10) : "—" },
            { key: "status",         label: "Statut", align: "center", render: (r) => (
              <span className="mono text-[10px] px-2 py-0.5 border border-border uppercase font-semibold">
                {String(r.status ?? "—")}
              </span>
            )},
          ]}
        />
      </ChartFrame>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5.6 — Coupons
// ═════════════════════════════════════════════════════════════════════════════
function CouponsSection({ params }: { params: Record<string, string> }) {
  const { data, isLoading } = useStatisticsCoupons(params);
  if (isLoading) return <LoadingChart height={400} />;
  if (!data) return <EmptyChart />;

  const k        = data.kpis ?? {};
  const daily    = (data.daily_discounts ?? []) as Array<{ date: string; discount_amount: number }>;
  const byCoupon = (data.by_coupon ?? []) as Array<Record<string, unknown>>;
  const top10    = [...byCoupon].sort((a, b) => (b.uses as number) - (a.uses as number)).slice(0, 10);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatsKPICard label="COUPONS ACTIFS"      value={k.active_count ?? 0} />
        <StatsKPICard label="UTILISATIONS"         value={k.total_uses ?? 0} />
        <StatsKPICard label="REMISES ACCORDÉES"    value={fmtMoney(k.total_discounts_granted)} />
        <StatsKPICard label="COUPON LE + UTILISÉ"  value={k.top_coupon_code ?? "—"} suffix={k.top_coupon_uses ? ` · ${k.top_coupon_uses}x` : ""} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartFrame>
          <ChartTitle text="// Top 10 — Utilisations" />
          {top10.length === 0 ? <EmptyChart height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top10}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="code"     tick={axisStyle} stroke={BORDER} />
                <YAxis                    tick={axisStyle} stroke={BORDER} />
                <Tooltip content={<ChartTooltipDark />} />
                <Bar dataKey="uses" name="Utilisations" fill={PRIMARY} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <ChartFrame>
          <ChartTitle text="// Remises accordées par jour" />
          {daily.length === 0 ? <EmptyChart height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="date"          tick={axisStyle} stroke={BORDER} />
                <YAxis                         tick={axisStyle} stroke={BORDER} />
                <Tooltip content={<ChartTooltipDark />} />
                <Line type="monotone" dataKey="discount_amount" name="Remise (F)" stroke="#8B5CF6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>

      <ChartFrame>
        <ChartTitle text="// Tous les coupons" />
        <StatsTable
          rows={byCoupon}
          pageSize={20}
          columns={[
            { key: "code",         label: "Code" },
            { key: "type",         label: "Type" },
            { key: "value",        label: "Valeur",      align: "right", render: (r) => r.type === "percent" ? `${r.value}%` : fmtMoney(r.value as number) },
            { key: "uses",         label: "Utilisations", align: "right" },
            { key: "max_uses",     label: "Maximum",     align: "right", render: (r) => r.max_uses == null ? "∞" : String(r.max_uses) },
            { key: "remise_total", label: "Remise accordée (F)", align: "right", render: (r) => fmtMoney(r.remise_total as number) },
            { key: "expires_at",   label: "Expiration", render: (r) => r.expires_at ? String(r.expires_at).slice(0, 10) : "—" },
            { key: "is_active",    label: "Statut", align: "center", render: (r) => (
              <span className={cn("mono text-[10px] px-2 py-0.5 border font-semibold", r.is_active ? "border-success text-success" : "border-destructive text-destructive")}>
                {r.is_active ? "ACTIF" : "INACTIF"}
              </span>
            )},
          ]}
        />
      </ChartFrame>
    </>
  );
}
