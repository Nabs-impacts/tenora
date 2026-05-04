import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Copy, Tag, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

import { PageHeader } from "@/components/panel/PageHeader";
import { DataCard, DataCardHeader, DataCardContent } from "@/components/panel/DataCard";
import { SkeletonRow } from "@/components/panel/PanelSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

// ── Section collapsible pour catégories/produits ──────────────────────────
function FilterSection({
  label,
  hint,
  selected,
  items,
  onToggle,
}: {
  label: string;
  hint: string;
  selected: number[];
  items: { id: number; name: string }[];
  onToggle: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="border-2 border-border">
      {/* Header cliquable */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-sidebar-accent/30 transition-colors"
      >
        <div className="text-left min-w-0">
          <p className="eyebrow text-[10px] text-muted-foreground block">{label}</p>
          <p className="mono text-xs text-foreground truncate">
            {selected.length === 0
              ? hint
              : `${selected.length} sélectionné${selected.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {/* Chips dans un flex-wrap — pas de scroll imbriqué */}
      {open && (
        <div className="px-3 pb-3 pt-1 border-t-2 border-border flex flex-wrap gap-2">
          {items.map((item) => {
            const active = selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className={cn(
                  "mono text-xs px-2.5 py-1.5 border-2 transition-colors leading-none whitespace-nowrap",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                )}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────
export default function CouponsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(empty);
  const [delTarget, setDelTarget] = useState<Coupon | null>(null);

  // ── Données ───────────────────────────────────────────────────────────
  const couponsQ = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => (await getCoupons()).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
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

  // ── Mutations ─────────────────────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────
  const openCreate = () => { setEditing(null); setForm(empty); setShowForm(true); };
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
    if (isNaN(value) || value <= 0) { toast.error("Renseignez une valeur de réduction valide."); return; }
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
  const isSaving = createM.isPending || updateM.isPending;

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader
        title="Coupons"
        eyebrow="// 07 — promotions"
        action={
          <Button
            onClick={openCreate}
            className="brut-btn rounded-none border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 tap-target"
          >
            <Plus className="h-4 w-4 mr-2" /> Nouveau
          </Button>
        }
      />

      {/* ── Liste ── */}
      <DataCard className="brackets">
        <DataCardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <div className="flex items-center gap-2 mono text-xs sm:text-sm">
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
                className="rounded-none border-2 mono pl-9 h-11 text-sm"
              />
            </div>
          </div>
        </DataCardHeader>
        <DataCardContent>
          {couponsQ.isLoading ? (
            <div className="space-y-2"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 mono text-xs text-muted-foreground">
              <Tag className="h-8 w-8 mx-auto mb-3 opacity-40" />
              Aucun coupon. Cliquez sur « Nouveau ».
            </div>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {filtered.map((c) => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                const exhausted = c.max_uses != null && c.times_used >= c.max_uses;
                const dead = !c.is_active || expired || exhausted;
                const discount = c.discount_percent != null ? `−${c.discount_percent}%` : `−${c.discount_amount} XOF`;
                return (
                  <li key={c.id} className={`brut-card p-4 sm:p-5 transition-colors ${dead ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <button onClick={() => copyCode(c.code)} className="flex-1 min-w-0 text-left group" title="Cliquer pour copier">
                        <p className="mono font-bold text-base sm:text-lg break-all text-primary group-hover:text-primary-glow flex items-center gap-2 leading-tight">
                          <span className="truncate">{c.code}</span>
                          <Copy className="h-3.5 w-3.5 shrink-0 opacity-40 group-hover:opacity-100" />
                        </p>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => openEdit(c)} className="h-10 w-10 border-2 border-border hover:border-primary flex items-center justify-center tap-target" aria-label="Éditer">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDelTarget(c)} className="h-10 w-10 border-2 border-border hover:border-destructive hover:text-destructive flex items-center justify-center tap-target" aria-label="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="mono text-xs font-bold px-2 py-1 border-2 border-primary text-primary">{discount}</span>
                      <span className="mono text-xs px-2 py-1 border-2 border-border text-foreground">
                        {c.times_used}{c.max_uses ? `/${c.max_uses}` : ""} util.
                      </span>
                      {c.expires_at && (
                        <span className={`mono text-xs px-2 py-1 border-2 ${expired ? "border-destructive text-destructive" : "border-border text-muted-foreground"}`}>
                          exp. {format(new Date(c.expires_at), "dd/MM/yy")}
                        </span>
                      )}
                      {c.user_id && (
                        <span className="mono text-xs px-2 py-1 border-2 border-border text-muted-foreground">user #{c.user_id}</span>
                      )}
                    </div>
                    <p className="mono text-xs text-muted-foreground">
                      {(c.product_ids.length || c.category_ids.length)
                        ? `${c.product_ids.length} produit(s) · ${c.category_ids.length} catégorie(s)`
                        : "tout le catalogue"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </DataCardContent>
      </DataCard>

      {/* ── Sheet formulaire (bottom on mobile, right on desktop) ── */}
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent
          side="bottom"
          className="
            rounded-none border-t-2 border-border bg-card
            h-[92dvh]
            flex flex-col
            p-0
            sm:side-right sm:h-full sm:max-w-lg sm:border-l-2 sm:border-t-0
          "
        >
          {/* Header fixe */}
          <SheetHeader className="px-5 pt-5 pb-4 border-b-2 border-border shrink-0">
            {/* Drag handle — mobile hint */}
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-3 sm:hidden" />
            <SheetTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              // {editing ? "Édition" : "Création"} coupon
            </SheetTitle>
          </SheetHeader>

          {/* Corps scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

            {/* Code */}
            {!editing ? (
              <div className="space-y-3">
                <div>
                  <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">CODE (LAISSE VIDE POUR GÉNÉRER)</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="TENORA-XXXXXXXX"
                    className="rounded-none border-2 mono uppercase h-12 text-base"
                    autoCapitalize="characters"
                  />
                </div>
                <div>
                  <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">LONGUEUR</Label>
                  <Select value={String(form.code_length)} onValueChange={(v) => setForm({ ...form, code_length: Number(v) })}>
                    <SelectTrigger className="rounded-none border-2 mono h-11"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-2">
                      {[8, 9, 10, 11, 12].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} caractères</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="brackets bg-sidebar-accent/40 p-3">
                <p className="eyebrow mb-1 text-[10px] text-muted-foreground">// CODE</p>
                <p className="mono font-bold text-lg">{editing.code}</p>
              </div>
            )}

            {/* Réduction — type + valeur côte à côte */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">TYPE</Label>
                <Select value={form.discount_type} onValueChange={(v: DiscountType) => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger className="rounded-none border-2 mono h-11"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none border-2">
                    <SelectItem value="percent">Pourcentage</SelectItem>
                    <SelectItem value="amount">Montant XOF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">
                  VALEUR {form.discount_type === "percent" ? "(1–100%)" : "(XOF)"}
                </Label>
                <Input
                  type="number" min="1"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  className="rounded-none border-2 mono h-11"
                  inputMode="decimal"
                />
              </div>
            </div>

            {/* Max utilisations + expiration côte à côte */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">MAX UTILISATIONS</Label>
                <Input
                  type="number" min="1" placeholder="∞"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  className="rounded-none border-2 mono h-11"
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">EXPIRATION</Label>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className="rounded-none border-2 mono h-11 text-xs"
                />
              </div>
            </div>

            {/* User ID */}
            <div>
              <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">
                RÉSERVÉ À UN UTILISATEUR (ID, OPTIONNEL)
              </Label>
              <Input
                type="number"
                placeholder="vide = tous les utilisateurs"
                value={form.user_id}
                onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                className="rounded-none border-2 mono h-11"
                inputMode="numeric"
              />
            </div>

            {/* Catégories — collapsible chips */}
            <FilterSection
              label="CATÉGORIES ACTIVES"
              hint="vide = toutes les catégories"
              selected={form.category_ids}
              items={categoriesQ.data ?? []}
              onToggle={toggleCid}
            />

            {/* Produits — collapsible chips */}
            <FilterSection
              label="PRODUITS ACTIFS"
              hint="vide = tous les produits"
              selected={form.product_ids}
              items={productsQ.data ?? []}
              onToggle={togglePid}
            />

            {/* Actif toggle */}
            <div className="flex items-center justify-between border-2 border-border p-4">
              <Label className="mono text-xs uppercase tracking-wider">Coupon actif</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>

          {/* Footer fixe — boutons toujours visibles */}
          <div className="shrink-0 border-t-2 border-border p-4 flex gap-3 bg-card">
            <Button
              variant="outline"
              className="flex-1 rounded-none border-2 h-12 tap-target mono uppercase tracking-wider"
              onClick={() => setShowForm(false)}
            >
              <X className="h-4 w-4 mr-1.5" /> Annuler
            </Button>
            <Button
              className="flex-1 rounded-none border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 h-12 tap-target mono uppercase tracking-wider"
              onClick={submit}
              disabled={isSaving}
            >
              {isSaving ? "..." : (editing ? "Mettre à jour" : "Créer")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Confirm suppression ── */}
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
