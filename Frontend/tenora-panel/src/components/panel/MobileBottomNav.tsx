/**
 * Bottom navigation mobile — 5 entrées prioritaires + bouton "Plus" qui ouvre
 * le drawer pour le reste. Évite le drawer obligatoire à chaque navigation et
 * désengorge le Topbar.
 *
 * Cibles tactiles 56px haut, safe-area iOS gérée.
 */
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, Tag, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { to: "/",         label: "Home",     icon: LayoutDashboard },
  { to: "/products", label: "Produits", icon: Package },
  { to: "/orders",   label: "Cmd.",     icon: ShoppingCart },
  { to: "/coupons",  label: "Coupons",  icon: Tag },
];

interface Props { onMore: () => void; }

export function MobileBottomNav({ onMore }: Props) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-sidebar/95 backdrop-blur border-t-2 border-sidebar-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {PRIMARY.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 h-14 mono text-[9px] uppercase tracking-wider tap-target",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="h-5 w-5" strokeWidth={isActive ? 3 : 2} />
                  <span className="font-semibold">{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button
            onClick={onMore}
            className="w-full flex flex-col items-center justify-center gap-1 h-14 mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground tap-target"
            aria-label="Plus"
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
            <span className="font-semibold">Plus</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
