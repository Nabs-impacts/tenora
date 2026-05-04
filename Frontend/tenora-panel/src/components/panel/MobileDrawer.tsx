/**
 * Drawer mobile (gauche).
 *
 * Améliorations UX :
 *  - Items 48px (vs 36px) : respecte la cible de tap iOS/Android
 *  - Icône code "00..07" gauche pour scan rapide
 *  - Bouton fermer 44px haut droite, plus loin de la 1ère entrée (évite mis-clic)
 *  - Animation slide + backdrop tap-to-close (déjà OK)
 *  - safe-area-inset-bottom pour iOS notch
 */
import { NavLink } from "react-router-dom";
import { LogOut, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "./Sidebar";

interface Props {
  open: boolean;
  email?: string | null;
  onClose: () => void;
  onLogout: () => void;
}

export function MobileDrawer({ open, email, onClose, onLogout }: Props) {
  if (!open) return null;
  return (
    <div
      className="lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur"
      onClick={onClose}
    >
      <aside
        className="absolute inset-y-0 left-0 w-[88vw] max-w-sm bg-sidebar border-r-2 border-sidebar-border flex flex-col animate-slide-in"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — espacé pour éviter les mis-clics */}
        <div className="flex items-center justify-between p-5 border-b-2 border-sidebar-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-10 w-10 bg-primary flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-primary-foreground" strokeWidth={3} />
            </div>
            <div className="min-w-0">
              <p className="display text-lg leading-none truncate">TENORA</p>
              <p className="eyebrow text-[9px]" style={{ color: "hsl(var(--muted-foreground))" }}>ADMIN.PANEL</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-11 w-11 border-2 border-border flex items-center justify-center tap-target"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Profil compact */}
        {email && (
          <div className="px-5 pt-4">
            <div className="brackets bg-sidebar-accent/40 p-3">
              <p className="eyebrow mb-1">// CONNECTÉ</p>
              <p className="text-xs mono truncate">{email}</p>
            </div>
          </div>
        )}

        {/* Nav — items hauts (48px) avec gap respiré */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-4 h-12 border-2 mono text-xs uppercase tracking-[0.12em] font-semibold transition-colors tap-target",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-transparent text-sidebar-foreground hover:border-sidebar-border hover:bg-sidebar-accent"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("text-[9px] tracking-widest", isActive ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {item.code}
                  </span>
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                  <span className="flex-1 truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer logout — séparé visuellement, plus loin de la nav */}
        <div className="p-4 border-t-2 border-sidebar-border">
          <button
            onClick={() => { onClose(); onLogout(); }}
            className="w-full flex items-center justify-center gap-2 h-12 border-2 border-border hover:border-destructive hover:text-destructive mono text-xs uppercase tracking-[0.12em] font-semibold transition-colors tap-target"
          >
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </aside>
    </div>
  );
}
