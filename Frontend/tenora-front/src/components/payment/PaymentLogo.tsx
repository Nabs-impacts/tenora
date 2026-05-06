// Tenora — PaymentLogo
import { cn } from "@/lib/utils";

type Variant = "tile" | "badge" | "thumb";

interface PaymentBrand {
  src?: string;
  bg: string;
  accent: string;
  fallback?: { glyph: string; color: string };
  pad?: string;
  fullBleed?: boolean;
}

const BRANDS: Record<string, PaymentBrand> = {
  wave:    { src: "/icons/wave.svg",        bg: "#1CC7FE", accent: "#1CC7FE", fullBleed: true },
  airtel:  { src: "/icons/airtelMoney.svg", bg: "#FFFFFF", accent: "#E40914", fullBleed: true },
  // Mynita → orange signature
  mynita:  { src: "/icons/Mynita.svg",      bg: "#FFFFFF", accent: "#F58220", fullBleed: true },
  // Amanata → vert vegetal signature
  amanata: { src: "/icons/Amanata.svg",     bg: "#FFFFFF", accent: "#3CB371", fullBleed: true },
  zcash:   { src: "/icons/Zcash.svg",       bg: "#FEE715", accent: "#F4B728", fullBleed: true },
  usdt:    { bg: "#26A17B", accent: "#26A17B", fallback: { glyph: "₮", color: "#FFFFFF" } },
};

const ALIASES: Record<string, keyof typeof BRANDS> = {
  wave: "wave",
  wavemoney: "wave",
  wavesn: "wave",
  airtel: "airtel",
  airtelmoney: "airtel",
  airtelmobile: "airtel",
  mynita: "mynita",
  minita: "mynita",
  amanata: "amanata",
  amana: "amanata",
  zcash: "zcash",
  zec: "zcash",
  usdt: "usdt",
  tether: "usdt",
  usdttrc20: "usdt",
  usdterc20: "usdt",
};

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function resolveBrand(methodId: string, name: string): PaymentBrand | undefined {
  const idKey = normalize(methodId);
  if (ALIASES[idKey]) return BRANDS[ALIASES[idKey]];
  if (BRANDS[idKey]) return BRANDS[idKey];

  const nameKey = normalize(name);
  if (ALIASES[nameKey]) return BRANDS[ALIASES[nameKey]];
  if (BRANDS[nameKey]) return BRANDS[nameKey];

  for (const k of Object.keys(ALIASES)) {
    if (idKey.includes(k) || nameKey.includes(k)) return BRANDS[ALIASES[k]];
  }
  return undefined;
}

interface Props {
  methodId: string;
  name: string;
  variant?: Variant;
  className?: string;
}

const SIZE_CLASSES: Record<Variant, string> = {
  tile:  "size-14 sm:size-16",
  badge: "size-9",
  thumb: "size-12",
};

export function PaymentLogo({ methodId, name, variant = "tile", className }: Props) {
  const brand = resolveBrand(methodId, name);
  const sizeCls = SIZE_CLASSES[variant];

  if (!brand) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-muted text-foreground font-display font-bold border border-border",
          sizeCls,
          className,
        )}
        title={`${name} (${methodId})`}
      >
        {(name || methodId).charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      style={{ backgroundColor: brand.bg }}
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-md ring-1 ring-black/5 shadow-sm shrink-0",
        sizeCls,
        className,
      )}
    >
      {brand.src ? (
        <img
          src={brand.src}
          alt={name}
          loading="lazy"
          className={cn(
            "size-full object-contain",
            brand.fullBleed ? "p-0" : (brand.pad || "p-1.5"),
          )}
        />
      ) : (
        <span
          aria-hidden
          style={{ color: brand.fallback!.color }}
          className="font-display text-3xl font-extrabold leading-none"
        >
          {brand.fallback!.glyph}
        </span>
      )}
    </div>
  );
}

export function getPaymentAccent(methodId: string, name = ""): string | null {
  return resolveBrand(methodId, name)?.accent ?? null;
}
