import { ReactNode } from "react";
import { useSite } from "@/context/SiteContext";
import Maintenance from "@/pages/Maintenance";

/**
 * MaintenanceGate — court-circuite le routing quand maintenance === true.
 *
 * Cas gérés :
 *  1. Premier chargement en cours            → spinner (max ~2s sur réseau correct)
 *  2. Chargement échoué (réseau down)        → on laisse passer l'app normalement.
 *     On ne peut pas savoir si le site est en maintenance sans réponse serveur,
 *     donc on fait confiance au cache précédent (data) ou on affiche l'app.
 *     L'OfflineBanner avertit déjà l'utilisateur qu'il est hors ligne.
 *  3. maintenance === true                    → page Maintenance
 *  4. maintenance === false / null            → app normale
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { data, loading } = useSite();

  // Cas 1 : premier chargement uniquement (pas de cache disponible)
  if (!data && loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="size-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Cas 2 : échec réseau sans cache → on laisse l'app s'afficher
  // (OfflineBanner gère la communication à l'utilisateur)
  if (!data && !loading) {
    return <>{children}</>;
  }

  // Cas 3 : maintenance active
  if (data?.maintenance) {
    return <Maintenance />;
  }

  // Cas 4 : nominal
  return <>{children}</>;
}
