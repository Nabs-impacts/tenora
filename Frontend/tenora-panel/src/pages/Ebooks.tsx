import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus, Search, Pencil, Trash2, ImageIcon, FileText, BookOpen,
  MoreVertical, Upload, X, CheckCircle2, AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatusBadge } from "@/components/panel/StatusBadge";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getEbooks, createEbook, updateEbook, deleteEbook,
  uploadEbookImage, deleteEbookImage,
  uploadEbookPdf, deleteEbookPdf,
} from "@/lib/api/ebooks";
import { getCategories } from "@/lib/api/categories";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import api from "@/lib/api/client";

interface Ebook {
  id: number;
  name: string;
  description?: string;
  price: number;
  discount_percent?: number | null;
  final_price: number;
  is_active: boolean;
  image_path?: string;
  pdf_path?: string;
  category_id?: number;
  category_name?: string;
  created_at: string;
}

interface Cat {
  id: number;
  name: string;
  service_type?: string;
}

interface FormState {
  name: string;
  price: number;
  description: string;
  category_id: string;
  is_active: boolean;
  discount_percent: string;
}

const empty: FormState = {
  name: "",
  price: 0,
  description: "",
  category_id: "",
  is_active: true,
  discount_percent: "",
};

const imgUrl = (p?: string) => {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${base}/uploads/${p}`;
};

const fmtPrice = (n: number) => `${n?.toLocaleString("fr-FR")} F`;

const pdfBasename = (p?: string) => {
  if (!p) return "";
  const cleaned = p.split("?")[0];
  return cleaned.split("/").pop() || cleaned;
};

export default function Ebooks() {
  const [ebooks, setEbooks] = useState<Ebook[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ebook | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pendingPdf, setPendingPdf] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [delDialog, setDelDialog] = useState(false);
  const [toDelete, setToDelete] = useState<Ebook | null>(null);

  // ── Data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([getEbooks(), getCategories()]);
      setEbooks(e.data || []);
      setCats(c.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ebookCats = useMemo(
    () => cats.filter((c) => c.service_type === "ebook"),
    [cats]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ebooks;
    return ebooks.filter(
      (e) =>
        e.name?.toLowerCase().includes(q) ||
        e.category_name?.toLowerCase().includes(q)
    );
  }, [ebooks, search]);

  // ── Form ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setPendingImage(null);
    setImagePreview(null);
    setPendingPdf(null);
    setShowForm(true);
  };

  const openEdit = (e: Ebook) => {
    setEditing(e);
    setForm({
      name: e.name || "",
      price: e.price || 0,
      description: e.description || "",
      category_id: e.category_id?.toString() || "",
      is_active: e.is_active ?? true,
      discount_percent: e.discount_percent ? String(e.discount_percent) : "",
    });
    setPendingImage(null);
    setImagePreview(e.image_path ? imgUrl(e.image_path) : null);
    setPendingPdf(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nom requis"); return; }
    if (!form.category_id) { toast.error("Catégorie ebook requise"); return; }

    const discount = form.discount_percent === "" ? null : Number(form.discount_percent);
    if (discount != null && (discount <= 0 || discount >= 100)) {
      toast.error("La réduction doit être entre 1 et 99%");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description,
        price: Number(form.price) || 0,
        category_id: Number(form.category_id),
        discount_percent: discount,
        is_active: form.is_active,
      };

      let targetId: number;
      if (editing) {
        await updateEbook(editing.id, payload);
        targetId = editing.id;
        toast.success("Ebook mis à jour");
      } else {
        const { data } = await createEbook(payload);
        targetId = data?.id;
        toast.success("Ebook créé");
      }

      if (pendingImage && targetId) {
        await uploadEbookImage(targetId, pendingImage);
      }
      if (pendingPdf && targetId) {
        await uploadEbookPdf(targetId, pendingPdf);
        toast.success("PDF uploadé");
      }

      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteEbook(toDelete.id);
      toast.success("Ebook supprimé");
      load();
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDelDialog(false);
      setToDelete(null);
    }
  };

  // ── Quick uploads (depuis le menu actions de la liste) ───────────────
  const pickAndUpload = (
    accept: string,
    handler: (file: File) => Promise<void>,
  ) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        await handler(file);
      } catch (err: any) {
        toast.error(err?.response?.data?.detail || "Erreur upload");
      }
    };
    input.click();
  };

  const quickUploadImage = (e: Ebook) =>
    pickAndUpload("image/*", async (file) => {
      await uploadEbookImage(e.id, file);
      toast.success("Couverture mise à jour");
      load();
    });

  const quickUploadPdf = (e: Ebook) =>
    pickAndUpload(".pdf,application/pdf", async (file) => {
      await uploadEbookPdf(e.id, file);
      toast.success("PDF uploadé");
      load();
    });

  const handleDeleteImageInForm = async () => {
    if (editing?.image_path && !pendingImage) {
      try {
        await deleteEbookImage(editing.id);
        toast.success("Image supprimée");
        setEditing({ ...editing, image_path: undefined });
        load();
      } catch {
        toast.error("Erreur suppression image");
        return;
      }
    }
    setPendingImage(null);
    setImagePreview(null);
  };

  const handleDeletePdfInForm = async () => {
    if (editing?.pdf_path && !pendingPdf) {
      try {
        await deleteEbookPdf(editing.id);
        toast.success("PDF supprimé");
        setEditing({ ...editing, pdf_path: undefined });
        load();
      } catch {
        toast.error("Erreur suppression PDF");
        return;
      }
    }
    setPendingPdf(null);
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        eyebrow="// 02.5 — bibliothèque"
        title="Ebooks"
        subtitle={`// ${ebooks.length} ebook${ebooks.length > 1 ? "s" : ""}`}
      >
        <Button
          onClick={openCreate}
          className="h-9 rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider text-xs hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" /> Nouvel ebook
        </Button>
      </PageHeader>

      <DataCard>
        <DataCardHeader>
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un titre..."
              className="pl-9 h-9 rounded-none border-2 mono text-xs"
            />
          </div>
          <span className="chip border-border ml-auto shrink-0">{filtered.length}</span>
        </DataCardHeader>

        <DataCardContent>
          {loading ? (
            [...Array(4)].map((_, i) => <SkeletonRow key={i} />)
          ) : ebooks.length === 0 ? (
            <EmptyLibrary onCreate={openCreate} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-2" />
              <p className="text-sm mono">// Aucun résultat</p>
            </div>
          ) : (
            <div className="divide-y-2 divide-border">
              {filtered.map((e) => (
                <EbookRow
                  key={e.id}
                  ebook={e}
                  onEdit={() => openEdit(e)}
                  onDelete={() => { setToDelete(e); setDelDialog(true); }}
                  onUploadImage={() => quickUploadImage(e)}
                  onUploadPdf={() => quickUploadPdf(e)}
                />
              ))}
            </div>
          )}
        </DataCardContent>
      </DataCard>

      {/* ── Dialog création/édition ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="rounded-none border-2 max-w-2xl max-h-[90dvh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              // {editing ? "Édition" : "Création"} ebook
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                Titre
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-none border-2 mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Prix (F)
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  className="rounded-none border-2 mono"
                />
              </div>
              <div>
                <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Réduction %
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                  placeholder="0 = pas de promo"
                  className="rounded-none border-2 mono"
                />
              </div>
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                Catégorie (ebook)
              </Label>
              {ebookCats.length === 0 ? (
                <div className="border-2 border-dashed border-warning/60 p-3 mono text-xs text-warning flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Aucune catégorie « ebook ». Créez-en une depuis Catégories.
                </div>
              ) : (
                <Select
                  value={form.category_id}
                  onValueChange={(v) => setForm({ ...form, category_id: v })}
                >
                  <SelectTrigger className="rounded-none border-2 mono">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-2">
                    {ebookCats.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                Description
              </Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="rounded-none border-2 mono text-sm"
              />
            </div>

            {/* ── Couverture ── */}
            <div className="border-2 border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                <Label className="eyebrow" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Couverture (portrait, JPG/PNG/WEBP)
                </Label>
              </div>
              {imagePreview ? (
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <img
                    src={imagePreview}
                    alt="Couverture"
                    className="w-48 h-64 object-cover border-2 border-border shrink-0"
                  />
                  <div className="flex flex-col gap-2 w-full">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setPendingImage(f);
                        setImagePreview(URL.createObjectURL(f));
                      }}
                      className="rounded-none border-2 mono text-xs file:mr-2 file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:uppercase file:tracking-wider file:text-[10px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-none border-2 border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={handleDeleteImageInForm}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" /> Supprimer l'image
                    </Button>
                  </div>
                </div>
              ) : (
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPendingImage(f);
                    setImagePreview(URL.createObjectURL(f));
                  }}
                  className="rounded-none border-2 mono text-xs file:mr-2 file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:uppercase file:tracking-wider file:text-[10px]"
                />
              )}
            </div>

            {/* ── PDF ── */}
            <div className="border-2 border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <Label className="eyebrow" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Fichier PDF
                </Label>
              </div>

              {(editing?.pdf_path && !pendingPdf) || pendingPdf ? (
                <div className="flex items-center justify-between gap-3 border-2 border-success/40 bg-success/5 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    <p className="mono text-xs text-foreground truncate">
                      {pendingPdf ? pendingPdf.name : "PDF disponible — " + pdfBasename(editing?.pdf_path)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none border-2 border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
                    onClick={handleDeletePdfInForm}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <p className="mono text-xs text-muted-foreground">// Aucun PDF uploadé</p>
              )}

              <Input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setPendingPdf(f);
                }}
                className="rounded-none border-2 mono text-xs file:mr-2 file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:uppercase file:tracking-wider file:text-[10px]"
              />
              <p className="mono text-[10px] text-muted-foreground">
                Max 50 MB. Le PDF sera servi via URL pré-signée temporaire après achat.
              </p>
            </div>

            {/* ── Statut ── */}
            <div className="flex items-center justify-between border-2 border-border p-4">
              <Label className="mono text-xs uppercase tracking-wider">Ebook actif</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="rounded-none border-2 mono uppercase tracking-wider"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || ebookCats.length === 0}
              className="rounded-none border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 mono uppercase tracking-wider"
            >
              {saving ? "..." : editing ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm suppression ── */}
      <AlertDialog open={delDialog} onOpenChange={setDelDialog}>
        <AlertDialogContent className="rounded-none border-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase tracking-wider text-sm">
              // Supprimer cet ebook ?
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-xs">
              {toDelete?.name} ainsi que sa couverture et son PDF seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none border-2">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-none border-2 border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────

