import { createContext, ReactNode, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { siteApi, type SiteInit } from "@/lib/api";

export const SITE_QUERY_KEY = ["site", "init"] as const;

interface SiteCtx {
  data: SiteInit | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SiteCtx | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SITE_QUERY_KEY,
    queryFn: () => siteApi.getInit().then((r) => r.data),
    // 10 min en cache — les settings site (maintenance, annonce, paiements)
    // changent rarement. Pas de polling actif : on recharge à la reconnexion
    // et manuellement via refresh() depuis le panel admin si besoin.
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    // Recharge automatiquement quand la connexion revient (combiné avec OfflineBanner
    // qui invalide toutes les queries au retour en ligne)
    refetchOnReconnect: true,
    retry: false,
  });

  const value = useMemo<SiteCtx>(
    () => ({
      data: data ?? null,
      loading: isLoading,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: SITE_QUERY_KEY });
      },
    }),
    [data, isLoading, qc]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSite() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSite must be used inside SiteProvider");
  return v;
}
