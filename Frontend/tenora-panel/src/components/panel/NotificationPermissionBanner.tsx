import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";

/**
 * S'affiche une seule fois si la permission navigateur est "default".
 * Disparaît après accord, refus, ou clic sur X.
 * Petit délai avant apparition pour ne pas agresser l'admin au login.
 */
export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    const t = setTimeout(() => setVisible(true), 1_800);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const handleAllow = async () => {
    const perm = await Notification.requestPermission();
    if (perm === "granted" || perm === "denied") setVisible(false);
  };

  return (
    <div className="animate-fade-up flex items-center gap-3 px-4 py-2.5 mb-5
                    border-2 border-primary/30 bg-primary/5">
      {/* Dot animé */}
      <span className="status-dot bg-primary shrink-0" style={{ width: 7, height: 7 }} />

      <Bell className="h-3.5 w-3.5 text-primary shrink-0" />

      <p className="flex-1 mono text-[11px] text-muted-foreground">
        Activez les notifications pour recevoir chaque nouvelle commande en temps réel.
      </p>

      <button
        onClick={handleAllow}
        className="h-7 px-3 border-2 border-primary bg-primary text-primary-foreground
                   mono uppercase tracking-widest text-[9px] font-bold
                   hover:bg-primary/90 transition-colors shrink-0"
      >
        Activer
      </button>

      <button
        onClick={() => setVisible(false)}
        aria-label="Fermer"
        className="h-7 w-7 border-2 border-border flex items-center justify-center
                   hover:border-muted-foreground transition-colors shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
