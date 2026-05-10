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
    // staleTime aligné sur refetchInterval : pendant 60s, naviguer entre pages
    // réutilise le cache au lieu de refaire un appel réseau à chaque mount.
    // Avant (staleTime: 0) : chaque mount déclenchait un refetch superflu.
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    // Pas de retry : si le serveur est down, le polling reprend à 60s.
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
