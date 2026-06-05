import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, ImageIcon, Package, Infinity as InfinityIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { DataCard, DataCardHeader, DataCardContent } from "@/components/panel/DataCard";
import { SkeletonRow } from "@/components/panel/PanelSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getProducts, createProduct, updateProduct, deleteProduct, uploadProductImage, deleteProductImage } from "@/lib/api/products";
import { getCategories } from "@/lib/api/categories";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import api from "@/lib/api/client";

interface RequiredField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  regex?: string;
}

interface Product {
  id: number; name: string; description?: string; price: number;
  stock?: number | null; is_active: boolean;
  image_path?: string; category_id?: number; category_name?: string;
  whatsapp_redirect?: boolean;
  discount_percent?: number | null;
  required_fields?: RequiredField[] | null;
}
interface Cat { id: number; name: string; }

interface FormState {
  name: string;
  price: number;
  description: string;
  category_id: string;
  stock: string;                  // "" = illimité
  is_active: boolean;
  whatsapp_redirect: boolean;
  discount_percent: string;       // "" = pas de promo
  required_fields: RequiredField[];
}

const empty: FormState = {
  name: "", price: 0, description: "", category_id: "",
  stock: "", is_active: true, whatsapp_redirect: false,
  discount_percent: "",
  required_fields: [],
};

