import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Search, Pencil, Trash2, FolderTree, ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/PageHeader";
import { DataCard, DataCardHeader, DataCardContent } from "@/components/panel/DataCard";
import { SkeletonRow } from "@/components/panel/PanelSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getCategories, createCategory, updateCategory, deleteCategory,
  uploadCategoryImage, deleteCategoryImage,
} from "@/lib/api/categories";
import { toast } from "sonner";
import api from "@/lib/api/client";

interface Category {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  is_active: boolean;
  image_path?: string;
  product_count?: number;
  parent_id?: number | null;
}

const empty = {
  name: "",
  slug: "",
  description: "",
  is_active: true,
  parent_id: "none" as string,    // "none" = pas de parent
};

const slugify = (s: string) => s.toLowerCase().trim().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const imgUrl = (p?: string) => {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${base}/uploads/${p}`;
};

export default function Categories() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(empty);
  const [slugManual, setSlugManual] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [delDialog, setDelDialog] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getCategories();
      setItems(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()));

  // Map id -> name pour afficher le nom du parent dans la liste
  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    items.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [items]);

  // Liste des parents possibles (exclut soi-même et ses descendants)
  const parentChoices = useMemo(() => {
    if (!editing) return items;
    const banned = new Set<number>([editing.id]);
    let changed = true;
    while (changed) {
      changed = false;
      items.forEach((c) => {
        if (c.parent_id && banned.has(c.parent_id) && !banned.has(c.id)) {
          banned.add(c.id); changed = true;
        }
      });
    }
    return items.filter((c) => !banned.has(c.id));
  }, [items, editing]);

  const openCreate = () => {
    setEditing(null); setForm(empty); setSlugManual(false);
    setPendingImage(null); setImagePreview(null);
    setShowForm(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({
      name: c.name || "",
      slug: c.slug || "",
      description: c.description || "",
      is_active: c.is_active,
      parent_id: c.parent_id ? String(c.parent_id) : "none",
    });
    setSlugManual(true);
    setPendingImage(null);
    setImagePreview(c.image_path ? imgUrl(c.image_path) : null);
    setShowForm(true);
  };

  const handleNameChange = (v: string) => {
    setForm((f) => ({ ...f, name: v, slug: slugManual ? f.slug : slugify(v) }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingImage(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleRemoveImage = async () => {
    if (editing && editing.image_path) {
      await deleteCategoryImage(editing.id);
      toast.success("Image supprimée");
      load();
    }
    setPendingImage(null); setImagePreview(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        description: form.description || null,
        is_active: form.is_active,
        parent_id: form.parent_id === "none" ? null : Number(form.parent_id),
      };
      if (editing) {
        await updateCategory(editing.id, payload);
        if (pendingImage) await uploadCategoryImage(editing.id, pendingImage);
        toast.success("Catégorie mise à jour");
      } else {
        const { data } = await createCategory(payload);
        if (pendingImage && data?.id) await uploadCategoryImage(data.id, pendingImage);
        toast.success("Catégorie créée");
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
      await deleteCategory(toDelete.id);
      toast.success("Catégorie supprimée");
      load();
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDelDialog(false); setToDelete(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader eyebrow="Catalogue" title="Catégories" subtitle={`// ${items.length} catégorie(s)`}>
        <Button onClick={openCreate} className="h-9 rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider text-xs hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> Nouvelle
        </Button>
      </PageHeader>

      <DataCard>
        <DataCardHeader>
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9 h-9 rounded-none border-2 mono text-xs" />
          </div>
          <span className="chip border-border ml-auto shrink-0">{filtered.length} entrées</span>
        </DataCardHeader>

        <DataCardContent>
          {loading ? (
            [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderTree className="h-8 w-8 mb-2" />
              <p className="text-sm mono">// Aucune catégorie</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {filtered.map((c) => (
                <div key={c.id} className="brut-card brut-card-hover p-4 group">
                  <div className="flex items-start gap-3 mb-3">
                    {c.image_path ? (
                      <img src={imgUrl(c.image_path)} alt={c.name} className="h-14 w-14 object-cover border-2 border-border shrink-0" />
                    ) : (
                      <div className="h-14 w-14 border-2 border-border bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="display text-base truncate">{c.name}</p>
                      <p className="mono text-[10px] text-muted-foreground truncate">/{c.slug}</p>
                      {c.parent_id && nameById.get(c.parent_id) && (
                        <p className="mono text-[10px] text-muted-foreground truncate mt-0.5">
                          ↳ {nameById.get(c.parent_id)}
                        </p>
                      )}
                    </div>
                    <span className={`status-dot shrink-0 ${c.is_active ? "bg-success text-success" : "bg-muted-foreground text-muted-foreground"}`} />
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{c.description}</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-border pt-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="chip border-tertiary/40 text-tertiary bg-tertiary-soft">
                        {c.product_count ?? 0} produits
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 rounded-none hover:bg-primary hover:text-primary-foreground" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 rounded-none hover:bg-destructive hover:text-destructive-foreground" onClick={() => { setToDelete(c); setDelDialog(true); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DataCardContent>
      </DataCard>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="rounded-none border-2 max-w-lg max-h-[92vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm">
              // {editing ? "Édition" : "Création"} catégorie
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Nom</Label>
              <Input value={form.name} onChange={(e) => handleNameChange(e.target.value)} className="rounded-none border-2 mono" />
            </div>
            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Slug</Label>
              <Input value={form.slug} onChange={(e) => { setSlugManual(true); setForm({ ...form, slug: e.target.value }); }} className="rounded-none border-2 mono" />
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                Catégorie parente
              </Label>
              <Select value={form.parent_id} onValueChange={(v) => setForm({ ...form, parent_id: v })}>
                <SelectTrigger className="rounded-none border-2 mono"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none border-2">
                  <SelectItem value="none">— Aucune (racine) —</SelectItem>
                  {parentChoices.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
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
                <div className="flex items-center gap-3">
                  <img src={imagePreview} alt="" className="h-16 w-16 object-cover border-2 border-border" />
                  <Button type="button" variant="outline" size="sm" className="rounded-none border-2" onClick={handleRemoveImage}>
                    Retirer
                  </Button>
                </div>
              ) : (
                <Input type="file" accept="image/*" onChange={handleImageChange} className="rounded-none border-2 mono text-xs file:mr-2 file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:uppercase file:tracking-wider file:text-[10px]" />
              )}
            </div>
            <div className="flex items-center gap-2 border-t-2 border-border pt-4">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label className="mono text-xs uppercase tracking-wider">Active</Label>
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
              Cette action est irréversible. La catégorie "{toDelete?.name}" sera définitivement supprimée.
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