function EbookRow({
  ebook, onEdit, onDelete, onUploadImage, onUploadPdf,
}: {
  ebook: Ebook;
  onEdit: () => void;
  onDelete: () => void;
  onUploadImage: () => void;
  onUploadPdf: () => void;
}) {
  const hasPdf = !!ebook.pdf_path;
  return (
    <div className="flex flex-col md:flex-row md:items-stretch gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors">
      {/* Couverture */}
      {ebook.image_path ? (
        <img
          src={imgUrl(ebook.image_path)}
          alt={ebook.name}
          className="
            w-full h-40 md:w-28 md:h-40
            object-cover object-top
            border-2 border-border shrink-0
          "
        />
      ) : (
        <div className="w-full h-40 md:w-28 md:h-40 border-2 border-dashed border-border bg-muted flex items-center justify-center shrink-0">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
        </div>
      )}

      {/* Infos */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <p className="text-sm font-semibold leading-tight flex-1 min-w-0 break-words">
            {ebook.name}
          </p>

          {/* Actions mobile : menu dropdown */}
          <div className="md:hidden shrink-0">
            <ActionsMenu
              onEdit={onEdit}
              onUploadImage={onUploadImage}
              onUploadPdf={onUploadPdf}
              onDelete={onDelete}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ebook.category_name && (
            <span className="chip border-tertiary/40 text-tertiary bg-tertiary-soft">
              {ebook.category_name}
            </span>
          )}
          {ebook.discount_percent != null && ebook.discount_percent > 0 && (
            <span className="chip border-destructive/40 text-destructive">
              -{ebook.discount_percent}%
            </span>
          )}
          <span
            className={cn(
              "chip inline-flex items-center gap-1",
              hasPdf
                ? "border-success/50 text-success bg-success/10"
                : "border-destructive/50 text-destructive bg-destructive/5"
            )}
          >
            <FileText className="h-3 w-3" />
            {hasPdf ? "PDF ✓" : "No PDF"}
          </span>
          <StatusBadge status={ebook.is_active ? "active" : "inactive"} />
        </div>

        <div className="flex items-center justify-between gap-3 mt-auto pt-2">
          <p className="display text-base sm:text-lg text-primary mono">
            {fmtPrice(ebook.price)}
          </p>

          {/* Actions desktop : boutons inline */}
          <div className="hidden md:flex items-center gap-1">
            <Button
              size="icon" variant="ghost"
              className="h-8 w-8 rounded-none hover:bg-primary hover:text-primary-foreground"
              onClick={onUploadImage}
              title="Changer la couverture"
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-8 w-8 rounded-none hover:bg-primary hover:text-primary-foreground"
              onClick={onUploadPdf}
              title="Uploader le PDF"
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-8 w-8 rounded-none hover:bg-primary hover:text-primary-foreground"
              onClick={onEdit}
              title="Éditer"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-8 w-8 rounded-none hover:bg-destructive hover:text-destructive-foreground"
              onClick={onDelete}
              title="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionsMenu({
  onEdit, onUploadImage, onUploadPdf, onDelete,
}: {
  onEdit: () => void;
  onUploadImage: () => void;
  onUploadPdf: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon" variant="ghost"
          className="h-9 w-9 rounded-none border-2 border-border"
          aria-label="Actions"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-none border-2 mono text-xs">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-2" /> Éditer
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onUploadImage}>
          <ImageIcon className="h-3.5 w-3.5 mr-2" /> Couverture
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onUploadPdf}>
          <Upload className="h-3.5 w-3.5 mr-2" /> Uploader PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyLibrary({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="
        relative flex flex-col items-center justify-center
        text-center py-16 px-6
        border-2 border-dashed border-border
        bg-[linear-gradient(to_right,hsl(var(--border)/0.18)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.18)_1px,transparent_1px)]
        bg-[size:24px_24px]
      "
    >
      <div className="relative mb-6">
        <div className="h-20 w-20 border-2 border-primary bg-primary/10 flex items-center justify-center relative z-10">
          <BookOpen className="h-10 w-10 text-primary" strokeWidth={2.25} />
        </div>
        <span className="absolute inset-0 border-2 border-primary translate-x-1.5 translate-y-1.5 -z-0" />
      </div>

      <p className="eyebrow text-[10px] text-muted-foreground mb-2">
        // bibliothèque
      </p>
      <h3 className="display text-2xl sm:text-3xl tracking-tight mb-2">
        Votre bibliothèque est vide
      </h3>
      <p className="mono text-xs text-muted-foreground max-w-sm mb-6">
        Aucun ebook n'est encore publié. Ajoutez votre premier titre pour commencer
        à le vendre — couverture, prix et PDF, c'est tout.
      </p>
      <Button
        onClick={onCreate}
        className="h-11 rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider text-xs hover:bg-primary/90"
      >
        <Plus className="h-4 w-4 mr-2" /> Ajouter un ebook
      </Button>
    </div>
  );
}