const imgUrl = (p?: string) => {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${base}/uploads/${p}`;
};

// Règle métier : stock null OU 0 = ILLIMITÉ
const isUnlimited = (s?: number | null) => s == null || s === 0;

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [delDialog, setDelDialog] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([getProducts(), getCategories()]);
      setProducts(p.data || []);
      setCats(c.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.category_name?.toLowerCase().includes(q);
  });

  const fmt = (n: number) => `${n?.toLocaleString("fr-FR")} F`;

  const openCreate = () => {
    setEditing(null); setForm(empty);
    setPendingImage(null); setImagePreview(null);
    setShowForm(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name || "",
      price: p.price || 0,
      description: p.description || "",
      category_id: p.category_id?.toString() || "",
      // En édition, on affiche le vrai stock (même 0). 0 reste interprété comme illimité au save.
      stock: p.stock != null ? String(p.stock) : "",
      is_active: p.is_active ?? true,
      whatsapp_redirect: p.whatsapp_redirect ?? false,
      // Réduction : 0 ou null/undefined → champ vide (et non "0")
      discount_percent: p.discount_percent ? String(p.discount_percent) : "",
      required_fields: Array.isArray(p.required_fields) ? p.required_fields : [],
    });
    setPendingImage(null);
    setImagePreview(p.image_path ? imgUrl(p.image_path) : null);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const stockNum = form.stock === "" ? null : Number(form.stock);
      const discount = form.discount_percent === "" ? null : Number(form.discount_percent);

      if (discount != null && (discount <= 0 || discount >= 100)) {
        toast.error("La réduction doit être entre 1 et 99%");
        setSaving(false);
        return;
      }

      const cleanFields = form.required_fields
        .filter((f) => f.key.trim() && f.label.trim())
        .map((f) => ({
          key: f.key.trim(),
          label: f.label.trim(),
          placeholder: f.placeholder || undefined,
          required: f.required ?? true,
          regex: f.regex || undefined,
        }));

      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        is_active: form.is_active,
        whatsapp_redirect: form.whatsapp_redirect,
        price: Number(form.price) || 0,
        category_id: form.category_id ? Number(form.category_id) : null,
        // null = illimité côté DB
        stock: stockNum,
        discount_percent: discount,
        required_fields: cleanFields,
      };
      if (editing) {
        await updateProduct(editing.id, payload);
        if (pendingImage) await uploadProductImage(editing.id, pendingImage);
        toast.success("Produit mis à jour");
      } else {
        const { data } = await createProduct(payload);
        if (pendingImage && data?.id) await uploadProductImage(data.id, pendingImage);
        toast.success("Produit créé");
      }
      setShowForm(false);
      load();
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteProduct(toDelete.id);
      toast.success("Produit supprimé");
      load();
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDelDialog(false); setToDelete(null);
    }
  };

  // Required-fields helpers
  const addField = () => setForm((f) => ({
    ...f,
    required_fields: [...f.required_fields, { key: "", label: "", required: true }],
  }));
  const updateField = (i: number, patch: Partial<RequiredField>) =>
    setForm((f) => ({
      ...f,
      required_fields: f.required_fields.map((rf, idx) => idx === i ? { ...rf, ...patch } : rf),
    }));
  const removeField = (i: number) =>
    setForm((f) => ({
      ...f,
      required_fields: f.required_fields.filter((_, idx) => idx !== i),
    }));

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader eyebrow="Catalogue" title="Produits" subtitle={`// ${products.length} produits`}>
        <Button onClick={openCreate} className="h-9 rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider text-xs hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> Nouveau
        </Button>
      </PageHeader>

      <DataCard>
        <DataCardHeader>
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9 h-9 rounded-none border-2 mono text-xs" />
          </div>
          <span className="chip border-border ml-auto shrink-0">{filtered.length}</span>
        </DataCardHeader>

        <DataCardContent>
          {loading ? (
            [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="h-8 w-8 mb-2" />
              <p className="text-sm mono">// Aucun produit</p>
            </div>
          ) : (
            <div className="divide-y-2 divide-border">
              {filtered.map((p) => {
                const unlimited = isUnlimited(p.stock);
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 p-3 sm:p-4 hover:bg-muted/30 transition-colors"
                  >
                    {p.image_path ? (
                      <img src={imgUrl(p.image_path)} alt={p.name} className="h-12 w-12 object-cover border-2 border-border shrink-0" />
                    ) : (
                      <div className="h-12 w-12 border-2 border-border bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 basis-[60%] sm:basis-auto">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {p.category_name && (
                          <span className="chip border-tertiary/40 text-tertiary bg-tertiary-soft">{p.category_name}</span>
                        )}
                        {unlimited ? (
                          <span className="chip border-primary/40 text-primary bg-primary-soft inline-flex items-center gap-1">
                            <InfinityIcon className="h-3 w-3" /> stock
                          </span>
                        ) : (
                          <span className={cn(
                            "chip",
                            (p.stock as number) < 5
                              ? "border-warning/40 text-warning"
                              : "border-success/40 text-success"
                          )}>
                            {p.stock} en stock
                          </span>
                        )}
                        {p.discount_percent != null && p.discount_percent > 0 && (
                          <span className="chip border-destructive/40 text-destructive">
                            -{p.discount_percent}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bloc droite — wrap entier sur mobile */}
                    <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0 flex-wrap justify-end">
                      <p className="display text-base sm:text-lg text-primary mono">{fmt(p.price)}</p>
                      <StatusBadge status={p.is_active ? "active" : "inactive"} />
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-none hover:bg-primary hover:text-primary-foreground" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-none hover:bg-destructive hover:text-destructive-foreground" onClick={() => { setToDelete(p); setDelDialog(true); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DataCardContent>
      </DataCard>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="rounded-none border-2 max-w-xl max-h-[92vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm">
              // {editing ? "Édition" : "Création"} produit
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Nom</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none border-2 mono" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Prix (F)</Label>
                <Input type="number" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="rounded-none border-2 mono" />
              </div>
              <div>
                <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Stock <span className="text-muted-foreground/70">(0 = ∞)</span>
                </Label>
                <Input
                  type="number" inputMode="numeric" min={0}
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  placeholder="Illimité"
                  className="rounded-none border-2 mono"
                />
              </div>
              <div>
                <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Réduction %
                </Label>
                <Input
                  type="number" inputMode="numeric" min={0} max={99}
                  value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                  placeholder="0"
                  className="rounded-none border-2 mono"
                />
              </div>
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Catégorie</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger className="rounded-none border-2 mono"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent className="rounded-none border-2">
                  {cats.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-none border-2 mono text-sm" />
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Image</Label>
              {imagePreview ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <img src={imagePreview} alt="" className="h-16 w-16 object-cover border-2 border-border" />
                  <Button type="button" variant="outline" size="sm" className="rounded-none border-2" onClick={() => { setPendingImage(null); setImagePreview(null); }}>
                    Changer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none border-2 border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={async () => {
                      // Si on édite un produit qui a une image stockée côté backend → suppression réelle
                      if (editing && editing.image_path && !pendingImage) {
                        try {
                          await deleteProductImage(editing.id);
                          toast.success("Image supprimée");
                          // Refléter la suppression dans l'objet courant pour éviter une re-suppression
                          setEditing({ ...editing, image_path: undefined });
                          load();
                        } catch {
                          toast.error("Erreur lors de la suppression de l'image");
                          return;
                        }
                      }
                      setPendingImage(null);
                      setImagePreview(null);
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              ) : (
                <Input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setPendingImage(f); setImagePreview(URL.createObjectURL(f));
                }} className="rounded-none border-2 mono text-xs file:mr-2 file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:uppercase file:tracking-wider file:text-[10px]" />
              )}
            </div>

            {/* Champs requis dynamiques (required_fields) */}
            <div className="border-t-2 border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="eyebrow" style={{ color: "hsl(var(--muted-foreground))" }}>
                  // Champs demandés au client
                </Label>
                <Button type="button" size="sm" variant="outline" className="rounded-none border-2 mono uppercase text-[10px] tracking-wider" onClick={addField}>
                  <Plus className="h-3 w-3 mr-1" /> Ajouter
                </Button>
              </div>
              <div className="space-y-2">
                {form.required_fields.length === 0 && (
                  <p className="text-xs text-muted-foreground mono">// Aucun champ supplémentaire</p>
                )}
                {form.required_fields.map((rf, i) => (
                  <div key={i} className="border-2 border-border p-2 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="key (ex: phone)"
                        value={rf.key}
                        onChange={(e) => updateField(i, { key: e.target.value })}
                        className="rounded-none border-2 mono text-xs h-8"
                      />
                      <Input
                        placeholder="Label (ex: Téléphone)"
                        value={rf.label}
                        onChange={(e) => updateField(i, { label: e.target.value })}
                        className="rounded-none border-2 mono text-xs h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Placeholder (ex: +227 XX XX XX XX)"
                        value={rf.placeholder || ""}
                        onChange={(e) => updateField(i, { placeholder: e.target.value || undefined })}
                        className="rounded-none border-2 mono text-xs h-8 flex-1"
                      />
                      <label className="flex items-center gap-1 mono text-[10px] uppercase tracking-wider shrink-0">
                        <Switch checked={rf.required ?? true} onCheckedChange={(v) => updateField(i, { required: v })} />
                        Req
                      </label>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-none hover:bg-destructive hover:text-destructive-foreground shrink-0" onClick={() => removeField(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 justify-between border-t-2 border-border pt-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label className="mono text-xs uppercase tracking-wider">Actif</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.whatsapp_redirect} onCheckedChange={(v) => setForm({ ...form, whatsapp_redirect: v })} />
                <Label className="mono text-xs uppercase tracking-wider">WhatsApp</Label>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="rounded-none border-2 w-full sm:w-auto" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider hover:bg-primary/90 w-full sm:w-auto">
              {saving ? "..." : editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delDialog} onOpenChange={setDelDialog}>
        <AlertDialogContent className="rounded-none border-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase tracking-wider">// Supprimer ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le produit "{toDelete?.name}" sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none border-2">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-none border-2 border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
