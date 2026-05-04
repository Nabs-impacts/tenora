/**
 * Topbar — refonte mobile.
 *
 * Avant : burger + brand + horloge + email + avatar + logout sur 56px → trop
 * dense, nombreux mis-clics, surtout sur 360-375px.
 *
 * Après (mobile) : juste brand TENORA centré + avatar/initiale qui ouvre un
 * petit menu (logout). Le burger disparaît ; la navigation se fait via la
 * BottomNav. Hauteur 52px → respire mieux et libère 4px verticaux.
 *
 * Desktop inchangé.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Zap } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { toast } from "sonner";
import { MobileDrawer } from "./MobileDrawer";

interface Props {
  /** Permet à PanelLayout de piloter l'ouverture du drawer (bouton "Plus" du bottom-nav). */
  drawerOpen: boolean;
  onDrawerToggle: (open: boolean) => void;
}

export function Topbar({ drawerOpen, onDrawerToggle }: Props) {
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success("Deconnecte");
    navigate("/login");
  };

  const ts = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/85 backdrop-blur-xl">
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 h-13 lg:h-14" style={{ height: "52px" }}>
          {/* Mobile brand centré, sans burger (la nav est en bottom) */}
          <div className="lg:hidden flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 bg-primary flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-primary-foreground" strokeWidth={3} />
            </div>
            <span className="display text-lg truncate">TENORA</span>
          </div>

          {/* Desktop breadcrumb */}
          <div className="hidden lg:flex items-center gap-3 mono text-xs">
            <span className="text-muted-foreground">SYS://</span>
            <span className="text-primary">tenora.admin</span>
            <span className="text-muted-foreground animate-blink">_</span>
          </div>

          <div className="flex-1" />

          <div className="hidden md:flex items-center gap-2 chip border-border">
            <span className="status-dot bg-success text-success" />
            <span>{ts}</span>
          </div>

          {/* Desktop : email + logout. Mobile : avatar tap = menu */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-xs font-semibold truncate max-w-[160px]">{user?.email}</span>
              <span className="eyebrow text-[9px]">ADMIN</span>
            </div>
            <div className="h-9 w-9 bg-primary text-primary-foreground border-2 border-primary flex items-center justify-center mono font-bold shrink-0">
              {user?.email?.[0]?.toUpperCase() || "?"}
            </div>
            <button
              onClick={handleLogout}
              className="h-9 w-9 border-2 border-border hover:border-destructive hover:text-destructive flex items-center justify-center transition-colors shrink-0 tap-target"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile : avatar */}
          <div className="lg:hidden relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="h-10 w-10 bg-primary text-primary-foreground border-2 border-primary flex items-center justify-center mono font-bold tap-target"
              aria-label="Compte"
            >
              {user?.email?.[0]?.toUpperCase() || "?"}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-40 w-56 bg-popover border-2 border-border shadow-lg">
                  <div className="p-3 border-b-2 border-border">
                    <p className="eyebrow mb-1">// CONNECTÉ</p>
                    <p className="mono text-xs truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-2 p-3 mono text-xs uppercase tracking-wider text-destructive hover:bg-destructive/10 tap-target"
                  >
                    <LogOut className="h-4 w-4" /> Déconnexion
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <MobileDrawer
        open={drawerOpen}
        email={user?.email}
        onClose={() => onDrawerToggle(false)}
        onLogout={handleLogout}
      />
    </>
  );
}
