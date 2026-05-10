import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Zap,
  ShieldCheck,
  Truck,
  MessageCircle,
  Star,
  Gamepad2,
  Tv,
  BookOpen,
  ShoppingBag,
  MapPin,
  Headphones,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { productsApi } from "@/lib/api";
import { useSite } from "@/context/SiteContext";
import { ProductCard } from "@/components/product/ProductCard";
import { PaymentLogo } from "@/components/payment/PaymentLogo";

const services = [
  {
    icon: Gamepad2,
    code: "01",
    tag: "Gaming",
    title: "Free Fire, MLBB & Bien d'autres",
    desc: "Drop de diamants sur ID en moins de 60s. Pas besoin de login.",
    price: "Dès 1 500",
    to: "/boutique",
    accent: "magenta",
    big: true,
  },
  {
    icon: Tv,
    code: "02",
    tag: "Streaming",
    title: "Netflix 4K",
    desc: "Activation  rapide, satisfaction garantie.",
    price: "3 500 F",
    to: "/boutique",
    accent: "primary",
  },
  {
    icon: ShoppingBag,
    code: "03",
    tag: "Import",
    title: "Shein / Alibaba",
    desc: "Sans carte. Livré à Niamey Et Partout Au Niger.",
    price: "Devis gratuit",
    to: "/import",
    accent: "cyan",
  },
  {
    icon: BookOpen,
    code: "04",
    tag: "Knowledge",
    title: "Ebooks & Formations",
    desc: "Business, marketing, dev.",
    price: "Dès 1 250 F",
    to: "/ebooks",
    accent: "primary",
  },
] as const;

const accentMap: Record<string, { border: string; text: string; bg: string; shadow: string }> = {
  primary: { border: "hover:border-primary", text: "text-primary", bg: "bg-primary", shadow: "hover:shadow-brut-acid" },
  magenta: { border: "hover:border-secondary", text: "text-secondary", bg: "bg-secondary", shadow: "hover:shadow-brut-magenta" },
  cyan: { border: "hover:border-accent", text: "text-accent", bg: "bg-accent", shadow: "hover:shadow-brut-cyan" },
};

const steps = [
  { n: "01", icon: ShoppingBag, title: "Choisir", desc: "Parcourez la boutique. Ajoutez votre commande au panier." },
  { n: "02", icon: CreditCard, title: "Payer", desc: "Mobile Money — Airtel ou Moov. Confirmation immédiate." },
  { n: "03", icon: Zap, title: "Recevoir", desc: "Activation digitale en minutes. Import sous 24h à Niamey Et Partout Au Niger." },
];

const tickerItems = [
  "Livraison Tres rapide",
  "Paiement Mynita Amanata Mobile-Money & crypto",
  "Support WhatsApp 24/7",
  "+500 clients satisfaits",
  "Note 4.9 / 5",
  "Activation instantanée",
];

const testimonials = [
  { name: "Aminata K.", location: "Niamey · Plateau", text: "Reçu mon Netflix en 3 minutes chrono. Sérieux et fiable." },
  { name: "Ibrahim M.", location: "Niamey · Talladjé", text: "J'avais peur d'être arnaqué — tout s'est passé parfaitement." },
  { name: "Fatouma D.", location: "Niamey · Banifandou", text: "Recharge MLBB instantanée, prix imbattables. Je commande chaque semaine." },
];

const whyUs = [
  { icon: ShieldCheck, title: "100% sécurisé", desc: "Mobile Money,Mynita,Amanata & Crypto." },
  { icon: Headphones, title: "Support humain", desc: "Réponse WhatsApp sous 5 min." },
  { icon: MapPin, title: "Basés à Niamey", desc: "Service local, prix locaux." },
  { icon: Zap, title: "Livraison express", desc: "Digital en minutes, imports dans la semaine." },
];

