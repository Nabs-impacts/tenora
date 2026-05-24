import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, ShoppingBag, User, LogOut, Package, BookOpen, Truck, Sun, Moon } from "lucide-react";
import { useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { TenoraLogo } from "@/components/brand/TenoraLogo";
import { cn } from "@/lib/utils";

const links = [
  { to: "/boutique", label: "Boutique", icon: ShoppingBag },
  { to: "/ebooks", label: "Ebooks", icon: BookOpen },
  { to: "/import", label: "Import", icon: Truck },
];

function useTheme() {
  const [isLight, setIsLight] = useState<boolean>(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("light")
  );

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("light");
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("tenora-theme", next ? "light" : "dark");
    } catch {}
    setIsLight(next);
  }, []);

  return { isLight, toggle };
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isLight, toggle } = useTheme();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 bg-background/95 md:bg-background/85 backdrop-blur-xl border-b-2 border-border">
      <div className="container-app h-14 md:h-16 flex items-center justify-between gap-3">
        <Link
          to="/"
          className="flex items-center gap-2 shrink-0 group"
          aria-label="Tenora — accueil"
        >
          <TenoraLogo className="text-2xl md:text-3xl transition-colors group-hover:opacity-80" />
        </Link>

        <nav
          className="hidden md:flex items-center gap-1"
          aria-label="Navigation principale"
        >
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  "px-3 lg:px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition-colors border-2",
                  isActive
                    ? "text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Toggle thème — affiche le mode actif, cliquer bascule */}
          <button
            onClick={toggle}
            aria-label={isLight ? "Passer en mode sombre" : "Passer en mode clair"}
            className={cn(
              "hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 border-2",
              "text-[10px] font-bold uppercase tracking-widest font-mono transition-colors",
              isLight
                ? "border-amber-400/60 text-amber-500 hover:border-amber-400 hover:bg-amber-400/10"
                : "border-primary/60 text-primary hover:border-primary hover:bg-primary/10"
            )}
          >
            {isLight ? <Sun className="size-3" /> : <Moon className="size-3" />}
            {isLight ? "Clair" : "Sombre"}
          </button>

          {user ? (
            <div className="hidden md:flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="uppercase tracking-wider text-xs">
                <Link to="/mes-commandes">
                  <Package className="size-4" />
                  Commandes
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="uppercase tracking-wider text-xs max-w-[140px]"
              >
                <Link to="/profil" className="truncate">
                  <User className="size-4 shrink-0" />
                  <span className="truncate">{user.email.split("@")[0]}</span>
                </Link>
              </Button>
              <Button onClick={handleLogout} variant="outline" size="sm" aria-label="Se déconnecter">
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="uppercase tracking-wider text-xs">
                <Link to="/connexion">Connexion</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary uppercase tracking-[0.08em] text-xs font-bold border-2 border-primary hover-shift whitespace-nowrap"
              >
                <Link to="/inscription">
                  S'inscrire<span className="ml-1">→</span>
                </Link>
              </Button>
            </div>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="md:hidden border-2"
                aria-label="Ouvrir le menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[88%] max-w-sm p-0 bg-sidebar border-l-2 border-sidebar-border"
            >
              <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
              <div className="flex items-center justify-between p-4 pr-14 border-b-2 border-sidebar-border">
                <TenoraLogo className="text-xl" />
              </div>
              {/* Toggle thème — rangée dédiée pour ne pas se confondre avec la croix de fermeture */}
              <div className="px-3 pt-3">
                <button
                  onClick={toggle}
                  aria-label={isLight ? "Passer en mode sombre" : "Passer en mode clair"}
                  className="w-full inline-flex items-center justify-between gap-2 px-3 py-2.5 border-2 border-sidebar-border text-[11px] font-bold uppercase tracking-widest font-mono transition-colors hover:bg-sidebar-accent"
                >
                  <span className="flex items-center gap-2">
                    {isLight ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    Thème · {isLight ? "Clair" : "Sombre"}
                  </span>
                  <span className="px-2 py-0.5 border-2 border-primary text-primary text-[9px]">
                    Basculer
                  </span>
                </button>
              </div>
              <div className="p-3 space-y-1">
                {links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-3 border-2 text-sm font-bold uppercase tracking-wider",
                        isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent"
                      )
                    }
                  >
                    <l.icon className="size-5" /> {l.label}
                  </NavLink>
                ))}
              </div>
              <div className="p-3 border-t-2 border-sidebar-border space-y-2">
                {user ? (
                  <>
                    <Link
                      onClick={() => setOpen(false)}
                      to="/profil"
                      className="flex items-center gap-3 px-3 py-3 text-sm font-bold uppercase tracking-wider hover:bg-sidebar-accent"
                    >
                      <User className="size-5" /> Mon profil
                    </Link>
                    <Link
                      onClick={() => setOpen(false)}
                      to="/mes-commandes"
                      className="flex items-center gap-3 px-3 py-3 text-sm font-bold uppercase tracking-wider hover:bg-sidebar-accent"
                    >
                      <Package className="size-5" /> Mes commandes
                    </Link>
                    <Button
                      variant="outline"
                      className="w-full border-2 uppercase tracking-wider text-xs"
                      onClick={() => {
                        setOpen(false);
                        handleLogout();
                      }}
                    >
                      <LogOut className="size-4" /> Se déconnecter
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline" className="w-full border-2 uppercase tracking-wider text-xs">
                      <Link onClick={() => setOpen(false)} to="/connexion">
                        Se connecter
                      </Link>
                    </Button>
                    <Button
                      asChild
                      className="w-full bg-primary text-primary-foreground border-2 border-primary uppercase tracking-wider text-xs font-bold"
                    >
                      <Link onClick={() => setOpen(false)} to="/inscription">
                        Créer un compte →
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
