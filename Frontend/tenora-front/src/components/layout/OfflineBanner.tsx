/**
 * OfflineBanner — détection fiable de la connexion réseau.
 *
 * Stratégie :
 *  - Source primaire  : événements browser "online" / "offline"
 *  - Source secondaire: événement custom "tenora:api-error" dispatché par api.ts
 *    quand une requête échoue sans réponse serveur (ERR_NETWORK / timeout).
 *  - Quand on revient en ligne : invalide toutes les queries React Query pour
 *    que l'UI se rafraîchisse automatiquement.
 *
 * NB : navigator.onLine seul n'est pas fiable (reste true sur réseau captif /
 * lent). On le combine avec les vrais échecs API.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WifiOff, Wifi } from "lucide-react";
import { toast } from "sonner";

export function OfflineBanner() {
  const qc = useQueryClient();
  const [offline, setOffline] = useState(!navigator.onLine);
  const hadOffline = useRef(false);

  const goOffline = useCallback(() => {
    setOffline((prev) => {
      if (!prev) hadOffline.current = true;
      return true;
    });
  }, []);

  const goOnline = useCallback(() => {
    setOffline((prev) => {
      if (prev || hadOffline.current) {
        hadOffline.current = false;
        // Toast discret de reconnexion
        toast.success("Connexion rétablie", {
          icon: <Wifi className="size-4" />,
          duration: 3000,
        });
        // Rafraîchir toutes les données stale en arrière-plan
        qc.invalidateQueries();
      }
      return false;
    });
  }, [qc]);

  useEffect(() => {
    // Événements browser natifs (fiables sur vrai changement réseau)
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    // Événement dispatché par api.ts quand ERR_NETWORK / pas de réponse serveur
    const onApiError = (e: Event) => {
      const ev = e as CustomEvent<{ type: string }>;
      if (ev.detail?.type === "network") goOffline();
    };
    window.addEventListener("tenora:api-error", onApiError);

    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("tenora:api-error", onApiError);
    };
  }, [goOnline, goOffline]);

  if (!offline) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2
                 bg-destructive/90 text-destructive-foreground px-4 py-2 text-sm font-medium
                 backdrop-blur-sm shadow-lg animate-in slide-in-from-top duration-300"
    >
      <WifiOff className="size-4 shrink-0" />
      <span>Pas de connexion — les données affichées peuvent être en cache</span>
    </div>
  );
}
