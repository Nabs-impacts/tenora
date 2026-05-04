/**
 * Page Coupons — admin
 *
 * UX volontairement compact-mobile-first :
 *  - liste sous forme de cartes (pas de table) → ne déborde pas en 320px
 *  - création/édition via Sheet bottom sur mobile (Dialog sur desktop)
 *  - 1 seule requête `/panel/coupons` au mount (cache 60s)
 *  - mutations → invalidation ciblée (pas de refetch global)
 *  - liste produits/catégories partagée avec les autres pages (cache global)
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Copy, Tag, Search, X } from "lucide-react";
import { format } from "date-fns";

import { PageHeader } from "@/components/panel/PageHeader";
import { DataCard, DataCardHeader, DataCardContent } from "@/components/panel/DataCard";
import { SkeletonRow } from "@/components/panel/PanelSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

import { getCoupons, createCoupon, updateCoupon, deleteCoupon, type Coupon, type CouponPayload } from "@/lib/api/coupons";
import { getCategories } from "@/lib/api/categories";
import { getProducts } from "@/lib/api/products";

type DiscountType = "percent" | "amount";

const empty = {
  code: "",
  code_length: 10,
  discount_type: "percent" as DiscountType,
  discount_value: "",
  user_id: "",
  max_uses: "",
  expires_at: "",
  is_active: true,
  product_ids: [] as number[],
  category_ids: [] as number[],
};

export default function CouponsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(empty);
  const [delTarget, setDelTarget] = useState<Coupon | null>(null);

  // ── Données ────────────────────────────────────────────────────────────
  const couponsQ = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => (await getCoupons()).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Catégories/produits : on profite du cache déjà alimenté par les autres pages
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await getCategories()).data ?? [],
    staleTime: 5 * 60_000,
  });
  const productsQ = useQuery({
    queryKey: ["products", {}],
    queryFn: async () => (await getProducts()).data ?? [],
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    const items = couponsQ.data ?? [];
    if (!search.trim()) return items;
    const s = search.toUpperCase();
    return items.filter((c) => c.code.includes(s));
  }, [couponsQ.data, search]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["coupons"] });

  const createM = useMutation({
    mutationFn: (data: CouponPayload) => createCoupon(data),
    onSuccess: () => { invalidate(); toast.success("Coupon créé."); setShowForm(false); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Erreur création."),
  });
  const updateM = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CouponPayload }) => updateCoupon(id, data),
    onSuccess: () => { invalidate(); toast.success("Coupon mis à jour."); setShowForm(false); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Erreur mise à jour."),
  });
  const deleteM = useMutation({
    mutationFn: (id: number) => deleteCoupon(id),
    onSuccess: () => { invalidate(); toast.success("Coupon supprimé."); setDelTarget(null); },
    onError: () => toast.error("Erreur suppression."),
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setShowForm(true);
  };
  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      code_length: 10,
      discount_type: c.discount_percent != null ? "percent" : "amount",
      discount_value: String(c.discount_percent ?? c.discount_amount ?? ""),
      user_id: c.user_id ? String(c.user_id) : "",
      max_uses: c.max_uses ? String(c.max_uses) : "",
      expires_at: c.expires_at ? c.expires_at.slice(0, 16) : "",
      is_active: c.is_active,
      product_ids: c.product_ids,
      category_ids: c.category_ids,
    });
    setShowForm(true);
  };

  const submit = () => {
    const value = parseFloat(form.discount_value);
    if (isNaN(value) || value <= 0) {
      toast.error("Renseignez une valeur de réduction valide.");
      return;
    }
    const payload: CouponPayload = {
      discount_percent: form.discount_type === "percent" ? value : null,
      discount_amount:  form.discount_type === "amount"  ? value : null,
      user_id:    form.user_id ? Number(form.user_id) : null,
      max_uses:   form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active:  form.is_active,
      product_ids:  form.product_ids,
      category_ids: form.category_ids,
    };

    if (editing) {
      updateM.mutate({ id: editing.id, data: payload });
    } else {
      payload.code = form.code.trim() || undefined;
      payload.code_length = form.code_length;
      createM.mutate(payload);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(
      () => toast.success(`${code} copié`),
      () => toast.error("Impossible de copier"),
    );
  };

  const togglePid = (id: number) =>
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(id) ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id],
    }));
  const toggleCid = (id: number) =>
    setForm((f) => ({
      ...f,
      category_ids: f.category_ids.includes(id) ? f.category_ids.filter((x) => x !== id) : [...f.category_ids, id],
    }));

  const totalActive = (couponsQ.data ?? []).filter((c) => c.is_active).length;

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader
        title="Coupons"
        eyebrow="// 07 — promotions"
        action={
          <Button onClick={openCreate} className="brut-btn rounded-none border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 tap-target">
            <Plus className="h-4 w-4 mr-2" /> Nouveau
          </Button>
        }
      />

      <DataCard className="brackets">
        <DataCardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <div className="flex items-center gap-2 mono text-xs">
              <Tag className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">TOTAL:</span>
              <span className="text-foreground font-bold">{couponsQ.data?.length ?? 0}</span>
              <span className="text-muted-foreground">/ ACTIFS:</span>
              <span className="text-success font-bold">{totalActive}</span>
            </div>
            <div className="flex-1" />
            <div className="relative w-full sm:w-72">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="TENORA-..."
                className="rounded-none border-2 mono pl-9 h-10"
              />
            </div>
          </div>
        </DataCardHeader>
        <DataCardContent>
          {couponsQ.isLoading ? (
            <div className="space-y-2">
              <SkeletonRow /><SkeletonRow /><SkeletonRow />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 mono text-xs text-muted-foreground">
              <Tag className="h-8 w-8 mx-auto mb-3 opacity-40" />
              Aucun coupon. Cliquez sur « Nouveau ».
            </div>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtered.map((c) => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                const exhausted = c.max_uses != null && c.times_used >= c.max_uses;
                const dead = !c.is_active || expired || exhausted;
                return (
                  <li
                    key={c.id}
                    className={`brut-card p-3 sm:p-4 transition-colors ${dead ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => copyCode(c.code)}
                        className="flex-1 min-w-0 text-left group"
                        title="Cliquer pour copier"
                      >
                        <p className="mono font-bold text-sm sm:text-base truncate text-primary group-hover:text-primary-glow flex items-center gap-2">
                          {c.code}
                          <Copy className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                        </p>
                        <p className="mono text-[11px] text-muted-foreground mt-1">
                          {c.discount_percent != null ? `−${c.discount_percent}%` : `−${c.discount_amount} XOF`}
                          {" · "}
                          {c.times_used}{c.max_uses ? `/${c.max_uses}` : ""} util.
                          {c.expires_at && (<> · exp. {format(new Date(c.expires_at), "dd/MM/yy")}</>)}
                          {c.user_id && <> · user #{c.user_id}</>}
                        </p>
                        {(c.product_ids.length || c.category_ids.length) ? (
                          <p className="mono text-[10px] text-muted-foreground mt-1 truncate">
                            {c.product_ids.length} produit(s) · {c.category_ids.length} catégorie(s)
                          </p>
                        ) : (
                          <p className="mono text-[10px] text-muted-foreground mt-1">tout le catalogue</p>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(c)}
                          className="h-9 w-9 border-2 border-border hover:border-primary flex items-center justify-center tap-target"
                          aria-label="Éditer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDelTarget(c)}
                          className="h-9 w-9 border-2 border-border hover:border-destructive hover:text-destructive flex items-center justify-center tap-target"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DataCardContent>
      </DataCard>

      {/* ── Form dialog ───────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="rounded-none border-2 max-w-lg max-h-[92vh] overflow-y-auto w-[calc(100vw-1.5rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              // {editing ? "Édition" : "Création"} coupon
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Code (création seulement) */}
            {!editing && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Label className="eyebrow mb-1.5 block text-muted-foreground">Code (laisse vide pour générer)</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="TENORA-XXXXXXXX"
                    className="rounded-none border-2 mono uppercase"
                  />
                </div>
                <div>
                  <Label className="eyebrow mb-1.5 block text-muted-foreground">Longueur</Label>
                  <Select value={String(form.code_length)} onValueChange={(v) => setForm({ ...form, code_length: Number(v) })}>
                    <SelectTrigger className="rounded-none border-2 mono"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-2">
                      {[8, 9, 10, 11, 12].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} caractères</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {editing && (
              <div className="brackets bg-sidebar-accent/40 p-3">
                <p className="eyebrow mb-1">// CODE</p>
                <p className="mono font-bold text-base">{editing.code}</p>
              </div>
            )}

            {/* Réduction */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="eyebrow mb-1.5 block text-muted-foreground">Type</Label>
                <Select value={form.discount_type} onValueChange={(v: DiscountType) => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger className="rounded-none border-2 mono"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none border-2">
                    <SelectItem value="percent">Pourcentage</SelectItem>
                    <SelectItem value="amount">Montant XOF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="eyebrow mb-1.5 block text-muted-foreground">
                  Valeur ({form.discount_type === "percent" ? "1 à 100 %" : "XOF"})
                </Label>
                <Input
                  type="number" min="1"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  className="rounded-none border-2 mono"
                />
              </div>
            </div>

            {/* Restrictions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="eyebrow mb-1.5 block text-muted-foreground">Nombre d'utilisations max</Label>
                <Input
                  type="number" min="1" placeholder="Illimité"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  className="rounded-none border-2 mono"
                />
              </div>
              <div>
                <Label className="eyebrow mb-1.5 block text-muted-foreground">Date d'expiration</Label>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className="rounded-none border-2 mono"
                />
              </div>
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block text-muted-foreground">
                Réservé à un utilisateur (ID, optionnel)
              </Label>
              <Input
                type="number"
                placeholder="vide = tous les utilisateurs"
                value={form.user_id}
                onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                className="rounded-none border-2 mono"
              />
            </div>

            {/* Catégories */}
            <div>
              <Label className="eyebrow mb-1.5 block text-muted-foreground">
                Catégories actives (vide = toutes)
              </Label>
              <div className="border-2 border-border max-h-32 overflow-y-auto p-2 space-y-1">
                {(categoriesQ.data ?? []).length === 0 ? (
                  <p className="mono text-xs text-muted-foreground p-1">Aucune catégorie.</p>
                ) : (categoriesQ.data ?? []).map((c: any) => (
                  <label key={c.id} className="flex items-center gap-2 mono text-xs cursor-pointer p-1 hover:bg-sidebar-accent/40 tap-target">
                    <input
                      type="checkbox"
                      checked={form.category_ids.includes(c.id)}
                      onChange={() => toggleCid(c.id)}
                      className="accent-primary h-4 w-4"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Produits */}
            <div>
              <Label className="eyebrow mb-1.5 block text-muted-foreground">
                Produits actifs (vide = tous)
              </Label>
              <div className="border-2 border-border max-h-40 overflow-y-auto p-2 space-y-1">
                {(productsQ.data ?? []).length === 0 ? (
                  <p className="mono text-xs text-muted-foreground p-1">Aucun produit.</p>
                ) : (productsQ.data ?? []).map((p: any) => (
                  <label key={p.id} className="flex items-center gap-2 mono text-xs cursor-pointer p-1 hover:bg-sidebar-accent/40 tap-target">
                    <input
                      type="checkbox"
                      checked={form.product_ids.includes(p.id)}
                      onChange={() => togglePid(p.id)}
                      className="accent-primary h-4 w-4"
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-2 border-border p-3">
              <Label className="mono text-xs uppercase tracking-wider">Coupon actif</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" className="rounded-none border-2 h-11 tap-target" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
            <Button
              className="rounded-none border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 h-11 tap-target"
              onClick={submit}
              disabled={createM.isPending || updateM.isPending}
            >
              {(createM.isPending || updateM.isPending) ? "..." : (editing ? "Mettre à jour" : "Créer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent className="rounded-none border-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase tracking-wider text-sm">
              // Supprimer ce coupon ?
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-xs">
              {delTarget?.code} sera définitivement supprimé. Les commandes passées avec ce coupon ne seront pas modifiées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none border-2 tap-target">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => delTarget && deleteM.mutate(delTarget.id)}
              className="rounded-none border-2 border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 tap-target"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
