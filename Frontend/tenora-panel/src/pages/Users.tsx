import { useEffect, useState, useCallback } from "react";
import { Search, Users as UsersIcon, Shield, AtSign, Hash } from "lucide-react";
import { PageHeader } from "@/components/panel/PageHeader";
import { DataCard, DataCardHeader, DataCardContent } from "@/components/panel/DataCard";
import { SkeletonRow } from "@/components/panel/PanelSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUsers, type PanelUser } from "@/lib/api/users";
import { cn } from "@/lib/utils";

export default function Users() {
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getUsers({ page, per_page: pageSize, q: search || undefined });
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetch(); }, [fetch]);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        eyebrow="Administration"
        title="Utilisateurs"
        subtitle={`// ${total} compte(s)`}
      />

      <DataCard>
        <DataCardHeader>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Email ou pseudo..."
              className="pl-9 h-9 rounded-none border-2 mono text-xs"
            />
          </div>
          <span className="chip border-border ml-auto">
            <UsersIcon className="h-3 w-3" /> {total}
          </span>
        </DataCardHeader>

        <DataCardContent>
          {loading ? (
            [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <UsersIcon className="h-8 w-8 mb-2" />
              <p className="text-sm mono">// Aucun utilisateur</p>
            </div>
          ) : (
            <div className="divide-y-2 divide-border">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className={cn(
                    "h-9 w-9 border-2 flex items-center justify-center mono text-xs font-bold shrink-0",
                    u.is_admin
                      ? "border-secondary bg-secondary text-secondary-foreground"
                      : "border-primary/40 bg-primary-soft text-primary"
                  )}>
                    {(u.username || u.email)?.[0]?.toUpperCase() || "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate max-w-[200px] sm:max-w-none">
                        {u.email}
                      </p>

                      {/* ID utilisateur */}
                      <span
                        className="chip border-border text-muted-foreground/70 mono"
                        title="ID utilisateur"
                      >
                        <Hash className="h-2.5 w-2.5" />
                        {u.id}
                      </span>

                      {/* Pseudo en chip à côté de l'email */}
                      {u.username ? (
                        <span
                          className="chip border-primary/40 text-primary bg-primary-soft mono"
                          title="Pseudonyme défini"
                        >
                          <AtSign className="h-2.5 w-2.5" />
                          {u.username}
                        </span>
                      ) : (
                        <span
                          className="chip border-dashed border-border text-muted-foreground/70 mono"
                          title="Aucun pseudo défini"
                        >
                          <AtSign className="h-2.5 w-2.5" />
                          —
                        </span>
                      )}

                      {u.is_admin && (
                        <span className="chip border-secondary/40 text-secondary bg-secondary-soft">
                          <Shield className="h-2.5 w-2.5" /> Admin
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] mono text-muted-foreground mt-0.5">
                      {fmtDate(u.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="eyebrow" style={{ color: "hsl(var(--muted-foreground))" }}>CMD</p>
                      <p className="mono text-sm font-bold">{u.order_count || 0}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > pageSize && (
            <div className="flex items-center justify-center gap-3 p-4 border-t-2 border-border">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded-none border-2 mono uppercase text-[10px] tracking-wider">Prev</Button>
              <span className="mono text-xs">{page} / {Math.ceil(total / pageSize)}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)} className="rounded-none border-2 mono uppercase text-[10px] tracking-wider">Next</Button>
            </div>
          )}
        </DataCardContent>
      </DataCard>
    </div>
  );
}
