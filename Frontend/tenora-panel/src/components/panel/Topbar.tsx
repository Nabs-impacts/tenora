/**
 * Topbar mobile :
 *  - Burger 3 traits à gauche → ouvre le MobileDrawer (navigation)
 *  - Brand TENORA au centre/à côté du burger
 *  - Avatar à droite → menu compte/déconnexion
 *
 * Desktop inchangé.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Menu, Zap } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { toast } from "sonner";
import { MobileDrawer } from "./MobileDrawer";

interface Props {
  /** Permet à PanelLayout de piloter l'ouverture du drawer. */
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
          {/* Mobile : burger 3 traits + brand */}
          <div className="lg:hidden flex items-center gap-2 min-w-0">
            <button
              onClick={() => onDrawerToggle(!drawerOpen)}
              className="h-10 w-10 border-2 border-border bg-background hover:border-primary hover:text-primary flex items-center justify-center shrink-0 tap-target transition-colors"
              aria-label="Ouvrir le menu"
              aria-expanded={drawerOpen}
            >
              <Menu className="h-5 w-5" strokeWidth={2.5} />
            </button>
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
