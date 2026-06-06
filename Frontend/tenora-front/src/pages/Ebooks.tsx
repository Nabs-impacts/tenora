import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Download,
  Check,
  Upload,
  ShoppingBag,
  FileText,
  Infinity as InfinityIcon,
  Smartphone,
  Library,
  Zap,
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
import { PaymentLogo } from "@/components/payment/PaymentLogo";
import { PaymentInstructions } from "@/components/payment/PaymentInstructions";

/* ================================================================
 * Page Ebooks — Tenora Brutalist Edition
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
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: () => ordersApi.myOrders().then((r) => r.data),
  });

  const purchasedIds = useMemo(
    () =>
      new Set(
        myOrders.filter((o) => o.status === "completed").map((o) => o.product_id),
      ),
    [myOrders],
  );

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

  const [selected, setSelected] = useState<Ebook | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  async function openEbookEndpoint(eb: Ebook, mode: "download" | "read") {
    if (!user) {
      toast.error("Connectez-vous pour acceder a cet ebook.");
      navigate("/connexion");
      return;
    }
    setDownloading(eb.id);
    try {
      const { data } = await ebooksApi.getPresignedUrl(eb.id, mode);
      if (!data.url) throw new Error("URL ebook manquante");
      if (mode === "read") {
        window.location.assign(data.url);
      } else {
        const link = document.createElement("a");
        link.href = data.url;
        link.download = data.filename || `${eb.name}.pdf`;
        link.rel = "noopener noreferrer";
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      toast.success(mode === "read" ? "Ouverture du PDF..." : "Telechargement demarre !");
    } catch (error: any) {
      const message = error?.response?.data?.detail || "Impossible d'acceder au fichier.";
      toast.error(message);
    } finally {
      setTimeout(() => setDownloading(null), 600);
    }
  }

  const handleDownload = (eb: Ebook) => openEbookEndpoint(eb, "download");
  const handleRead = (eb: Ebook) => openEbookEndpoint(eb, "read");

  return (
    <div>
      {/* ============ HERO ============ */}
      <HeroSection ebooks={ebooks.slice(0, 4)} isLoading={isLoading} />

      {/* ============ FILTRES ============ */}
      {ebookCategories.length > 1 && (
        <section className="sticky top-0 z-20 border-b-2 border-border bg-background/90 backdrop-blur-md">
          <div className="container-app py-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <CategoryChip
              active={selectedCategory === null}
              onClick={() => setSelectedCategory(null)}
              label={`Tous · ${ebooks.length}`}
            />
            {ebookCategories.map((c) => {
              const count = ebooks.filter((e) => e.ebook_category_id === c.id).length;
              return (
                <CategoryChip
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
      <section id="ebooks-grid" className="container-app py-12 md:py-16">
        {isLoading ? (
          <EbooksGridSkeleton />
        ) : filteredEbooks.length === 0 ? (
          <EmptyLibrary
            selectedCategory={selectedCategory}
            onReset={() => setSelectedCategory(null)}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 md:gap-6">
            {filteredEbooks.map((eb) => (
              <EbookCard
                key={eb.id}
                ebook={eb}
                owned={purchasedIds.has(eb.id)}
                downloading={downloading === eb.id}
                onOpen={() => setSelected(eb)}
                onDownload={() => handleDownload(eb)}
                onRead={() => handleRead(eb)}
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
        onRead={handleRead}
        downloading={downloading}
        paymentMethods={site?.payment_methods?.filter((p) => p.enabled) ?? []}
      />
    </div>
  );
}

/* ================================================================
 * HeroSection — Tenora brutalist hero
 * ============================================================== */
function HeroSection({
  ebooks,
  isLoading,
}: {
  ebooks: Ebook[];
  isLoading: boolean;
}) {
  const scrollToGrid = () => {
    document.getElementById("ebooks-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      className="relative overflow-hidden border-b-2 border-border bg-gradient-hero"
    >
      {/* Grid texture */}
      <div className="absolute inset-0 bg-grid opacity-[0.07]" aria-hidden />

      <div className="container-app relative py-16 md:py-24 flex items-center justify-between gap-10">
        {/* ── Left: copy ── */}
        <div className="flex-1 space-y-6 animate-fade-up max-w-xl">

          {/* Eyebrow — Tenora style : border-2, no rounded */}
          <div className="inline-flex items-center gap-2 border-2 border-border bg-card px-3 py-1.5">
            <span className="size-2 bg-primary animate-pulse" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
              Bibliothèque digitale · Tenora
            </span>
          </div>

          {/* Heading */}
          <h1 className="font-display uppercase font-bold leading-[0.88] text-[clamp(42px,8vw,86px)] tracking-tight">
            Tenora
            <br />
            <span className="gradient-text">Library</span>
          </h1>

          {/* Subline */}
          <p className="text-muted-foreground text-base md:text-lg max-w-md leading-relaxed normal-case tracking-normal">
            Développez vos compétences avec des ressources sélectionnées pour
            accélérer votre progression.{" "}
            <strong className="text-foreground">Zéro délai. Zéro galère.</strong>
          </p>

          {/* CTA row */}
          <div className="flex flex-wrap items-center gap-5 pt-1">
            <button
              onClick={scrollToGrid}
              className="group relative brut-btn-shadow"
            >
              <div className="relative bg-primary text-primary-foreground border-2 border-primary px-6 py-3.5 flex items-center gap-3 transition-colors group-hover:bg-background group-hover:text-primary">
                <BookOpen className="size-4" />
                <span className="font-display text-xl uppercase font-bold tracking-wider">
                  Explorer les ebooks
                </span>
              </div>
            </button>
            {!isLoading && ebooks.length > 0 && (
              <span className="text-sm text-muted-foreground font-mono">
                <span className="text-foreground font-bold">{ebooks.length}</span>{" "}
                titres disponibles
              </span>
            )}
          </div>

          {/* Feature chips — chip class, no rounded-full */}
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { Icon: FileText, label: "PDF natif" },
              { Icon: InfinityIcon, label: "Accès à vie" },
              { Icon: Smartphone, label: "Tous supports" },
              { Icon: Zap, label: "Livraison instant" },
            ].map(({ Icon, label }) => (
              <span key={label} className="chip border-border text-muted-foreground">
                <Icon size={10} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Right: stacked book covers ── */}
        <div className="hidden lg:block relative flex-shrink-0 w-[440px] h-[380px]">
          {/* Book cover stack */}
          {(isLoading ? Array.from({ length: 4 }) : ebooks).slice(0, 4).map((eb, i) => {
            const book = eb as Ebook | undefined;
            const cover = book
              ? resolveAssetUrl(book.image_url || book.image_path)
              : null;

            const configs = [
              {
                transform: "rotate(-10deg) translateX(-105px) translateY(18px) scale(0.80)",
                z: 1,
                shadow: "0 16px 48px -8px rgba(0,0,0,0.55)",
              },
              {
                transform: "rotate(-4deg) translateX(-42px) translateY(-6px) scale(0.90)",
                z: 2,
                shadow: "0 20px 56px -8px rgba(0,0,0,0.50)",
              },
              {
                transform: "rotate(2deg) translateX(38px) translateY(-22px) scale(1)",
                z: 4,
                shadow: "0 28px 72px -6px rgba(0,0,0,0.45)",
              },
              {
                transform: "rotate(9deg) translateX(112px) translateY(8px) scale(0.82)",
                z: 2,
                shadow: "0 16px 48px -8px rgba(0,0,0,0.50)",
              },
            ];

            const cfg = configs[i];

            return (
              <div
                key={i}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[138px] overflow-hidden transition-transform duration-500 hover:scale-[1.04]"
                style={{
                  transform: cfg.transform,
                  boxShadow: cfg.shadow,
                  zIndex: cfg.z,
                  aspectRatio: "2/3",
                }}
              >
                {isLoading ? (
                  <div className="w-full h-full bg-muted animate-pulse" />
                ) : cover ? (
                  <img
                    src={cover}
                    alt={book?.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-card border-2 border-border flex items-center justify-center">
                    <BookOpen className="size-8 text-muted-foreground/20" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ================================================================
 * CategoryChip — brutalist, no rounded-full
 * ============================================================== */
function CategoryChip({
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
        "shrink-0 px-3 py-1.5 border-2 text-[10px] uppercase tracking-[0.12em] font-bold font-mono transition-all duration-150",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground bg-transparent hover:border-primary/50 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/* ================================================================
 * EbookCard — brut-card, no stars, no glow, no rounded
 * ============================================================== */
function EbookCard({
  ebook,
  owned,
  downloading,
  onOpen,
  onDownload,
  onRead,
}: {
  ebook: Ebook;
  owned: boolean;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onRead: () => void;
}) {
  const cover = resolveAssetUrl(ebook.image_url || ebook.image_path);

  return (
    <article
      onClick={onOpen}
      className="group cursor-pointer brut-card overflow-hidden"
    >
      {/* ── Cover Zone ── */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "2/3" }}>
        {cover ? (
          <img
            src={cover}
            alt={ebook.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-card gap-3 border-b-2 border-border">
            <BookOpen className="size-12 text-muted-foreground/20" />
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-muted-foreground/35">
              no cover
            </span>
          </div>
        )}

        {/* Discount badge */}
        {ebook.discount_percent && !owned && (
          <span className="absolute top-0 left-0 chip bg-destructive text-destructive-foreground border-destructive">
            −{Math.round(ebook.discount_percent)}%
          </span>
        )}

        {/* Owned overlay */}
        {owned && (
          <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <span className="chip border-success text-success bg-success/10">
              <Check className="size-2.5" strokeWidth={3} />
              Bibliothèque
            </span>
          </div>
        )}
      </div>

      {/* ── Content Zone ── */}
      <div className="p-3 space-y-1.5 bg-card">
        {/* Category */}
        {ebook.ebook_category_name && (
          <p className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-primary/70 leading-none">
            // {ebook.ebook_category_name}
          </p>
        )}

        {/* Title */}
        <h3 className="font-display font-bold text-sm leading-snug line-clamp-2 text-foreground transition-colors duration-150 group-hover:text-primary">
          {ebook.name}
        </h3>

        {/* Price row */}
        <div className="flex items-center justify-between pt-0.5">
          {owned ? (
            <span className="chip border-success text-success bg-success/10">
              <Check className="size-2.5" strokeWidth={3} />
              Acheté
            </span>
          ) : (
            <span className="font-display text-base font-bold text-primary">
              {formatXOF(ebook.final_price)}
            </span>
          )}
        </div>

        {/* Action buttons — expand on hover */}
        <div className="max-h-0 overflow-hidden group-hover:max-h-[60px] transition-all duration-300">
          <div className="pt-1.5 flex gap-1.5">
            {owned ? (
              <>
                <Button
                  size="sm"
                  className="flex-1 h-7 rounded-none text-[9px] uppercase tracking-wide font-bold border-2 border-success text-success bg-success/10 hover:bg-success hover:text-success-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload();
                  }}
                  disabled={downloading}
                >
                  <Download className="size-2.5 mr-0.5" />
                  {downloading ? "..." : "PDF"}
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-7 rounded-none text-[9px] uppercase tracking-wide font-bold border-2 border-border text-muted-foreground bg-muted/40 hover:border-primary/50 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRead();
                  }}
                >
                  <BookOpen className="size-2.5 mr-0.5" />
                  Lire
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="w-full h-7 rounded-none text-[9px] uppercase tracking-wide font-bold border-2 border-primary bg-primary text-primary-foreground hover:bg-background hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
              >
                Voir &amp; Acheter
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ================================================================
 * Skeleton
 * ============================================================== */
function EbooksGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 md:gap-6">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="border-2 border-border bg-card overflow-hidden">
          <Skeleton className="w-full rounded-none" style={{ aspectRatio: "2/3" }} />
          <div className="p-3 space-y-2">
            <Skeleton className="h-2 w-16 rounded-none" />
            <Skeleton className="h-3.5 w-full rounded-none" />
            <Skeleton className="h-2.5 w-3/4 rounded-none" />
            <Skeleton className="h-5 w-24 rounded-none" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================
 * Empty state
 * ============================================================== */
function EmptyLibrary({
  selectedCategory,
  onReset,
}: {
  selectedCategory: number | null;
  onReset: () => void;
}) {
  return (
    <div className="border-2 border-dashed border-border py-24 relative overflow-hidden flex flex-col items-center justify-center gap-5 text-center">
      <div className="absolute inset-0 bg-grid opacity-[0.04]" />
      <Library className="relative size-10 text-muted-foreground/25" />
      <div className="relative space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono font-bold">
          // bientôt disponible
        </p>
        <p className="font-display text-2xl md:text-3xl font-bold uppercase">
          {selectedCategory ? "Aucun titre dans ce genre." : "Bibliothèque en construction."}
        </p>
      </div>
      {selectedCategory && (
        <button
          onClick={onReset}
          className="relative text-xs text-primary underline underline-offset-4 font-bold uppercase tracking-widest transition-opacity hover:opacity-70"
        >
          Voir tous les ebooks
        </button>
      )}
    </div>
  );
}

/* ================================================================
 * Purchase Dialog
 * ============================================================== */
function EbookPurchaseDialog({
  ebook,
  owned,
  onClose,
  onDownload,
  onRead,
  downloading,
  paymentMethods,
}: {
  ebook: Ebook | null;
  owned: boolean;
  onClose: () => void;
  onDownload: (e: Ebook) => void;
  onRead: (e: Ebook) => void;
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
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (ebook) {
      setInfo({});
      setMethod(null);
      setError("");
      setOrderId(null);
      setFile(null);
      setDescExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ebook?.id]);

  if (!ebook) return null;

  const cover = resolveAssetUrl(ebook.image_url || ebook.image_path);

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

  const features: { label: string; Icon: typeof FileText }[] = [
    { label: "PDF natif", Icon: FileText },
    { label: "Accès à vie", Icon: InfinityIcon },
    { label: "Tous appareils", Icon: Smartphone },
  ];

  return (
    <Dialog open={!!ebook} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden h-[88dvh] flex flex-col md:flex-row border-2 border-border rounded-none">

        {/* ── Colonne image desktop ── */}
        {cover && (
          <div className="hidden md:flex flex-col w-[280px] shrink-0 self-stretch bg-black relative overflow-hidden">
            {/* Fond flouté ambient */}
            <div
              className="absolute inset-0 scale-110 blur-2xl opacity-40"
              style={{ backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" }}
            />
            <div className="absolute inset-0 bg-black/60" />
            {/* Cover + prix */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-5 gap-4">
              <img
                src={cover}
                alt={ebook.name}
                className="w-full max-h-[72%] object-contain drop-shadow-[0_8px_40px_rgba(0,0,0,0.9)]"
              />
              <p className="font-display text-2xl font-bold text-primary text-center leading-none">
                {formatXOF(ebook.final_price)}
              </p>
            </div>
          </div>
        )}

        {/* ── Contenu scrollable ── */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">

          {/* Image mobile */}
          {cover && (
            <div className="md:hidden relative w-full overflow-hidden bg-black shrink-0" style={{ height: "240px" }}>
              <img
                src={cover}
                alt={ebook.name}
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-4">
                <p className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-white/50 mb-0.5">
                  // {ebook.ebook_category_name || "Ebook"}
                </p>
                <h2 className="font-display uppercase text-xl font-bold leading-tight text-white line-clamp-2">
                  {ebook.name}
                </h2>
                <p className="font-display text-2xl font-bold text-primary mt-0.5">
                  {formatXOF(ebook.final_price)}
                </p>
              </div>
            </div>
          )}

          <div className="p-5 md:p-6 space-y-5 flex-1">
            {/* Header desktop */}
            <DialogHeader className="text-left space-y-1 hidden md:block">
              <p className="text-[9px] font-mono uppercase tracking-[0.15em] font-bold text-muted-foreground">
                // {ebook.ebook_category_name || "Ebook"}
              </p>
              <DialogTitle className="font-display uppercase text-2xl md:text-3xl font-bold leading-tight">
                {ebook.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Détails et achat de l&apos;ebook
              </DialogDescription>
            </DialogHeader>
            <DialogTitle className="sr-only md:hidden">{ebook.name}</DialogTitle>
            <DialogDescription className="sr-only md:hidden">
              Détails et achat de l&apos;ebook
            </DialogDescription>

            {/* Prix desktop */}
            <div className="hidden md:flex items-baseline gap-3 flex-wrap">
              <span className="font-display text-3xl font-bold gradient-text">
                {formatXOF(ebook.final_price)}
              </span>
              {ebook.discount_percent ? (
                <span className="chip border-destructive/30 bg-destructive/10 text-destructive">
                  −{Math.round(ebook.discount_percent)}%
                </span>
              ) : null}
            </div>

            {/* Chips features */}
            <div className="flex flex-wrap gap-2">
              {features.map(({ label, Icon }) => (
                <span key={label} className="chip border-border text-muted-foreground">
                  <Icon className="size-3" /> {label}
                </span>
              ))}
            </div>

            {/* Description */}
            {ebook.description && (
              <>
                <div className="border-t-2 border-border" />
                <div className="space-y-2">
                  <p className="text-[9px] font-mono uppercase tracking-[0.15em] font-bold text-muted-foreground">
                    // À propos
                  </p>
                  <p
                    className={cn(
                      "text-sm text-muted-foreground leading-relaxed whitespace-pre-line normal-case tracking-normal",
                      !descExpanded && "line-clamp-4",
                    )}
                  >
                    {ebook.description}
                  </p>
                  {ebook.description.length > 240 && (
                    <button
                      onClick={() => setDescExpanded((v) => !v)}
                      className="text-[10px] text-primary underline underline-offset-4 font-bold uppercase tracking-widest"
                    >
                      {descExpanded ? "Voir moins ↑" : "Voir plus ↓"}
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="border-t-2 border-border" />

            {/* ── État: owned ── */}
            {owned ? (
              <div className="space-y-4">
                <div className="relative border-2 border-success/40 bg-success/10 px-5 py-6 flex flex-col items-center gap-3 text-center overflow-hidden">
                  <div className="absolute inset-0 bg-grid opacity-[0.05]" aria-hidden />
                  <div className="relative size-12 flex items-center justify-center border-2 border-success bg-success text-success-foreground animate-pulse-glow">
                    <Check className="size-7" strokeWidth={3} />
                  </div>
                  <div className="relative space-y-0.5">
                    <p className="font-display uppercase text-lg font-bold text-success">
                      Vous possédez cet ebook
                    </p>
                    <p className="text-xs text-muted-foreground normal-case tracking-normal">
                      Téléchargez ou lisez directement — autant de fois que vous voulez.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    onClick={() => onDownload(ebook)}
                    disabled={downloading === ebook.id}
                    className="w-full h-12 border-2 border-success bg-success text-success-foreground hover:bg-background hover:text-success uppercase tracking-widest font-bold text-sm rounded-none"
                  >
                    <Download className="size-4 mr-1.5" />
                    {downloading === ebook.id ? "..." : "Télécharger le PDF"}
                  </Button>
                  <Button
                    onClick={() => onRead(ebook)}
                    variant="outline"
                    className="w-full h-12 rounded-none border-2 uppercase tracking-widest font-bold text-sm"
                  >
                    <BookOpen className="size-4 mr-1.5" />
                    Lire dans le navigateur
                  </Button>
                </div>
              </div>

            /* ── État: commande créée ── */
            ) : orderId ? (
              <div className="space-y-4">
                {/* Confirmation commande */}
                <div className="flex items-center gap-2 border-2 border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                  <Check className="size-4 shrink-0" />
                  <span className="font-bold">Commande #{orderId} créée</span>
                </div>

                {/* Instructions de paiement */}
                {method && (
                  <PaymentInstructions
                    methodId={method.id}
                    methodName={method.name}
                    rawInstructions={method.instructions}
                    amountFormatted={formatXOF(ebook.final_price)}
                    orderId={orderId}
                  />
                )}

                {/* Upload reçu */}
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground font-mono">
                    // Joindre votre reçu (recommandé)
                  </Label>
                  <label className="flex items-center justify-center gap-2 h-24 border-2 border-dashed border-border hover:border-primary cursor-pointer text-sm text-muted-foreground transition-colors bg-muted/10">
                    <Upload className="size-4" />
                    {file ? (
                      <span className="text-foreground font-medium truncate max-w-[200px]">{file.name}</span>
                    ) : (
                      "Glisser ou cliquer pour téléverser"
                    )}
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
                    className="flex-1 rounded-none border-2 uppercase tracking-widest text-xs font-bold h-11"
                    onClick={() => {
                      onClose();
                      navigate(`/confirmation?id=${orderId}`);
                    }}
                  >
                    Passer
                  </Button>
                  <Button
                    className="flex-1 h-11 border-2 border-primary bg-primary text-primary-foreground hover:bg-background hover:text-primary rounded-none uppercase tracking-widest text-xs font-bold"
                    disabled={!file || uploading}
                    onClick={uploadReceipt}
                  >
                    {uploading ? "Envoi..." : "Envoyer le reçu"}
                  </Button>
                </div>
              </div>

            /* ── État: formulaire d'achat ── */
            ) : (
              <div className="space-y-5">
                {/* Champs requis */}
                {ebook.required_fields?.length ? (
                  <div className="space-y-3">
                    {ebook.required_fields.map((f) => (
                      <div key={f.key}>
                        <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground font-mono">
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

                {/* Sélection mode de paiement */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground font-mono">
                    // Mode de paiement
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
                            "relative border-2 p-3 flex flex-col items-center gap-2 transition-all duration-150 bg-card hover:border-primary/50",
                            method?.id === pm.id
                              ? "border-primary bg-primary/10"
                              : "border-border",
                          )}
                        >
                          <PaymentLogo methodId={pm.id} name={pm.name} variant="tile" />
                          <p className="font-bold text-[11px] uppercase tracking-wider text-center leading-tight">
                            {pm.name}
                          </p>
                          {method?.id === pm.id && (
                            <span className="absolute top-1.5 right-1.5 size-4 flex items-center justify-center bg-primary text-primary-foreground">
                              <Check className="size-3" strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Prévisualisation instructions avant commande */}
                {method && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground font-mono">
                      // Aperçu des instructions de paiement
                    </p>
                    <PaymentInstructions
                      methodId={method.id}
                      methodName={method.name}
                      rawInstructions={method.instructions}
                      amountFormatted={formatXOF(ebook.final_price)}
                      orderId={null}
                    />
                  </div>
                )}

                {/* Erreur */}
                {error && (
                  <p className="text-sm text-destructive border-2 border-destructive/40 bg-destructive/10 px-3 py-2.5 font-mono">
                    ⚠ {error}
                  </p>
                )}

                {/* CTA achat */}
                <Button
                  className="w-full border-2 border-primary bg-primary text-primary-foreground hover:bg-background hover:text-primary rounded-none uppercase tracking-widest text-sm font-bold transition-colors"
                  style={{ height: "52px" }}
                  disabled={loading || !method}
                  onClick={submit}
                >
                  <ShoppingBag className="size-4 mr-2" />
                  {loading ? "Création..." : `Acheter — ${formatXOF(ebook.final_price)}`}
                </Button>

                {!method && (
                  <p className="text-[10px] text-center text-muted-foreground font-mono">
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
