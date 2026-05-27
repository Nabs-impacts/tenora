import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Download,
  Check,
  Upload,
  Copy,
  ShoppingBag,
  Library,
  FileText,
  Infinity as InfinityIcon,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ebooksApi,
  ordersApi,
  productsApi,
  formatXOF,
  resolveAssetUrl,
  type Ebook,
  type PaymentMethod,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSite } from "@/context/SiteContext";
import { cn } from "@/lib/utils";

/* ================================================================
 * Page Ebooks — Tenora brutalist neon
 * ============================================================== */

export default function Ebooks() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: site } = useSite();

  const { data: ebooks = [], isLoading } = useQuery({
    queryKey: ["ebooks"],
    staleTime: 5 * 60_000,
    queryFn: () => ebooksApi.list().then((r) => r.data),
  });

  const { data: myOrders = [] } = useQuery({
    queryKey: ["orders", "my"],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => ordersApi.myOrders().then((r) => r.data),
  });

  const { data: categoryTree = [] } = useQuery({
    queryKey: ["categories", "tree"],
    staleTime: 10 * 60_000,
    queryFn: () => productsApi.getCategoriesTree().then((r) => r.data),
  });

  const purchasedIds = useMemo(
    () =>
      new Set(
        myOrders.filter((o) => o.status === "completed").map((o) => o.product_id),
      ),
    [myOrders],
  );

  /* ---------- Catégories ebooks ---------- */
  const categoryNameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const root of categoryTree) {
      if (root.service_type === "ebook") {
        m.set(root.id, root.name);
        for (const sub of root.subcategories ?? []) m.set(sub.id, sub.name);
      }
    }
    return m;
  }, [categoryTree]);

  const ebookCategories = useMemo(() => {
    const seen = new Map<number, string>();
    for (const eb of ebooks) {
      if (seen.has(eb.category_id)) continue;
      seen.set(eb.category_id, categoryNameMap.get(eb.category_id) || `Catégorie ${eb.category_id}`);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [ebooks, categoryNameMap]);

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  const filteredEbooks = useMemo(() => {
    if (selectedCategory === null) return ebooks;
    return ebooks.filter((e) => e.category_id === selectedCategory);
  }, [ebooks, selectedCategory]);

  /* ---------- Téléchargement ---------- */
  const [selected, setSelected] = useState<Ebook | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  async function handleDownload(eb: Ebook) {
    if (!user) {
      toast.error("Connectez-vous pour télécharger.");
      navigate("/connexion");
      return;
    }
    setDownloading(eb.id);
    try {
      const res = await ebooksApi.download(eb.id);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.detail || "Erreur lors du téléchargement.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${eb.name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Téléchargement démarré !");
    } catch {
      toast.error("Impossible de télécharger le fichier.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden border-b-2 border-border bg-gradient-hero">
        <div className="absolute inset-0 bg-grid opacity-[0.04]" aria-hidden />
        <div className="container-app relative py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 animate-fade-up">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Library className="size-3.5 text-primary" />
                  // Bibliothèque.Digitale
                </span>
                <span className="text-border">—</span>
                <span>Code: 04</span>
              </div>
              <h1 className="font-display uppercase font-bold leading-[0.9] text-5xl md:text-7xl tracking-tight">
                Ebooks
              </h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-md">
                Achetez une fois. Téléchargez pour toujours.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="chip bg-muted text-muted-foreground border-border">
                <FileText className="size-3" /> PDF
              </span>
              <span className="chip bg-muted text-muted-foreground border-border">
                <InfinityIcon className="size-3" /> Accès à vie
              </span>
              <span className="chip bg-muted text-muted-foreground border-border">
                <Smartphone className="size-3" /> Tous appareils
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FILTRES ============ */}
      {ebookCategories.length > 1 && (
        <section className="border-b border-border bg-background/50">
          <div className="container-app py-4 flex items-center gap-2 overflow-x-auto scrollbar-none">
            <CategoryPill
              active={selectedCategory === null}
              onClick={() => setSelectedCategory(null)}
              label={`Tous · ${ebooks.length}`}
            />
            {ebookCategories.map((c) => {
              const count = ebooks.filter((e) => e.category_id === c.id).length;
              return (
                <CategoryPill
                  key={c.id}
                  active={selectedCategory === c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  label={`${c.name} · ${count}`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ============ GRILLE ============ */}
      <section className="container-app py-8 md:py-12">
        {isLoading ? (
          <EbooksGridSkeleton />
        ) : ebooks.length === 0 ? (
          <EmptyLibrary />
        ) : filteredEbooks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              Aucun ebook dans cette catégorie.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
            {filteredEbooks.map((eb) => (
              <EbookCard
                key={eb.id}
                ebook={eb}
                owned={purchasedIds.has(eb.id)}
                downloading={downloading === eb.id}
                onOpen={() => setSelected(eb)}
                onDownload={() => handleDownload(eb)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ============ DIALOG ============ */}
      <EbookPurchaseDialog
        ebook={selected}
        owned={selected ? purchasedIds.has(selected.id) : false}
        onClose={() => setSelected(null)}
        onDownload={handleDownload}
        downloading={downloading}
        paymentMethods={site?.payment_methods?.filter((p) => p.enabled) ?? []}
      />
    </div>
  );
}

/* ================================================================
 * Sous-composants présentation
 * ============================================================== */

function CategoryPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 px-3 py-1.5 border-2 text-[10px] uppercase tracking-widest font-bold transition-all rounded-none",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-[3px_3px_0_0_hsl(var(--primary)/0.4)]"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function EbookCard({
  ebook,
  owned,
  downloading,
  onOpen,
  onDownload,
}: {
  ebook: Ebook;
  owned: boolean;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const cover = resolveAssetUrl(ebook.image_url || ebook.image_path);
  return (
    <article className="brut-card flex flex-col overflow-hidden bg-card group">
      <button
        onClick={onOpen}
        className="relative block aspect-[2/3] w-full overflow-hidden bg-muted text-left"
        aria-label={`Voir ${ebook.name}`}
      >
        {cover ? (
          <img
            src={cover}
            alt={ebook.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground">
            <BookOpen className="size-10" />
          </div>
        )}

        {/* badge prix */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/60 to-transparent px-2.5 py-2 flex items-end justify-between gap-2">
          <div className="flex flex-col">
            {ebook.discount_percent ? (
              <span className="text-[10px] text-muted-foreground line-through leading-none">
                {formatXOF(ebook.price)}
              </span>
            ) : null}
            <span className="font-display text-base md:text-lg font-bold text-primary leading-none">
              {formatXOF(ebook.final_price)}
            </span>
          </div>
          {ebook.discount_percent ? (
            <span className="chip bg-destructive/15 text-destructive border-destructive/30 !text-[9px] !px-1.5 !py-0.5">
              -{Math.round(ebook.discount_percent)}%
            </span>
          ) : null}
        </div>

        {/* badge owned */}
        {owned && (
          <span className="absolute top-2 right-2 chip bg-success/90 text-success-foreground border-success !text-[9px] !px-1.5 !py-0.5">
            <Check className="size-2.5" /> Possédé
          </span>
        )}
        {/* tag PDF */}
        <span className="absolute top-2 left-2 chip bg-background/85 backdrop-blur text-foreground border-border !text-[9px] !px-1.5 !py-0.5">
          PDF
        </span>
      </button>

      <div className="p-2.5 md:p-3 flex flex-col gap-2 flex-1">
        <h3 className="font-display font-bold text-xs md:text-sm leading-tight line-clamp-2 min-h-[2.2em]">
          {ebook.name}
        </h3>
        {owned ? (
          <Button
            size="sm"
            onClick={onDownload}
            disabled={downloading}
            className="bg-success text-success-foreground hover:bg-success/90 h-8 text-[11px] uppercase tracking-wider font-bold rounded-none w-full"
          >
            <Download className="size-3.5" />
            {downloading ? "..." : "Télécharger"}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onOpen}
            className="bg-gradient-primary text-primary-foreground h-8 text-[11px] uppercase tracking-wider font-bold rounded-none w-full"
          >
            Acheter
          </Button>
        )}
      </div>
    </article>
  );
}

function EbooksGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="brut-card overflow-hidden bg-card">
          <Skeleton className="w-full aspect-[2/3] rounded-none" />
          <div className="p-2.5 md:p-3 space-y-2">
            <Skeleton className="h-4 w-3/4 rounded-none" />
            <Skeleton className="h-8 w-full rounded-none" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="relative border-2 border-dashed border-border overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.03]" aria-hidden />
      <div className="relative p-6 md:p-10 space-y-6">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-pulse-glow" />
          // Bientôt disponible
        </div>

        <div className="grid grid-cols-3 gap-4 md:gap-5 max-w-2xl">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[2/3] bg-muted/40 border-2 border-border animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>

        <div className="space-y-1">
          <h2 className="font-display uppercase text-2xl md:text-3xl font-bold">
            Nouvelle bibliothèque en construction.
          </h2>
          <p className="text-sm text-muted-foreground">Revenez bientôt.</p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
 * Purchase Dialog — logique inchangée, UI refaite
 * ============================================================== */

function EbookPurchaseDialog({
  ebook,
  owned,
  onClose,
  onDownload,
  downloading,
  paymentMethods,
}: {
  ebook: Ebook | null;
  owned: boolean;
  onClose: () => void;
  onDownload: (e: Ebook) => void;
  downloading: number | null;
  paymentMethods: PaymentMethod[];
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [info, setInfo] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (ebook) {
      setInfo({});
      setMethod(null);
      setError("");
      setOrderId(null);
      setFile(null);
    }
  }, [ebook?.id]);

  if (!ebook) return null;

  const cover = resolveAssetUrl(ebook.image_url || ebook.image_path);
  const formattedInstructions =
    method?.instructions
      ?.replace(/\{amount\}/g, formatXOF(ebook.final_price))
      ?.replace(/#\{order_id\}/g, orderId ? `#${orderId}` : "#[en attente]")
      ?.replace(/\{order_id\}/g, orderId ? String(orderId) : "[en attente]") ?? "";

  async function copyInstructions() {
    if (!formattedInstructions) return;
    await navigator.clipboard.writeText(formattedInstructions);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function submit() {
    if (!ebook || !method) return;
    if (!user) {
      toast.error("Connectez-vous pour acheter.");
      navigate("/connexion");
      return;
    }
    for (const f of ebook.required_fields ?? []) {
      if (f.required && !info[f.key]?.trim()) {
        setError(`Le champ "${f.label}" est obligatoire.`);
        return;
      }
    }
    setLoading(true);
    setError("");
    try {
      const res = await ordersApi.create({
        product_id: ebook.id,
        quantity: 1,
        customer_info: info,
        payment_method: method.id,
      });
      setOrderId(res.data.id);
      toast.success("Commande créée — joignez votre reçu.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Erreur lors de la commande.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadReceipt() {
    if (!file || !orderId) return;
    setUploading(true);
    try {
      await ordersApi.uploadScreenshot(orderId, file);
      onClose();
      navigate(
        `/confirmation?id=${orderId}&product=${encodeURIComponent(
          ebook!.name,
        )}&amount=${encodeURIComponent(formatXOF(ebook!.final_price))}`,
      );
    } catch {
      toast.error("Erreur lors de l'envoi du reçu.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={!!ebook} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0 max-h-[94dvh] border-2 border-border">
        <div className="flex flex-col md:flex-row max-h-[94dvh]">
          {/* ============ Colonne image ============ */}
          <div className="relative md:w-[260px] md:shrink-0 md:self-start md:sticky md:top-0 bg-muted">
            {cover ? (
              <img
                src={cover}
                alt={ebook.name}
                className="w-full md:aspect-[2/3] max-h-[220px] md:max-h-none object-cover object-top md:object-center"
              />
            ) : (
              <div className="w-full aspect-[2/3] flex items-center justify-center text-muted-foreground">
                <BookOpen className="size-16" />
              </div>
            )}
            <span className="absolute top-3 left-3 chip bg-background/85 backdrop-blur text-foreground border-border">
              <FileText className="size-3" /> PDF
            </span>
          </div>

          {/* ============ Colonne contenu ============ */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5 md:p-6 space-y-5">
            <DialogHeader className="text-left space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                // Ebook
              </p>
              <DialogTitle className="font-display uppercase text-2xl md:text-3xl leading-tight">
                {ebook.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Détails et achat de l&apos;ebook
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-display text-3xl font-bold gradient-text">
                {formatXOF(ebook.final_price)}
              </span>
              {ebook.discount_percent ? (
                <>
                  <span className="text-sm text-muted-foreground line-through">
                    {formatXOF(ebook.price)}
                  </span>
                  <span className="chip bg-destructive/15 text-destructive border-destructive/30">
                    -{Math.round(ebook.discount_percent)}%
                  </span>
                </>
              ) : null}
            </div>

            {ebook.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {ebook.description}
              </p>
            )}

            <ul className="grid grid-cols-3 gap-2">
              {[
                { icon: FileText, label: "PDF" },
                { icon: InfinityIcon, label: "Accès à vie" },
                { icon: Smartphone, label: "Tous appareils" },
              ].map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="border-2 border-border bg-muted/30 px-2 py-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex flex-col items-center gap-1 text-center"
                >
                  <Icon className="size-3.5 text-primary" />
                  {label}
                </li>
              ))}
            </ul>

            <div className="border-t-2 border-border" />

            {owned ? (
              <div className="space-y-4">
                <div className="relative border-2 border-success/40 bg-success/10 px-5 py-6 flex flex-col items-center gap-3 text-center overflow-hidden">
                  <div className="absolute inset-0 bg-grid opacity-[0.05]" aria-hidden />
                  <div className="relative size-12 flex items-center justify-center rounded-full bg-success text-success-foreground animate-pulse-glow">
                    <Check className="size-7" strokeWidth={3} />
                  </div>
                  <div className="relative space-y-0.5">
                    <p className="font-display uppercase text-lg font-bold text-success">
                      Vous possédez cet ebook
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Téléchargez-le autant de fois que vous voulez.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => onDownload(ebook)}
                  disabled={downloading === ebook.id}
                  className="w-full h-12 bg-success text-success-foreground hover:bg-success/90 uppercase tracking-widest font-bold text-sm rounded-none"
                >
                  <Download className="size-4" />
                  Télécharger le PDF
                </Button>
              </div>
            ) : orderId ? (
              <div className="space-y-4">
                <div className="border-2 border-primary/40 bg-primary/10 px-4 py-3 text-sm flex items-center gap-2 text-primary">
                  <Check className="size-4" /> Commande #{orderId} créée
                </div>
                {method && (
                  <InstructionsBlock
                    method={method}
                    text={formattedInstructions}
                    copied={copied}
                    onCopy={copyInstructions}
                  />
                )}
                <div>
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                    Joindre votre reçu (recommandé)
                  </Label>
                  <label className="mt-2 flex items-center justify-center gap-2 h-24 border-2 border-dashed border-border hover:border-primary/50 cursor-pointer text-sm text-muted-foreground transition bg-muted/20">
                    <Upload className="size-4" />
                    {file ? file.name : "Glisser ou cliquer pour téléverser"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-none border-2 uppercase tracking-widest text-xs font-bold"
                    onClick={() => {
                      onClose();
                      navigate(`/confirmation?id=${orderId}`);
                    }}
                  >
                    Passer
                  </Button>
                  <Button
                    className="flex-1 h-11 bg-gradient-primary text-primary-foreground rounded-none uppercase tracking-widest text-xs font-bold"
                    disabled={!file || uploading}
                    onClick={uploadReceipt}
                  >
                    {uploading ? "Envoi..." : "Envoyer le reçu"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {ebook.required_fields?.length ? (
                  <div className="space-y-3">
                    {ebook.required_fields.map((f) => (
                      <div key={f.key}>
                        <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                          {f.label}{" "}
                          {f.required && <span className="text-destructive">*</span>}
                        </Label>
                        <Input
                          value={info[f.key] || ""}
                          placeholder={f.placeholder || ""}
                          onChange={(e) =>
                            setInfo({ ...info, [f.key]: e.target.value })
                          }
                          className="mt-1.5 rounded-none border-2"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">
                    Mode de paiement
                  </p>
                  {paymentMethods.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Aucun mode de paiement disponible.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {paymentMethods.map((pm) => (
                        <button
                          key={pm.id}
                          onClick={() => setMethod(pm)}
                          className={cn(
                            "relative border-2 px-3 py-3 text-left transition-all rounded-none",
                            method?.id === pm.id
                              ? "border-primary bg-primary/10 shadow-[4px_4px_0_0_hsl(var(--primary)/0.45)] -translate-y-0.5"
                              : "border-border bg-card hover:border-primary/40 hover:-translate-y-0.5",
                          )}
                        >
                          <span className="text-lg">{pm.icon}</span>
                          <p className="font-bold text-[11px] mt-1 uppercase tracking-wider">
                            {pm.name}
                          </p>
                          {method?.id === pm.id && (
                            <Check className="absolute top-1.5 right-1.5 size-3.5 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {method && (
                  <InstructionsBlock
                    method={method}
                    text={formattedInstructions}
                    copied={copied}
                    onCopy={copyInstructions}
                  />
                )}

                {error && (
                  <p className="text-sm text-destructive border-2 border-destructive/40 bg-destructive/10 px-3 py-2">
                    {error}
                  </p>
                )}

                <Button
                  className="w-full h-12 bg-gradient-primary text-primary-foreground rounded-none uppercase tracking-widest text-sm font-bold"
                  disabled={loading || !method}
                  onClick={submit}
                >
                  <ShoppingBag className="size-4" />
                  {loading
                    ? "Création..."
                    : `Acheter — ${formatXOF(ebook.final_price)}`}
                </Button>
                {!method && (
                  <p className="text-xs text-center text-muted-foreground">
                    ↑ Choisissez un mode de paiement pour continuer
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InstructionsBlock({
  method,
  text,
  copied,
  onCopy,
}: {
  method: PaymentMethod;
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="border-2 border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-foreground inline-flex items-center gap-2">
          <span className="text-base leading-none">{method.icon}</span>
          {method.name}
        </span>
        <button
          onClick={onCopy}
          className="text-[10px] px-2 py-1 bg-background border-2 border-border hover:border-primary/50 inline-flex items-center gap-1.5 uppercase tracking-widest font-bold rounded-none"
        >
          <Copy className="size-3" /> {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono">
        {text}
      </pre>
    </div>
  );
}