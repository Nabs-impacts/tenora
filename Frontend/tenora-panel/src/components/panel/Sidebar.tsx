// === Remplace Sidebar.tsx en entier (ajout entrée 08 Statistiques) ===
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, FolderTree, Package, ShoppingCart, Inbox, Users, Settings, Zap, Tag, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/",           label: "Dashboard",   icon: LayoutDashboard, code: "00" },
  { to: "/categories", label: "Categories",  icon: FolderTree,      code: "01" },
  { to: "/products",   label: "Produits",    icon: Package,         code: "02" },
  { to: "/orders",     label: "Commandes",   icon: ShoppingCart,    code: "03" },
  { to: "/imports",    label: "Imports",     icon: Inbox,           code: "04" },
  { to: "/users",      label: "Utilisateurs",icon: Users,           code: "05" },
  { to: "/settings",   label: "Parametres",  icon: Settings,        code: "06" },
  { to: "/coupons",    label: "Coupons",     icon: Tag,             code: "07" },
  { to: "/statistics", label: "Statistiques",icon: BarChart2,       code: "08" }, // NEW
];

export function Sidebar() {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r-2 border-sidebar-border bg-sidebar">
      <div className="px-5 py-6 border-b-2 border-sidebar-border">
        <NavLink to="/" className="flex items-center gap-3 group">
          <div className="relative h-10 w-10 bg-primary flex items-center justify-center border-2 border-primary group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] transition-transform">
            <Zap className="h-5 w-5 text-primary-foreground" strokeWidth={3} />
            <span className="absolute inset-0 bg-primary translate-x-1 translate-y-1 -z-10" />
          </div>
          <div className="leading-tight">
            <p className="display text-xl tracking-tight">TENORA</p>
            <p className="eyebrow text-[9px] tracking-[0.4em]" style={{ color: "hsl(var(--muted-foreground))" }}>
              ADMIN.PANEL
            </p>
          </div>
        </NavLink>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="eyebrow px-3 mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>// Navigation</p>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 px-3 py-2.5 border-2 transition-all relative",
                "mono text-xs uppercase tracking-[0.12em] font-semibold",
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
                <span className="flex-1">{item.label}</span>
                {isActive && <span className="status-dot bg-primary-foreground" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t-2 border-sidebar-border p-4">
        <div className="brackets bg-sidebar-accent/40 p-3">
          <p className="eyebrow mb-1">// STATUS</p>
          <div className="flex items-center gap-2 text-xs mono">
            <span className="status-dot bg-success text-success" />
            <span className="text-foreground">All systems nominal</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
