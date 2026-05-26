import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, Loader2, Mail, Lock, Phone, AtSign, Info, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { TenoraLogo } from "@/components/brand/TenoraLogo";
import { toast } from "sonner";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const usernameValid = username === "" || USERNAME_RE.test(username);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      setError("Vous devez accepter les conditions d'utilisation et la politique de confidentialité.");
      return;
    }
    if (username && !USERNAME_RE.test(username)) {
      setError("Pseudo invalide : 3 à 20 caractères, lettres, chiffres, _ ou -.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await register(email, password, phone || undefined, username || undefined);
      toast.success("Compte créé ! Vérifiez votre email.");
      navigate("/verifier-email");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Impossible de créer le compte.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[80vh] flex items-center justify-center py-10 md:py-16 overflow-hidden">
      {/* Grille d'arrière-plan */}
      <div className="absolute inset-0 bg-grid opacity-[0.07] pointer-events-none" aria-hidden />
      {/* Halos ambiants */}
      <div className="absolute -top-16 left-[-8%] w-[26rem] h-[26rem] rounded-full bg-primary/8 blur-[80px] pointer-events-none" aria-hidden />
      <div className="absolute bottom-0 right-[-5%] w-80 h-80 rounded-full bg-primary/6 blur-[70px] pointer-events-none" aria-hidden />
      {/* Ligne de décoration */}
      <div className="absolute top-2/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent pointer-events-none" aria-hidden />

      {/* Carte */}
      <div className="relative z-10 w-full max-w-md mx-4 card-elev p-6 md:p-8">
        <div className="flex flex-col items-center text-center mb-7">
          <TenoraLogo className="text-2xl mb-4" />
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight">Créer un compte</h1>
          <p className="text-sm text-muted-foreground mt-1">Commencez à commander en 30 secondes.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm px-3 py-2">
              {typeof error === "string" ? error : "Erreur"}
            </div>
          )}

          <div>
            <label htmlFor="register-email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 pl-10 pr-3 bg-input border border-border text-base focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-username" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Pseudonyme <span className="text-muted-foreground/60 normal-case font-normal tracking-normal">(optionnel)</span>
            </label>
            <div className="relative mt-1.5">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                id="register-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: tenora_fan"
                maxLength={20}
                className={`w-full h-11 pl-10 pr-3 bg-input border text-base focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors ${
                  usernameValid ? "border-border focus:border-primary" : "border-destructive/60 focus:border-destructive"
                }`}
              />
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-1.5">
              <Info className="size-3 mt-0.5 shrink-0" />
              <span>3–20 caractères : lettres, chiffres, <code>_</code> ou <code>-</code>. <strong>Définitif une fois enregistré.</strong></span>
            </p>
          </div>

          <div>
            <label htmlFor="register-phone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Téléphone <span className="text-muted-foreground/60 normal-case font-normal tracking-normal">(optionnel)</span>
            </label>
            <div className="relative mt-1.5">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                id="register-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="XXXXXXXX"
                className="w-full h-11 pl-10 pr-3 bg-input border border-border text-base focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mot de passe</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                id="register-password"
                name="password"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 pl-10 pr-11 bg-input border border-border text-base focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "Masquer" : "Afficher"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">8 caractères minimum.</p>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed cursor-pointer select-none border-2 border-border hover:border-primary/60 transition-colors p-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 size-4 accent-primary cursor-pointer shrink-0"
            />
            <span>
              En m'inscrivant, j'accepte la{" "}
              <Link to="/legal#confidentialite" target="_blank" className="text-primary font-bold hover:underline">
                politique de confidentialité
              </Link>{" "}
              et les{" "}
              <Link to="/legal#conditions" target="_blank" className="text-primary font-bold hover:underline">
                conditions d'utilisation
              </Link>{" "}
              de Tenora.
            </span>
          </label>

          <Button
            type="submit"
            disabled={loading || !accepted || !usernameValid}
            size="lg"
            className="w-full h-12 bg-gradient-primary text-primary-foreground shadow-glow disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Créer mon compte
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground mt-5 pt-5 border-t border-border">
          Déjà inscrit ?{" "}
          <Link to="/connexion" className="text-primary font-bold hover:underline">
            Se connecter →
          </Link>
        </p>
      </div>
    </div>
  );
}
