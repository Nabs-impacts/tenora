import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authApi, ordersApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Mail,
  Phone,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  LogOut,
  AtSign,
  Lock,
  Info,
  Package,
  Clock,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(user?.phone || "");
  const [username, setUsername] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  const { data: orders = [] } = useQuery({
    queryKey: ["orders", "my"],
    queryFn: () => ordersApi.myOrders().then((r) => r.data),
    enabled: !!user,
    staleTime: 60_000,
  });

  if (!user) return null;

  const hasUsername = !!user.username;
  const usernameValid = username === "" || USERNAME_RE.test(username);

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "pending" || o.status === "processing").length;
  const completedOrders = orders.filter((o) => o.status === "completed").length;

  const displayName = user.username ? `@${user.username}` : user.email.split("@")[0];
  const initial = (user.username || user.email).charAt(0).toUpperCase();

  const savePhone = async () => {
    setSavingPhone(true);
    try {
      const r = await authApi.updateProfile({ phone });
      setUser(r.data);
      toast.success("Téléphone mis à jour.");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Erreur.");
    } finally {
      setSavingPhone(false);
    }
  };

  const saveUsername = async () => {
    if (!USERNAME_RE.test(username)) { toast.error("Pseudo invalide."); return; }
    if (!window.confirm(`Confirmer le pseudo « ${username} » ?\n\nUne fois enregistré, il ne pourra plus jamais être modifié.`)) return;
    setSavingUsername(true);
    try {
      const r = await authApi.updateProfile({ username });
      setUser(r.data);
      toast.success("Pseudo enregistré définitivement.");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Erreur.");
    } finally {
      setSavingUsername(false);
    }
  };

  return (
    <div className="container-app py-8 md:py-12 max-w-3xl space-y-6">

      {/* ── EN-TÊTE ─────────────────────────────────────────────────── */}
      <div className="card-elev p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {/* Avatar éditorial — pas de bulle gradient, juste propre */}
        <div className="relative shrink-0">
          <div className="size-16 border-2 border-border bg-card flex items-center justify-center">
            <span className="font-display text-2xl font-bold text-foreground leading-none select-none">
              {initial}
            </span>
          </div>
          {/* Dot statut */}
          {user.is_verified && (
            <span
              className="absolute -bottom-1 -right-1 size-4 bg-success border-2 border-background"
              title="Compte vérifié"
              aria-label="Compte vérifié"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <h1 className="font-display text-xl md:text-2xl font-bold truncate">{displayName}</h1>
            {user.is_verified ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-success border border-success/40 bg-success/10 px-2 py-0.5">
                <ShieldCheck className="size-3" /> Vérifié
              </span>
            ) : (
              <button
                onClick={() => navigate("/verifier-email")}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-warning border border-warning/40 bg-warning/10 px-2 py-0.5"
              >
                <ShieldAlert className="size-3" /> À vérifier
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        </div>

        <Link
          to="/mes-commandes"
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2 border-2 border-border text-xs font-bold uppercase tracking-wider hover:border-primary hover:text-primary transition-colors shrink-0"
        >
          <Package className="size-4" /> Mes commandes <ChevronRight className="size-3" />
        </Link>
      </div>

      {/* ── STATS COMMANDES ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={Package}
          label="Total"
          value={totalOrders}
          color="default"
          to="/mes-commandes"
        />
        <StatCard
          icon={Clock}
          label="En cours"
          value={pendingOrders}
          color={pendingOrders > 0 ? "amber" : "default"}
          to="/mes-commandes"
        />
        <StatCard
          icon={CheckCircle2}
          label="Livrées"
          value={completedOrders}
          color={completedOrders > 0 ? "success" : "default"}
          to="/mes-commandes"
        />
      </div>

      {/* Lien rapide commandes (mobile) */}
      <Link
        to="/mes-commandes"
        className="sm:hidden flex items-center justify-between px-4 py-3 border-2 border-border hover:border-primary hover:text-primary transition-colors text-sm font-bold uppercase tracking-wider"
      >
        <span className="flex items-center gap-2"><Package className="size-4" /> Voir mes commandes</span>
        <ArrowRight className="size-4" />
      </Link>

      {/* ── IDENTITÉ + PARAMÈTRES ────────────────────────────────────── */}
      <div className="grid md:grid-cols-5 gap-4">

        {/* Identité — colonne principale */}
        <div className="md:col-span-3 card-elev p-5 space-y-5">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground border-b-2 border-border pb-2">
            Identité
          </h2>

          {/* Email */}
          <div className="flex items-center gap-3">
            <Mail className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm truncate">{user.email}</span>
          </div>

          {/* Pseudo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
                <AtSign className="size-3.5" /> Pseudonyme
              </label>
              {hasUsername && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Lock className="size-3" /> Verrouillé
                </span>
              )}
            </div>

            {hasUsername ? (
              <div className="bg-muted/40 border border-border px-3 py-2.5 font-display text-sm text-foreground">
                @{user.username}
              </div>
            ) : (
              <>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ex: tenora_fan"
                    maxLength={20}
                    className={`w-full h-11 pl-10 pr-3 bg-input border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      usernameValid ? "border-border focus:border-primary" : "border-destructive/60"
                    }`}
                  />
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="size-3 mt-0.5 shrink-0" />
                  <span>3–20 caractères. <strong className="text-foreground">Définitif une fois enregistré.</strong></span>
                </p>
                <Button
                  onClick={saveUsername}
                  disabled={savingUsername || !username || !usernameValid}
                  size="sm"
                  className="w-full bg-gradient-primary text-primary-foreground"
                >
                  {savingUsername ? <Loader2 className="size-3.5 animate-spin" /> : <AtSign className="size-3.5" />}
                  Définir mon pseudo
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Paramètres — colonne secondaire */}
        <div className="md:col-span-2 space-y-4">
          {/* Téléphone */}
          <div className="card-elev p-5 space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground border-b-2 border-border pb-2">
              Téléphone
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Utilisé pour le suivi WhatsApp de vos commandes.
            </p>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="XXXXXXXX"
                className="w-full h-10 pl-10 pr-3 bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
            <Button
              onClick={savePhone}
              disabled={savingPhone}
              size="sm"
              variant="outline"
              className="w-full border-2"
            >
              {savingPhone ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>

          {/* Déconnexion */}
          <Button
            onClick={async () => { await logout(); navigate("/"); }}
            variant="outline"
            className="w-full border-2 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            <LogOut className="size-4" /> Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Composant stat card ─────────────────────────────────── */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  to,
}: {
  icon: any;
  label: string;
  value: number;
  color: "default" | "amber" | "success";
  to: string;
}) {
  const colorMap = {
    default: "border-border text-muted-foreground",
    amber: "border-amber-500/40 text-amber-500",
    success: "border-success/40 text-success",
  };
  const iconColor = {
    default: "text-muted-foreground",
    amber: "text-amber-500",
    success: "text-success",
  };
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-1.5 p-4 border-2 card-elev hover:border-primary transition-colors text-center group ${colorMap[color]}`}
    >
      <Icon className={`size-5 ${iconColor[color]} group-hover:text-primary transition-colors`} />
      <span className="font-display text-2xl font-bold text-foreground leading-none">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    </Link>
  );
}
