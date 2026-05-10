import { useSite } from "@/context/SiteContext";

/**
 * Bouton flottant WhatsApp — version compacte & intuitive.
 *
 * - Icône WhatsApp officielle (immédiatement reconnaissable).
 * - Carré compact 44px (mobile) / 48px (desktop), pas de label permanent.
 * - Tooltip "Service client" qui apparaît au hover (desktop).
 * - Style Tenora cubique conservé : bordure 2px, ombre brutaliste, fond primary.
 * - Mobile : positionné au-dessus de la MobileTabBar (~76px + safe-area).
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
      title="Service client"
      className="
        group fixed right-4 z-40 inline-flex items-center justify-center
        h-11 w-11 md:h-12 md:w-12
        border-2 border-foreground bg-primary text-primary-foreground
        shadow-[4px_4px_0_0_hsl(var(--foreground))]
        transition-transform duration-100
        hover:-translate-x-[2px] hover:-translate-y-[2px]
        hover:shadow-[6px_6px_0_0_hsl(var(--foreground))]
        active:translate-x-[1px] active:translate-y-[1px]
        active:shadow-[2px_2px_0_0_hsl(var(--foreground))]
        md:right-6
        bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-6
      "
    >
      {/* Logo WhatsApp officiel — instantanément reconnaissable */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className="md:h-6 md:w-6"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413Z" />
      </svg>

      {/* Tooltip au hover (desktop uniquement) */}
      <span
        className="
          pointer-events-none absolute right-full mr-3 hidden md:inline-block
          whitespace-nowrap border-2 border-foreground bg-background text-foreground
          px-2 py-1 font-display uppercase tracking-widest text-xs leading-none
          shadow-[3px_3px_0_0_hsl(var(--foreground))]
          opacity-0 translate-x-1 transition-all duration-150
          group-hover:opacity-100 group-hover:translate-x-0
        "
      >
        Service&nbsp;client
      </span>
    </a>
  );
}

export default WhatsAppFab;
