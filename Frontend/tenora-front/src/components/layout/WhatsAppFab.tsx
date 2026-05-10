import { useSite } from "@/context/SiteContext";

/**
 * Bouton flottant "Service Client" — style Tenora cubique/pixel.
 *
 * - Cubique (pas de border-radius), ombre brutaliste 6px.
 * - Couleurs : primary (acid green / ambre selon thème) + bordure foreground.
 * - Icône chat-bubble pixel-art SVG (rendu net via shape-rendering: crispEdges).
 * - Label "SERVICE CLIENT" en Teko sur desktop, masqué mobile (icône seule).
 * - Mobile : positionné au-dessus de la MobileTabBar (~76px + safe-area).
 * - Numéro depuis SiteInit.whatsapp_number (backend / panel). Vide => masqué.
 */
export function WhatsAppFab() {
  const { data } = useSite();
  const raw = data?.whatsapp_number?.trim();
  if (!raw) return null;

  const number = raw.replace(/[^\d]/g, "");
  if (!number) return null;

  const href = `https://wa.me/${number}?text=${encodeURIComponent(
    "Bonjour Tenora 👋 j'ai une question"
  )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Service client Tenora sur WhatsApp"
      className="
        group fixed right-4 z-40 inline-flex items-center gap-2
        border-2 border-foreground bg-primary text-primary-foreground
        px-3 py-3 md:px-4 md:py-3
        font-display uppercase tracking-widest text-base md:text-lg leading-none
        shadow-[6px_6px_0_0_hsl(var(--foreground))]
        transition-transform duration-100
        hover:-translate-x-[2px] hover:-translate-y-[2px]
        hover:shadow-[8px_8px_0_0_hsl(var(--foreground))]
        active:translate-x-[2px] active:translate-y-[2px]
        active:shadow-[2px_2px_0_0_hsl(var(--foreground))]
        md:right-6
        bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-6
      "
    >
      {/* Icône chat-bubble pixel-art (16x16 grid) */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden
        className="md:h-6 md:w-6"
        style={{ shapeRendering: "crispEdges" }}
      >
        {/* Top + sides */}
        <rect x="2" y="1" width="12" height="1" />
        <rect x="1" y="2" width="1" height="9" />
        <rect x="14" y="2" width="1" height="9" />
        <rect x="2" y="11" width="6" height="1" />
        <rect x="9" y="11" width="5" height="1" />
        {/* Tail */}
        <rect x="4" y="12" width="4" height="1" />
        <rect x="5" y="13" width="2" height="1" />
        {/* Inner fill */}
        <rect x="2" y="2" width="12" height="9" fillOpacity="0.0" />
        {/* Three dots */}
        <rect x="4" y="6" width="2" height="2" />
        <rect x="7" y="6" width="2" height="2" />
        <rect x="10" y="6" width="2" height="2" />
      </svg>
      <span className="hidden md:inline">Service&nbsp;client</span>
      {/* Pulse discret derrière le bouton */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 animate-pulse-glow"
      />
    </a>
  );
}

export default WhatsAppFab;
