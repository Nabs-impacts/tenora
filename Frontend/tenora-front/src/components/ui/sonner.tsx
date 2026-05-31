import { Toaster as Sonner, toast } from "sonner";
import type { ComponentProps } from "react";

type ToasterProps = ComponentProps<typeof Sonner>;

/* ══════════════════════════════════════════════════════════════════════
   TENORA — Notifications Cyberpunk v2
   ──────────────────────────────────────────────────────────────────────
   Philosophie :
   • Bordures couleurs cyberpunk, zéro glow / box-shadow
   • Carré net, sans skewX → rendu crisp, swipe natif Sonner intact
   • Bouton fermer intégré sans cadre propre
   • Lisibilité mobile-first (touch targets ≥ 44px)
   • GPU-composited (translateZ) → anticrénelage propre
   ══════════════════════════════════════════════════════════════════════ */

const TENORA_TOAST_CSS = `

  /* ── Conteneur global ─────────────────────────────────────────────── */
  [data-sonner-toaster] {
    --toast-width: min(400px, calc(100vw - 24px));
    width: var(--toast-width) !important;
  }

  @media (max-width: 640px) {
    [data-sonner-toaster][data-x-position="center"] {
      left: 50% !important;
      transform: translateX(-50%) !important;
    }
  }


  /* ═══════════════════════════════════════════════════════════════════
     BASE TOAST
     ─ fond très sombre légèrement teinté par variante (via gradient)
     ─ bordure gauche 3px = identifiant visuel principal
     ─ 3 autres côtés : 1px à 22 % d'opacité
     ─ coins cyberpunk via ::before / ::after
  ═══════════════════════════════════════════════════════════════════ */

  [data-sonner-toast] {
    /* Variables locales héritées par les pseudo-éléments */
    --t-accent:      #00D4FF;
    --t-accent-dim:  rgba(0, 212, 255, 0.22);
    --t-tint:        rgba(0, 212, 255, 0.035);

    font-family: 'Space Grotesk', ui-sans-serif, system-ui !important;
    background:
      linear-gradient(135deg, var(--t-tint) 0%, transparent 55%),
      #09090F !important;
    border-top:    1px solid var(--t-accent-dim) !important;
    border-right:  1px solid var(--t-accent-dim) !important;
    border-bottom: 1px solid var(--t-accent-dim) !important;
    border-left:   3px solid var(--t-accent)     !important;
    border-radius: 2px !important;
    box-shadow:    none !important;

    /* Espace pour le bouton fermer (droite) */
    padding: 13px 42px 13px 15px !important;

    -webkit-font-smoothing: antialiased !important;
    text-rendering: optimizeLegibility !important;

    position: relative !important;
    /* overflow: hidden pour éviter que les pseudo-éléments s'éparpillent
       pendant les animations de sortie / swipe de Sonner */
    overflow: hidden !important;
    min-height: 56px !important;
    width: 100% !important;
    /* PAS de transform ici : Sonner gère lui-même les transforms
       pour le swipe et les animations. Un !important dessus casse tout. */
  }


  /* ── Crochet coin haut-droite (inside overflow:hidden) ───────────── */
  [data-sonner-toast]::before {
    content: '' !important;
    position: absolute !important;
    top:   0 !important;
    right: 0 !important;
    width:  16px !important;
    height: 16px !important;
    border-top:   2px solid var(--t-accent) !important;
    border-right: 2px solid var(--t-accent) !important;
    pointer-events: none !important;
  }

  /* ── Crochet coin bas-gauche (intérieur, léger) ───────────────────── */
  [data-sonner-toast]::after {
    content: '' !important;
    position: absolute !important;
    bottom: 5px !important;
    left:   15px !important;
    width:  10px !important;
    height: 10px !important;
    border-bottom: 1px solid var(--t-accent-dim) !important;
    border-left:   1px solid var(--t-accent-dim) !important;
    pointer-events: none !important;
  }


  /* ═══════════════════════════════════════════════════════════════════
     VARIANTES
  ═══════════════════════════════════════════════════════════════════ */

  /* SUCCESS — lime acide (couleur primaire Tenora) */
  [data-sonner-toast][data-type="success"] {
    --t-accent:     #C8FF00;
    --t-accent-dim: rgba(200, 255, 0, 0.22);
    --t-tint:       rgba(200, 255, 0, 0.035);
  }

  /* ERROR — rouge vif */
  [data-sonner-toast][data-type="error"] {
    --t-accent:     #FF2B4E;
    --t-accent-dim: rgba(255, 43, 78, 0.22);
    --t-tint:       rgba(255, 43, 78, 0.04);
  }

  /* WARNING — ambre */
  [data-sonner-toast][data-type="warning"] {
    --t-accent:     #FFB800;
    --t-accent-dim: rgba(255, 184, 0, 0.22);
    --t-tint:       rgba(255, 184, 0, 0.035);
  }

  /* INFO — cyan (identique au défaut) */
  [data-sonner-toast][data-type="info"] {
    --t-accent:     #00D4FF;
    --t-accent-dim: rgba(0, 212, 255, 0.22);
    --t-tint:       rgba(0, 212, 255, 0.035);
  }


  /* ═══════════════════════════════════════════════════════════════════
     TYPOGRAPHIE
  ═══════════════════════════════════════════════════════════════════ */

  [data-sonner-toast] [data-title] {
    font-family: 'JetBrains Mono', ui-monospace, 'Courier New', monospace !important;
    font-size:      11px    !important;
    font-weight:    700     !important;
    letter-spacing: 0.14em  !important;
    text-transform: uppercase !important;
    color:          var(--t-accent) !important;
    line-height:    1.3 !important;
    -webkit-font-smoothing: antialiased !important;
  }

  [data-sonner-toast] [data-description] {
    font-family: 'Space Grotesk', ui-sans-serif, system-ui !important;
    font-size:   13px !important;
    font-weight: 400  !important;
    color:       rgba(255, 255, 255, 0.70) !important;
    line-height: 1.5  !important;
    margin-top:  3px  !important;
    -webkit-font-smoothing: antialiased !important;
  }


  /* ═══════════════════════════════════════════════════════════════════
     ICÔNE
  ═══════════════════════════════════════════════════════════════════ */

  [data-sonner-toast] [data-icon] {
    color:       var(--t-accent) !important;
    flex-shrink: 0 !important;
    width:  16px !important;
    height: 16px !important;
    -webkit-font-smoothing: antialiased !important;
  }

  [data-sonner-toast] [data-icon] svg {
    width:  16px !important;
    height: 16px !important;
  }


  /* ═══════════════════════════════════════════════════════════════════
     BOUTON FERMER
     Repositionné en haut-droite, INTÉRIEUR du toast.
     Pas de bordure propre, pas de fond visible.
  ═══════════════════════════════════════════════════════════════════ */

  [data-sonner-toast] [data-close-button] {
    position:      absolute  !important;
    top:           10px      !important;
    right:         10px      !important;
    left:          auto      !important;   /* neutralise le left: 0 de Sonner */
    transform:     none      !important;   /* neutralise le translate(-35%,-35%) */

    background:    transparent !important;
    border:        none        !important;
    border-radius: 0           !important;
    box-shadow:    none        !important;
    outline:       none        !important;

    color:   rgba(255, 255, 255, 0.30) !important;
    width:   22px  !important;
    height:  22px  !important;
    padding: 0     !important;
    display: flex  !important;
    align-items:     center  !important;
    justify-content: center  !important;

    cursor:     pointer !important;
    transition: color 0.15s ease !important;

    /* Crisp */
    -webkit-font-smoothing: antialiased !important;
  }

  [data-sonner-toast] [data-close-button]:hover,
  [data-sonner-toast] [data-close-button]:focus-visible {
    background: transparent     !important;
    border:     none            !important;
    color:      var(--t-accent) !important;
  }

  /* Force la bonne taille du SVG ×  */
  [data-sonner-toast] [data-close-button] svg {
    width:        14px  !important;
    height:       14px  !important;
    stroke-width: 2.5   !important;
    flex-shrink:  0     !important;
  }


  /* ═══════════════════════════════════════════════════════════════════
     BOUTONS ACTION / CANCEL
  ═══════════════════════════════════════════════════════════════════ */

  [data-sonner-toast] [data-button] {
    font-family:    'JetBrains Mono', monospace !important;
    font-size:      10px   !important;
    font-weight:    700    !important;
    letter-spacing: 0.12em !important;
    text-transform: uppercase !important;

    background:    var(--t-accent) !important;
    color:         #09090F        !important;
    border:        none           !important;
    border-radius: 1px            !important;
    padding:       5px 12px       !important;
    transition:    opacity 0.15s  !important;
    cursor:        pointer        !important;
  }

  [data-sonner-toast] [data-button]:hover { opacity: 0.82 !important; }

  [data-sonner-toast] [data-cancel] {
    font-family:    'JetBrains Mono', monospace !important;
    font-size:      10px   !important;
    font-weight:    600    !important;
    letter-spacing: 0.12em !important;
    text-transform: uppercase !important;

    background:    transparent              !important;
    color:         rgba(255,255,255,0.50)   !important;
    border:        1px solid rgba(255,255,255,0.15) !important;
    border-radius: 1px                      !important;
    padding:       5px 12px                 !important;
    transition:    border-color 0.15s, color 0.15s !important;
    cursor:        pointer                  !important;
  }

  [data-sonner-toast] [data-cancel]:hover {
    border-color: var(--t-accent)    !important;
    color:        var(--t-accent)    !important;
    background:   transparent        !important;
  }


  /* ═══════════════════════════════════════════════════════════════════
     LOADER (toast.loading)
  ═══════════════════════════════════════════════════════════════════ */

  [data-sonner-toast] [data-loader] {
    color: var(--t-accent) !important;
  }


  /* ═══════════════════════════════════════════════════════════════════
     MOBILE
     Swipe natif Sonner — pas d'override touch nécessaire.
     On s'assure juste d'une taille de texte lisible et d'un touch
     target assez grand pour la croix.
  ═══════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    [data-sonner-toast] {
      padding: 14px 46px 14px 15px !important;
      min-height: 62px !important;
    }

    [data-sonner-toast] [data-description] {
      font-size: 14px !important;
    }

    /* Touch target agrandie pour la croix */
    [data-sonner-toast] [data-close-button] {
      width:  36px !important;
      height: 36px !important;
      top:    4px  !important;
      right:  4px  !important;
    }
  }

`;

const Toaster = ({ ...props }: ToasterProps) => (
  <>
    <style dangerouslySetInnerHTML={{ __html: TENORA_TOAST_CSS }} />
    <Sonner
      theme="dark"
      className="toaster"
      toastOptions={{
        classNames: {
          toast: "group",
          actionButton: "",
          cancelButton: "",
        },
      }}
      {...props}
    />
  </>
);

export { Toaster, toast };