export default function Home() {
  const { data: site, loading: siteLoading } = useSite();
  const featuredIds = site?.featured_product_ids ?? [];
  const featuredKey = featuredIds.join(",");

  // ⚡ On n'active la query qu'une fois site chargé pour éviter la cascade
  //    "fetch [] puis re-fetch [vraies IDs]" qui doublait l'appel au boot.
  const { data: products = [] } = useQuery({
    queryKey: ["home", "featured", featuredKey],
    enabled: !siteLoading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (featuredIds.length > 0) {
        const res = await productsApi.getByIds(featuredIds);
        const byId = new Map(res.data.map((p) => [p.id, p]));
        return featuredIds
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .slice(0, 8);
      }
      const res = await productsApi.getShopProducts({ sort: "newest" });
      return res.data.slice(0, 8);
    },
  });

  const wa = site?.whatsapp_number?.replace(/\D/g, "") || "";
  const waUrl = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent("Bonjour Tenora, je voudrais passer une commande.")}`
    : "#";

  return (
    <div className="overflow-hidden">
      {/* ========== HERO ========== */}
      <section className="relative bg-gradient-hero border-b-2 border-border">
        <div className="absolute inset-0 bg-grid opacity-[0.07] pointer-events-none" aria-hidden />
        <div className="container-app relative pt-10 pb-16 md:pt-20 md:pb-24">
          <div className="flex items-center gap-3 mb-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 border-2 border-border bg-card px-3 py-1.5">
              <span className="size-2 bg-primary rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">
                Système en ligne · Niamey
              </span>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono">
              <span className="text-secondary">//</span> v.2026.05
            </span>
          </div>

          <h1 className="font-display font-bold text-[clamp(2.25rem,10vw,8rem)] leading-[0.88] uppercase text-balance tracking-tight max-w-6xl animate-fade-up">
            Passez en mode
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-primary">God Tier.</span>
          </h1>

          <div className="mt-10 flex flex-col md:flex-row md:items-end md:justify-between gap-8 animate-fade-up" style={{ animationDelay: "120ms" }}>
            <p className="text-base md:text-xl text-muted-foreground max-w-xl leading-relaxed">
              Recharges gaming instantanées, abonnements premium et imports lifestyle direct.
              <strong className="text-foreground"> Zéro délai. Zéro galère.</strong>
            </p>

            <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 sm:items-center">
              {/* CTA principal — Boutique */}
              <Link to="/boutique" className="group relative inline-flex items-center justify-center shrink-0 brut-btn-shadow w-full sm:w-auto max-w-full">
                <div className="relative bg-background border-2 border-primary text-primary px-6 sm:px-8 py-4 flex items-center justify-center gap-3 transition-colors group-hover:bg-primary group-hover:text-primary-foreground w-full sm:w-auto">
                  <span className="font-display text-2xl sm:text-3xl uppercase font-bold tracking-wider">Start [Boutique]</span>
                  <span className="size-3 bg-primary group-hover:bg-background animate-blink" />
                </div>
              </Link>
            </div>
          </div>

          {/* Stats bar */}
          <dl className="mt-10 md:mt-14 grid grid-cols-3 border-2 border-border bg-card divide-x-2 divide-border animate-fade-up" style={{ animationDelay: "240ms" }}>
            <div className="p-3 sm:p-5 md:p-6">
              <dt className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Clients</dt>
              <dd className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tabular-nums leading-none">+500</dd>
            </div>
            <div className="p-3 sm:p-5 md:p-6">
              <dt className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Activation</dt>
              <dd className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tabular-nums leading-none">{"<"}5<span className="text-xs sm:text-base text-muted-foreground ml-1">min</span></dd>
            </div>
            <div className="p-3 sm:p-5 md:p-6">
              <dt className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Note</dt>
              <dd className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tabular-nums flex items-baseline gap-1 leading-none">
                4.9<Star className="size-4 sm:size-5 fill-primary text-primary" />
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ========== TICKER ========== */}
      <div className="border-b-2 border-border bg-card overflow-hidden py-4 flex relative">
        <div className="flex gap-12 items-center font-display text-2xl md:text-3xl uppercase text-muted-foreground whitespace-nowrap px-8 animate-marquee w-max">
          {[...tickerItems, ...tickerItems].map((t, i) => (
            <span key={i} className="flex items-center gap-12">
              <span className="text-foreground">{t}</span>
              <span className="text-secondary">//</span>
            </span>
          ))}
        </div>
      </div>

      {/* ========== SERVICES — LE LOADOUT ========== */}
      <section className="container-app py-16 md:py-24">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2 font-mono">// 01 — Services</p>
            <h2 className="font-display text-6xl md:text-8xl font-bold uppercase leading-none">Le Loadout</h2>
          </div>
          <Link to="/boutique" className="text-xs uppercase tracking-widest font-bold text-muted-foreground hover:text-primary inline-flex items-center gap-2 group">
            Tout voir <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 auto-rows-[220px] md:auto-rows-[250px]">
          {services.map((s, i) => {
            const Icon = s.icon;
            const a = accentMap[s.accent];
            const big = "big" in s && s.big;
            return (
              <Link
                key={s.title}
                to={s.to}
                style={{ animationDelay: `${i * 80}ms` }}
                className={`group relative ${big ? "md:col-span-7 md:row-span-2" : "md:col-span-5 md:row-span-1"} brut-card overflow-hidden p-6 md:p-8 flex flex-col justify-between animate-fade-up ${a.border} ${a.shadow}`}
              >
                <div className="flex items-start justify-between">
                  <span className={`chip ${a.bg} text-background border-transparent`}>{s.tag}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{s.code}</span>
                </div>
                <div>
                  <Icon className={`size-8 mb-4 ${a.text} group-hover:scale-110 transition-transform`} />
                  <h3 className={`font-display font-bold uppercase leading-[0.85] ${big ? "text-5xl md:text-7xl" : "text-3xl md:text-4xl"}`}>
                    {s.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-3 max-w-md leading-relaxed normal-case tracking-normal">
                    {s.desc}
                  </p>
                  <div className="mt-4 pt-4 border-t-2 border-border flex justify-between items-center">
                    <span className={`font-mono text-xs uppercase tracking-widest font-bold ${a.text}`}>{s.price}</span>
                    <ArrowUpRight className={`size-5 ${a.text} group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform`} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="border-y-2 border-border bg-card relative">
        <div className="absolute inset-0 bg-grid opacity-[0.04] pointer-events-none" aria-hidden />
        <div className="container-app py-16 md:py-24 relative">
          <div className="mb-12">
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2 font-mono">// 02 — Process</p>
            <h2 className="font-display text-5xl md:text-7xl font-bold uppercase leading-none">3 étapes. Point.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {steps.map((s, i) => (
              <div
                key={s.n}
                style={{ animationDelay: `${i * 100}ms` }}
                className="relative brut-card p-6 md:p-8 animate-fade-up hover:shadow-brut-acid hover:border-primary"
              >
                <div className="font-display text-7xl md:text-8xl font-bold text-primary/15 leading-none mb-2">{s.n}</div>
                <s.icon className="size-7 text-primary mb-3" />
                <h3 className="font-display font-bold text-3xl uppercase leading-none mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FEATURED PRODUCTS ========== */}
      {products.length > 0 && (
        <section className="container-app py-16 md:py-24">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2 font-mono">// 03 — Drops</p>
              <h2 className="font-display text-5xl md:text-7xl font-bold uppercase leading-none">Hot Now</h2>
            </div>
            <Link to="/boutique" className="text-xs uppercase tracking-widest font-bold text-muted-foreground hover:text-primary inline-flex items-center gap-2 group">
              Catalogue <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
          <div className="-mx-4 px-4 md:mx-0 md:px-0 flex md:grid md:grid-cols-4 gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory">
            {products.map((p) => (
              <div key={p.id} className="snap-start shrink-0 w-[68%] sm:w-[42%] md:w-auto">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========== TESTIMONIALS ========== */}
      <section className="border-y-2 border-border bg-card">
        <div className="container-app py-16 md:py-24">
          <div className="mb-12">
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2 font-mono">// 04 — Réputation</p>
            <h2 className="font-display text-5xl md:text-7xl font-bold uppercase leading-none">Ils valident.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <div
                key={t.name}
                style={{ animationDelay: `${i * 100}ms` }}
                className="brut-card p-6 md:p-7 flex flex-col animate-fade-up hover:shadow-brut-cyan hover:border-accent"
              >
                <div className="flex gap-0.5 text-primary mb-4">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Star key={k} className="size-4 fill-primary" />
                  ))}
                </div>
                <p className="text-sm leading-relaxed flex-1 normal-case tracking-normal">"{t.text}"</p>
                <div className="flex items-center gap-3 mt-5 pt-5 border-t-2 border-border">
                  <div className="size-10 bg-primary text-primary-foreground flex items-center justify-center font-display font-bold text-xl">
                    {t.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{t.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{t.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== TRUSTED PAYMENTS ========== */}
      <section className="border-y-2 border-border bg-card">
        <div className="container-app py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary font-mono">// Paiement</p>
                <p className="font-display text-2xl md:text-3xl font-bold uppercase leading-none mt-0.5">
                  Méthodes acceptées
                </p>
              </div>
            </div>
            <ul className="flex flex-wrap items-center gap-3 md:gap-4">
              {(site?.payment_methods || [])
                .filter((m) => m.enabled)
                .map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <PaymentLogo methodId={m.id} name={m.name} variant="thumb" />
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground hidden sm:inline">
                      {m.name}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ========== WHY US ========== */}
      <section className="container-app py-16 md:py-24">
        <div className="mb-12">
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2 font-mono">// 05 — Raisons</p>
          <h2 className="font-display text-5xl md:text-7xl font-bold uppercase leading-none">
            Pas d'arnaque.<br />
            <span className="text-transparent bg-clip-text bg-gradient-primary">Que du concret.</span>
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border-2 border-border">
          {whyUs.map((w) => (
            <div key={w.title} className="bg-card p-5 md:p-7 hover:bg-primary/5 transition-colors group">
              <div className="size-11 border-2 border-border bg-background text-primary flex items-center justify-center mb-4 group-hover:border-primary transition-colors">
                <w.icon className="size-5" />
              </div>
              <h3 className="font-display font-bold text-2xl uppercase leading-none mb-2">{w.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section className="container-app pb-16 md:pb-24">
        <div className="relative overflow-hidden bg-primary text-primary-foreground border-2 border-primary">
          <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" aria-hidden />
          <div className="relative p-8 md:p-16 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-3 font-mono">// Ready Player 1 ?</p>
              <h2 className="font-display text-5xl md:text-7xl font-bold uppercase leading-[0.85]">
                Prêt à<br />commander&nbsp;?
              </h2>
              <p className="mt-4 text-base md:text-lg opacity-80 max-w-md">
                +500 clients satisfaits à Niamey. Réponse en moins de 5 minutes.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row md:flex-col gap-4 md:items-end">
              <Button asChild size="lg" className="bg-background text-foreground hover:bg-background border-2 border-background hover-shift font-display uppercase tracking-wider text-2xl h-14 px-8">
                <Link to="/boutique">
                  Ouvrir la boutique <ArrowRight className="size-5" />
                </Link>
              </Button>
              {wa && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-primary-foreground/30 hover:border-primary-foreground text-sm font-bold uppercase tracking-widest transition-colors"
                >
                  <MessageCircle className="size-4" /> Plutôt sur WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
