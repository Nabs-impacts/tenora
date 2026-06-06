import { useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Loader2,
  Minus,
  Plus,
  Upload,
  ShieldCheck,
  Zap,
  Image as ImageIcon,
  MessageCircle,
  Clock,
  BadgeCheck,
  Tag,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  productsApi,
  ordersApi,
  couponsApi,
  formatXOF,
  type Order,
  type CouponValidation,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSite } from "@/context/SiteContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HighlightedText } from "@/components/ui/HighlightedText";
import { PaymentLogo, getPaymentAccent } from "@/components/payment/PaymentLogo";
import { PaymentInstructions } from "@/components/payment/PaymentInstructions";

function cleanDescription(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[.\u2026\-—_*•·]+$/.test(l))
    .map((l) =>
      /^[a-zàâäéèêëîïôöùûüç]/.test(l) ? l.charAt(0).toUpperCase() + l.slice(1) : l
    )
    .join("\n");
}

export default function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { data: site } = useSite();
  const productId = Number(id);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => productsApi.getProduct(productId).then((r) => r.data),
    enabled: !!productId,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  // ─── Quantity ──────────────────────────────────────────
  const initialQty = Math.max(1, parseInt(searchParams.get("qty") || "1", 10));
  const [quantity, setQuantity] = useState(initialQty);

  const [fields, setFields] = useState<Record<string, string>>({}); 
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [orderError, setOrderError] = useState("");

  // ─── Coupon state ──────────────────────────────────────
  const COUPON_PREFIX = "TENORA-";
  const COUPON_MAX_INPUT = 20; // "TENORA-" + 13 chars max
  const [couponInput, setCouponInput] = useState(COUPON_PREFIX);
  const [couponLoading, setCouponLoading] = useState(false);
  const [coupon, setCoupon] = useState<CouponValidation | null>(null);
  const [couponError, setCouponError] = useState("");

  const paymentMethods = (site?.payment_methods || []).filter((m) => m.enabled);
  const wa = site?.whatsapp_number?.replace(/\D/g, "") || "";

  if (isLoading)
    return (
      <div className="container-app py-10">
        <div className="grid md:grid-cols-2 gap-8 animate-pulse">
          <div className="aspect-square bg-muted" />
          <div className="space-y-3">
            <div className="h-8 w-2/3 bg-muted" />
            <div className="h-4 w-full bg-muted" />
            <div className="h-12 w-1/2 bg-muted" />
            <div className="h-24 w-full bg-muted" />
          </div>
        </div>
      </div>
    );

  if (error || !product) {
    return (
      <div className="container-app py-20 text-center">
        <p className="text-muted-foreground mb-4">Produit introuvable.</p>
        <Button asChild variant="outline">
          <Link to="/boutique">
            <ArrowLeft className="size-4" /> Retour boutique
          </Link>
        </Button>
      </div>
    );
  }

  const basePrice = product.final_price ?? product.price;
  const unitTotal = coupon
    ? coupon.final_total ??
      coupon.final_price ??
      Math.max(0, basePrice - (coupon.discount_amount || 0))
    : basePrice;
  const finalTotal = unitTotal * quantity;
  const maxQty = product.stock > 0 ? product.stock : 99;

  // Reset coupon when quantity changes (needs re-validation)
  const handleQuantityChange = (newQty: number) => {
    const clamped = Math.min(maxQty, Math.max(1, newQty));
    setQuantity(clamped);
    if (coupon) {
      removeCoupon();
      toast.info("Quantité modifiée — veuillez revalider votre code promo.");
    }
  };

  const validateFields = () => {
    if (!product.required_fields) return true;
    for (const f of product.required_fields) {
      if (f.required && !fields[f.key]?.trim()) {
        setOrderError(`Le champ « ${f.label} » est obligatoire.`);
        return false;
      }
      if (f.regex && fields[f.key]) {
        try {
          if (!new RegExp(f.regex).test(fields[f.key])) {
            setOrderError(`Le champ « ${f.label} » est invalide.`);
            return false;
          }
        } catch {
          /* */
        }
      }
    }
    return true;
  };

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || code === COUPON_PREFIX) {
      setCouponError("Complétez votre code après « TENORA- ».");
      return;
    }
    setCouponError("");
    setCouponLoading(true);
    try {
      const r = await couponsApi.validate({
        code,
        product_id: product.id,
        quantity,
      });
      if (!r.data.valid) {
        setCouponError(r.data.reason || r.data.message || "Code promo invalide.");
        setCoupon(null);
      } else {
        setCoupon(r.data);
        toast.success(
          `Code « ${r.data.code} » appliqué — ${formatXOF(r.data.discount_amount)} de réduction.`
        );
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Code promo invalide ou expiré.";
      setCouponError(typeof msg === "string" ? msg : "Code promo invalide.");
      setCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponInput(COUPON_PREFIX);
    setCouponError("");
  };

  const handleCreate = async () => {
    setOrderError("");
    if (!user) {
      navigate(`/connexion?redirect=/produit/${product.id}`);
      return;
    }
    if (!user.is_verified) {
      navigate("/verifier-email");
      return;
    }
    if (product.whatsapp_redirect && wa) {
      const params = new URLSearchParams();
      Object.entries(fields).forEach(([k, v]) => v && params.append(k, v));
      window.open(productsApi.getWhatsappLink(product.id, params), "_blank");
      return;
    }
    if (!validateFields()) {
      requestAnimationFrame(() => {
        document
          .getElementById("order-form-top")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    if (!paymentMethod) {
      setOrderError("Choisissez un moyen de paiement.");
      return;
    }
    setCreating(true);
    try {
      const r = await ordersApi.create({
        product_id: product.id,
        quantity,
        customer_info: fields,
        payment_method: paymentMethod,
        coupon_code: coupon?.code,
      });
      setOrder(r.data);
    } catch (e: any) {
      setOrderError(e?.response?.data?.detail || "Une erreur est survenue.");
    } finally {
      setCreating(false);
    }
  };

  const handleUpload = async () => {
    if (!order || !file) return;
    setUploading(true);
    try {
      await ordersApi.uploadScreenshot(order.id, file);
      toast.success("Capture envoyée — votre commande est en cours de validation.");
      const method =
        paymentMethods.find((m) => m.id === order.payment_method)?.name ||
        order.payment_method ||
        "";
      navigate(
        `/confirmation?orderId=${order.id}&product=${encodeURIComponent(
          product.name
        )}&amount=${encodeURIComponent(formatXOF(order.total_price))}&method=${encodeURIComponent(
          method
        )}`
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Échec de l'envoi de la capture.");
    } finally {
      setUploading(false);
    }
  };

  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethod);

  return (
    // pb-28 mobile = laisse de la place pour la sticky CTA (~88px) + safe area
    <div className="container-app py-4 md:py-10 pb-28 md:pb-10">
      {/* Breadcrumb */}
      <nav
        aria-label="Fil d'Ariane"
        className="mb-4 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 text-muted-foreground overflow-x-auto whitespace-nowrap"
      >
        <Link to="/" className="hover:text-foreground transition-colors">
          Accueil
        </Link>
        <ChevronRight className="size-3 shrink-0" />
        <Link to="/boutique" className="hover:text-foreground transition-colors">
          Boutique
        </Link>
        <ChevronRight className="size-3 shrink-0" />
        <span className="text-foreground truncate max-w-[55vw] md:max-w-none">{product.name}</span>
      </nav>

      <div id="order-form-top" className="grid md:grid-cols-2 gap-6 md:gap-10">
        {/* IMAGE */}
        <div>
          <div className="aspect-square overflow-hidden card-elev">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full flex items-center justify-center text-muted-foreground bg-muted">
                <ImageIcon className="size-16 opacity-30" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="flex flex-col items-center gap-1.5 border-2 border-success/50 bg-success/10 px-2 py-2.5 text-center">
              <Check className="size-4 text-success" strokeWidth={2.5} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-success leading-tight">
                En stock
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5 border-2 border-primary/50 bg-primary/10 px-2 py-2.5 text-center">
              <Clock className="size-4 text-primary" strokeWidth={2.5} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary leading-tight">
                {"< 30 min"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5 border-2 border-amber-500/50 bg-amber-500/10 px-2 py-2.5 text-center">
              <ShieldCheck className="size-4 text-amber-500" strokeWidth={2.5} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 leading-tight">
                Sécurisé
              </span>
            </div>
          </div>
        </div>

        {/* INFO + ACTION */}
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold break-words">
              {product.name}
            </h1>
            {product.description &&
              (() => {
                const desc = cleanDescription(product.description);
                return desc ? (
                  <HighlightedText
                    text={desc}
                    className="text-muted-foreground mt-2 leading-relaxed"
                  />
                ) : null;
              })()}
          </div>

          <div className="space-y-1">
            {/* Prix unitaire — toujours affiché */}
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-display text-3xl md:text-4xl font-bold gradient-text">
                {formatXOF(unitTotal)}
              </span>
              {coupon ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {formatXOF(basePrice)}
                  </span>
                  <span className="chip bg-success text-success-foreground font-bold">
                    -{formatXOF(coupon.discount_amount)}
                  </span>
                </>
              ) : product.discount_percent ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {formatXOF(product.price)}
                  </span>
                  <span className="chip bg-destructive text-destructive-foreground font-bold">
                    -{product.discount_percent}%
                  </span>
                </>
              ) : null}
            </div>
            {/* Total dynamique — visible seulement si qty > 1 */}
            {quantity > 1 && (
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground font-mono">
                  ×{quantity} =
                </span>
                <span className="font-display text-2xl font-bold gradient-text tabular-nums">
                  {formatXOF(finalTotal)}
                </span>
              </div>
            )}
          </div>


          {/* ── Quantité ──────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground">Quantité</span>
            <div className="flex items-center gap-0 border-2 border-border">
              <button
                type="button"
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= 1}
                aria-label="Diminuer"
                className="size-9 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r-2 border-border"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-[2.5rem] text-center font-mono font-bold text-base tabular-nums px-1">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => handleQuantityChange(quantity + 1)}
                disabled={quantity >= maxQty}
                aria-label="Augmenter"
                className="size-9 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l-2 border-border"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

          </div>

          <div className="card-elev p-4 md:p-5 space-y-4">
            {!order ? (
              <>
                {orderError && (
                  <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm px-3 py-2">
                    {orderError}
                  </div>
                )}
                {product.required_fields && product.required_fields.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b-2 border-border">
                      <BadgeCheck className="size-4 text-primary" />
                      <p className="font-bold text-sm uppercase tracking-wider">
                        Informations requises
                      </p>
                    </div>
                    {product.required_fields.map((f) => (
                      <div key={f.key}>
                        <label className="text-xs font-medium text-muted-foreground">
                          {f.label}
                          {f.required && <span className="text-destructive"> *</span>}
                        </label>
                        <input
                          value={fields[f.key] || ""}
                          onChange={(e) =>
                            setFields((p) => ({ ...p, [f.key]: e.target.value }))
                          }
                          placeholder={f.placeholder || ""}
                          className="mt-1 w-full h-11 px-3 bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {!product.whatsapp_redirect && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 pb-2 border-b-2 border-border">
                      <Tag className="size-4 text-primary" />
                      <p className="font-bold text-sm uppercase tracking-wider">Code promo</p>
                    </div>

                    {coupon ? (
                      <div className="flex items-center justify-between gap-2 border-2 border-success/50 bg-success/10 px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <BadgeCheck className="size-4 text-success shrink-0" />
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-success truncate">
                              {coupon.code}
                            </p>
                            <p className="text-[11px] text-success/80">
                              -{formatXOF(coupon.discount_amount)} appliqué
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={removeCoupon}
                          className="p-1.5 hover:bg-success/20 transition-colors"
                          aria-label="Retirer le code promo"
                        >
                          <X className="size-4 text-success" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <input
                            value={couponInput}
                            onChange={(e) => {
                              let v = e.target.value.toUpperCase();
                              if (!v.startsWith(COUPON_PREFIX)) v = COUPON_PREFIX;
                              if (v.length > COUPON_MAX_INPUT)
                                v = v.slice(0, COUPON_MAX_INPUT);
                              setCouponInput(v);
                              if (couponError) setCouponError("");
                            }}
                            onKeyDown={(e) => {
                              const t = e.currentTarget;
                              if (
                                (e.key === "Backspace" || e.key === "Delete") &&
                                (t.selectionStart ?? 0) <= COUPON_PREFIX.length &&
                                (t.selectionEnd ?? 0) <= COUPON_PREFIX.length
                              ) {
                                e.preventDefault();
                                return;
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyCoupon();
                              }
                            }}
                            onFocus={(e) => {
                              const len = e.currentTarget.value.length;
                              requestAnimationFrame(() =>
                                e.currentTarget.setSelectionRange(
                                  Math.max(len, COUPON_PREFIX.length),
                                  Math.max(len, COUPON_PREFIX.length)
                                )
                              );
                            }}
                            placeholder={`${COUPON_PREFIX}XXXXXXXX`}
                            inputMode="text"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            className="flex-1 h-11 px-3 bg-input border border-border text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                            maxLength={COUPON_MAX_INPUT}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={applyCoupon}
                            disabled={
                              couponLoading ||
                              !couponInput.trim() ||
                              couponInput.trim() === COUPON_PREFIX
                            }
                            className="h-11 px-4 shrink-0"
                          >
                            {couponLoading ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Appliquer"
                            )}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Format : TENORA- suivi de votre code (13 caractères max).
                        </p>
                        {couponError && (
                          <div className="text-xs text-destructive flex items-start gap-1.5">
                            <X className="size-3.5 mt-0.5 shrink-0" />
                            <span>
                              {couponError}
                              {wa && (
                                <>
                                  {" — "}
                                  <a
                                    href={`https://wa.me/${wa}?text=${encodeURIComponent(
                                      `Bonjour Tenora ! Mon code promo ne fonctionne pas pour "${product.name}". Pouvez-vous m'aider ?`
                                    )}`}
                                    target="_blank"
                                    rel="noopener"
                                    className="underline font-semibold hover:text-foreground"
                                  >
                                    aide WhatsApp
                                  </a>
                                </>
                              )}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {!product.whatsapp_redirect && paymentMethods.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm">Moyen de paiement</p>
                      {selectedMethod && (
                        <span className="text-[10px] uppercase tracking-widest font-bold text-primary font-mono">
                          {selectedMethod.name} sélectionné
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {paymentMethods.map((m) => {
                        const active = paymentMethod === m.id;
                        const accent = getPaymentAccent(m.id, m.name);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setPaymentMethod(m.id)}
                            aria-pressed={active}
                            title={m.name}
                            style={
                              active && accent
                                ? {
                                    borderColor: accent,
                                    boxShadow: `0 0 0 1px ${accent} inset`,
                                  }
                                : undefined
                            }
                            className={cn(
                              "group relative flex flex-col items-center gap-1.5 p-2 border-2 transition-all bg-background",
                              active
                                ? "scale-[1.02]"
                                : "border-border hover:border-foreground/30 hover:-translate-y-0.5"
                            )}
                          >
                            <PaymentLogo methodId={m.id} name={m.name} variant="tile" />
                            <span className="text-[11px] font-semibold leading-tight text-center line-clamp-1">
                              {m.name}
                            </span>
                            {active && (
                              <span
                                aria-hidden
                                style={accent ? { backgroundColor: accent } : undefined}
                                className="absolute -top-1.5 -right-1.5 size-4 rounded-full flex items-center justify-center text-[10px] text-white shadow"
                              >
                                <Check className="size-3" strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {coupon && !product.whatsapp_redirect && (
                  <div className="border-t border-border pt-3 space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Sous-total</span>
                      <span>{formatXOF(basePrice)}</span>
                    </div>
                    <div className="flex justify-between text-success">
                      <span>Réduction ({coupon.code})</span>
                      <span>-{formatXOF(coupon.discount_amount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                      <span>Total</span>
                      <span>{formatXOF(finalTotal)}</span>
                    </div>
                  </div>
                )}

                {/* CTA inline desktop uniquement — mobile a la sticky CTA */}
                <div className="hidden md:block w-full brut-btn-shadow group">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className="relative w-full h-12 bg-primary text-primary-foreground border-2 border-primary px-6 flex items-center justify-center gap-3 font-display text-xl uppercase tracking-wider transition-colors hover:bg-background hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {creating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : product.whatsapp_redirect ? (
                      <MessageCircle className="size-4" />
                    ) : (
                      <Zap className="size-4" />
                    )}
                    {product.whatsapp_redirect
                      ? "Continuer sur WhatsApp"
                      : "Commander maintenant"}
                    {!creating && (
                      <span className="size-2.5 bg-primary-foreground group-hover:bg-primary animate-blink ml-1 shrink-0" />
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-success/10 border border-success/30 text-success text-sm px-3 py-2 flex items-center gap-2">
                  <Check className="size-4" /> Commande #{order.id} créée. Réglez puis envoyez la
                  capture.
                </div>

                {selectedMethod && (
                  <PaymentInstructions
                    methodId={selectedMethod.id}
                    methodName={selectedMethod.name}
                    rawInstructions={selectedMethod.instructions}
                    amountFormatted={formatXOF(order.total_price)}
                    orderId={order.id}
                  />
                )}

                <div>
                  <label className="text-sm font-semibold">Capture du paiement</label>
                  <div className="mt-2 relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div
                      className={cn(
                        "border-2 border-dashed p-6 text-center",
                        file ? "border-primary bg-primary/5" : "border-border"
                      )}
                    >
                      <Upload className="size-6 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">
                        {file ? file.name : "Cliquez pour choisir une capture"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">PNG ou JPG, max ~5MB</p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  size="lg"
                  className="w-full h-12 bg-primary text-primary-foreground border-2 border-primary font-display text-xl uppercase tracking-wider hover:bg-background hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-none"
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Envoyer la capture
                </Button>

                {wa && (
                  <p className="text-xs text-muted-foreground text-center">
                    Un problème ?{" "}
                    <a
                      href={`https://wa.me/${wa}?text=${encodeURIComponent(
                        `Bonjour Tenora ! J'ai besoin d'aide pour ma commande #${order.id} (${product.name}). Merci.`
                      )}`}
                      target="_blank"
                      rel="noopener"
                      className="text-primary font-medium hover:underline"
                    >
                      Contactez-nous sur WhatsApp
                    </a>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── STICKY CTA MOBILE (avant création commande) ─── */}
      {!order && (
        <div
          className="md:hidden fixed inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t-2 border-border p-3"
          style={{
            bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
            boxShadow: "0 -4px 12px -4px rgba(0,0,0,0.15)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-none">
                Total
              </p>
              <p className="font-display text-xl font-bold gradient-text leading-tight truncate">
                {formatXOF(unitTotal)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="h-12 px-5 bg-primary text-primary-foreground border-2 border-primary font-display uppercase tracking-wider text-base shrink-0 flex items-center gap-2 hover:bg-background hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : product.whatsapp_redirect ? (
                <><MessageCircle className="size-4" /> WhatsApp</>
              ) : (
                <><Zap className="size-4" /> Commander</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
