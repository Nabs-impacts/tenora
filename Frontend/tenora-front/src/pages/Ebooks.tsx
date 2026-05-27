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
 * Écosystème ebooks autonome : plus de dépendance category tree.
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

  const purchasedIds = useMemo(
    () =>
      new Set(
        myOrders.filter((o) => o.status === "completed").map((o) => o.product_id),
      ),
    [myOrders],
  );

  /* ---------- Genres dérivés depuis la liste ebooks ---------- */
  const ebookCategories = useMemo(() => {
    const seen = new Map<number, string>();
    for (const eb of ebooks) {
      if (eb.ebook_category_id && eb.ebook_category_name && !seen.has(eb.ebook_category_id)) {
        seen.set(eb.ebook_category_id, eb.ebook_category_name);
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [ebooks]);

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  const filteredEbooks = useMemo(
    () =>
      selectedCategory
        ? ebooks.filter((e) => e.ebook_category_id === selectedCategory)
        : ebooks,
    [ebooks, selectedCategory],
  );

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
        <div className="container-app relative py-8 md:py-16">
          <div className="space-y-5 animate-fade-up max-w-3xl">
            <span className="eyebrow inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span className="text-primary">04</span>
              <span className="text-border">//</span>
              Bibliothèque digitale
            </span>

            <h1 className="font-display uppercase font-bold leading-[0.9] text-5xl md:text-8xl tracking-tight">
              Ebooks
            </h1>

            <p className="text-muted-foreground text-base md:text-lg max-w-2xl">
              Dépassez vos limites. Chaque ebook est une arme pour progresser —
              acheté une fois, gardé à vie.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <span className="chip bg-muted/60 text-muted-foreground border border-border">
                <FileText size={12} /> PDF natif
              </span>
              <span className="chip bg-muted/60 text-muted-foreground border border-border">
                <InfinityIcon size={12} /> Accès à vie
              </span>
              <span className="chip bg-muted/60 text-muted-foreground border border-border">
                <Smartphone size={12} /> Tous supports
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
              const count = ebooks.filter((e) => e.ebook_category_id === c.id).length;
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
        ) : filteredEbooks.length === 0 ? (
          <EmptyLibrary
            selectedCategory={selectedCategory}
            onReset={() => setSelectedCategory(null)}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
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
        "shrink-0 px-4 py-1.5 border-2 text-xs uppercase tracking-widest font-bold transition rounded-none",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
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
    <article
      className="brut-card group flex flex-col overflow-hidden cursor-pointer bg-card"
      onClick={onOpen}
    >
      {/* IMAGE — portrait, ratio livre */}
      <div className="relative aspect-[3/4] overflow-hidden bg-muted flex-shrink-0">
        {cover ? (
          <img
            src={cover}
            alt={ebook.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground/30">
            <BookOpen className="size-16" />
          </div>
        )}

        {/* Overlay prix */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/95 via-background/50 to-transparent flex items-end px-3 pb-3">
          <span className="font-display text-lg sm:text-xl font-bold text-primary leading-none">
            {formatXOF(ebook.final_price)}
          </span>
        </div>

        {ebook.discount_percent ? (
          <span className="absolute top-2 left-2 chip bg-destructive text-destructive-foreground border-destructive !text-[9px] !px-1.5 !py-0.5">
            -{Math.round(ebook.discount_percent)}%
          </span>
        ) : null}

        {owned && (
          <span className="absolute top-2 right-2 chip bg-success text-success-foreground border-success !text-[9px] !px-1.5 !py-0.5">
            <Check className="size-2.5" /> OK
          </span>
        )}
      </div>

      {/* INFOS */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <h3 className="font-display font-bold text-xs sm:text-sm md:text-base leading-tight line-clamp-2 min-h-[2.4em]">
          {ebook.name}
        </h3>
        {ebook.ebook_category_name && (
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold truncate">
            {ebook.ebook_category_name}
          </span>
        )}
        {owned ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-auto w-full text-success hover:bg-success/10 border border-success/30 h-7 sm:h-8 text-[10px] sm:text-xs rounded-none uppercase tracking-wider font-bold"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            disabled={downloading}
          >
            <Download className="size-3.5 mr-1" />
            {downloading ? "..." : "Télécharger"}
          </Button>
        ) : (
          <Button
            size="sm"
            className="mt-auto w-full bg-gradient-primary text-primary-foreground h-7 sm:h-8 text-[10px] sm:text-xs rounded-none uppercase tracking-wider font-bold"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="card-elev overflow-hidden">
          <Skeleton className="aspect-[3/4] w-full rounded-none" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4 rounded-none" />
            <Skeleton className="h-3 w-1/2 rounded-none" />
            <Skeleton className="h-7 w-full mt-2 rounded-none" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyLibrary({
  selectedCategory,
  onReset,
}: {
  selectedCategory: number | null;
  onReset: () => void;
}) {
  return (
    <div className="border-2 border-dashed border-border py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.03]" />
      <div className="container-app grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 opacity-20 pointer-events-none mb-12">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="brut-card animate-pulse">
            <div className="aspect-[3/4] bg-muted/50" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-muted/50 rounded w-3/4" />
              <div className="h-3 bg-muted/50 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <div className="relative text-center space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
          // bientôt disponible
        </p>
        <p className="font-display text-2xl md:text-3xl font-bold">
          {selectedCategory ? "Aucun titre dans ce genre." : "Bibliothèque en construction."}
        </p>
        {selectedCategory && (
          <button
            onClick={onReset}
            className="text-xs text-primary underline underline-offset-4 font-bold uppercase tracking-widest"
          >
            Voir tous les ebooks
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================
 * Purchase Dialog — logique métier inchangée, UI refaite
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden max-h-[94dvh] flex flex-col md:flex-row border-2 border-border">
        {/* Image desktop — sticky portrait */}
        {cover && (
          <div className="hidden md:block w-[220px] shrink-0 self-stretch bg-muted">
            <img src={cover} alt={ebook.name} className="w-full h-full object-cover object-top" />
          </div>
        )}

        <div className="flex-1 min-w-0 overflow-y-auto p-5 md:p-6 space-y-5">
          {/* Image mobile */}
          {cover && (
            <div className="md:hidden w-full max-h-[180px] overflow-hidden -mx-5 -mt-5 md:m-0">
              <img src={cover} alt={ebook.name} className="w-full h-[180px] object-cover object-top" />
            </div>
          )}

          <DialogHeader className="text-left space-y-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              {ebook.ebook_category_name || "Ebook"}
            </p>
            <DialogTitle className="font-display uppercase text-2xl md:text-3xl font-bold leading-tight">
              {ebook.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Détails et achat de l&apos;ebook
            </DialogDescription>
          </DialogHeader>

          {/* Prix */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-2xl md:text-3xl font-bold gradient-text">
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
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {ebook.description}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {["PDF natif", "Accès à vie", "Tous appareils"].map((label) => (
              <span
                key={label}
                className="chip bg-muted/60 border-border text-muted-foreground"
              >
                <Check className="size-2.5" /> {label}
              </span>
            ))}
          </div>

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
                        onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })}
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
                          "brut-card p-3 text-left text-sm transition",
                          method?.id === pm.id && "border-primary bg-primary/10",
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
                {loading ? "Création..." : `Acheter — ${formatXOF(ebook.final_price)}`}
              </Button>
              {!method && (
                <p className="text-xs text-center text-muted-foreground">
                  ↑ Choisissez un mode de paiement pour continuer
                </p>
              )}
            </div>
          )}
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