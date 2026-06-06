// Tenora — EbookPaymentInstructions
// Version dédiée au dialog d'achat ebook.
// Pas de header logo redondant (le dialog a déjà couverture + titre + prix).
// Compact, intégré, pensé pour la colonne scrollable du dialog 2-colonnes.
// Même logique {amount} / {order_id} / #{order_id} que PaymentInstructions.
import { useState } from "react";
import {
  Check,
  Copy,
  AlertTriangle,
  Smartphone,
  BookOpen,
  UploadCloud,
  CheckCircle2,
} from "lucide-react";
import { PaymentLogo, getPaymentAccent } from "./PaymentLogo";
import { cn } from "@/lib/utils";

interface Props {
  methodId: string;
  methodName: string;
  rawInstructions: string;
  amountFormatted: string;
  orderId?: number | null;
}

/* ─── Template resolution ───────────────────────────────────────── */
function resolveText(tpl: string, amount: string, orderId?: number | null) {
  const ref = orderId != null ? String(orderId) : "EN ATTENTE";
  const refHash = orderId != null ? `#${orderId}` : "#[EN ATTENTE]";
  return tpl
    .replace(/\{amount\}/g, amount)
    .replace(/#\{order_id\}/g, refHash)
    .replace(/\{order_id\}/g, ref);
}

/* ─── useCopy ───────────────────────────────────────────────────── */
function useCopy() {
  const [ok, setOk] = useState(false);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setOk(true);
      setTimeout(() => setOk(false), 1800);
    } catch {/**/}
  };
  return { ok, copy };
}

/* ─── CopyBtn ───────────────────────────────────────────────────── */
function CopyBtn({ value, accent }: { value: string; accent?: string | null }) {
  const { ok, copy } = useCopy();
  return (
    <button
      onClick={() => copy(value)}
      aria-label={ok ? "Copié" : "Copier"}
      className={cn(
        "shrink-0 inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[10px] font-bold uppercase tracking-wider font-mono border transition-all duration-150 select-none active:scale-95",
        ok
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          : "border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      style={!ok && accent ? { borderColor: `${accent}50`, color: accent } : undefined}
    >
      {ok ? <Check className="size-3" strokeWidth={3} /> : <Copy className="size-3" />}
      {ok ? "OK" : "Copier"}
    </button>
  );
}

/* ─── Détection type de champ ───────────────────────────────────── */
const FIELD_PATTERNS = [
  { keys: ["numéro", "numero", "téléphone", "telephone", "phone", "mobile", "tel", "n°"], icon: "phone" },
  { keys: ["compte", "account", "iban", "bic", "swift", "rib"], icon: "bank" },
  { keys: ["bénéficiaire", "beneficiaire", "nom", "name", "destinataire"], icon: "user" },
  { keys: ["référence", "reference", "ref", "id", "commande", "order"], icon: "hash" },
  { keys: ["montant", "amount", "prix", "price", "total"], icon: "currency" },
  { keys: ["email", "mail", "courriel"], icon: "mail" },
] as const;

function detectFieldType(label: string): string {
  const l = label.toLowerCase();
  for (const p of FIELD_PATTERNS) {
    if (p.keys.some((k) => l.includes(k))) return p.icon;
  }
  return "info";
}

/* ─── FieldIcon ─────────────────────────────────────────────────── */
function FieldIcon({ type, accent }: { type: string; accent?: string | null }) {
  const icons: Record<string, React.ReactNode> = {
    phone: <Smartphone className="size-3.5" />,
    bank: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>,
    user: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
    hash: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" /></svg>,
    currency: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M9 9.5a3 3 0 0 1 6 0c0 3-6 3-6 6a3 3 0 0 0 6 0" /></svg>,
    mail: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 7 10-7" /></svg>,
    info: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  };
  return (
    <span
      className="size-7 rounded-md flex items-center justify-center shrink-0"
      style={{
        backgroundColor: accent ? `${accent}15` : "hsl(var(--muted))",
        color: accent ?? "hsl(var(--muted-foreground))",
      }}
    >
      {icons[type] ?? icons.info}
    </span>
  );
}

/* ─── FieldRow — ligne KV compacte ─────────────────────────────── */
function FieldRow({ label, value, accent }: { label: string; value: string; accent?: string | null }) {
  const fieldType = detectFieldType(label);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
      <FieldIcon type={fieldType} accent={accent} />
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground font-mono leading-none mb-0.5">
          {label}
        </p>
        <p
          className="font-mono text-[12px] font-bold break-all leading-snug"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </p>
      </div>
      <CopyBtn value={value} accent={accent} />
    </div>
  );
}

/* ─── AmountRow — montant mis en avant ─────────────────────────── */
function AmountRow({ amount, accent }: { amount: string; accent?: string | null }) {
  return (
    <div
      className="flex items-center justify-between px-3 py-3 rounded-lg border"
      style={{
        borderColor: accent ? `${accent}35` : undefined,
        background: accent ? `${accent}0D` : "hsl(var(--muted)/0.4)",
      }}
    >
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground font-mono mb-0.5">
          Montant à envoyer
        </p>
        <p
          className="font-display text-2xl font-black tracking-tight leading-none"
          style={accent ? { color: accent } : undefined}
        >
          {amount}
        </p>
      </div>
      <CopyBtn value={amount} accent={accent} />
    </div>
  );
}

/* ─── AlertRow ──────────────────────────────────────────────────── */
function AlertRow({ text }: { text: string }) {
  const clean = text.replace(/^[⚠⚡]\s*/, "").replace(/^attention\s*:\s*/i, "");
  return (
    <div className="flex gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
      <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
        {clean}
      </p>
    </div>
  );
}

/* ─── EbookPaymentGuide — guide étapes contextualisé ebook ──────── */
function EbookPaymentGuide({ methodName }: { methodName: string }) {
  const steps = [
    { icon: Smartphone, label: `Ouvrez ${methodName} et envoyez le montant exact` },
    { icon: CheckCircle2, label: "Vérifiez le numéro et le nom du bénéficiaire" },
    { icon: UploadCloud, label: "Téléversez votre reçu ci-dessous" },
    { icon: BookOpen, label: "Votre ebook sera débloqué après validation" },
  ];
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden divide-y divide-border/30">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-muted/15 hover:bg-muted/30 transition-colors">
          <span className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0 text-[10px] font-bold text-muted-foreground font-mono">
            {i + 1}
          </span>
          <step.icon className="size-3.5 text-muted-foreground shrink-0" />
          <p className="text-[12px] text-foreground/80 font-medium">{step.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Composant principal ───────────────────────────────────────── */
export function EbookPaymentInstructions({
  methodId,
  methodName,
  rawInstructions,
  amountFormatted,
  orderId,
}: Props) {
  const accent = getPaymentAccent(methodId);
  const resolved = resolveText(rawInstructions || "", amountFormatted, orderId);
  const lines = resolved.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const { ok: allCopied, copy: copyAll } = useCopy();

  /* ── Partition lignes → sections ── */
  type Section =
    | { type: "amount"; value: string }
    | { type: "kv"; label: string; value: string }
    | { type: "warn"; text: string }
    | { type: "text"; text: string };

  const sections: Section[] = [];
  let hasAmountBlock = false;

  for (const line of lines) {
    const kv = line.match(/^([A-Za-zÀ-ÿ][^:]{0,30}?)\s*:\s*(.+)$/);
    if (kv) {
      const label = kv[1].trim();
      const value = kv[2].trim();
      if (!hasAmountBlock && /montant|amount|prix|total/i.test(label)) {
        sections.push({ type: "amount", value });
        hasAmountBlock = true;
      } else {
        sections.push({ type: "kv", label, value });
      }
    } else if (/^[⚠⚡]/.test(line) || /^attention\s*:/i.test(line)) {
      sections.push({ type: "warn", text: line });
    } else {
      sections.push({ type: "text", text: line });
    }
  }

  const showAmountHero = !hasAmountBlock && amountFormatted;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* ── Header compact avec logo + nom ── */}
      <div
        className="flex items-center gap-3 px-3.5 py-3 border-b border-border/60"
        style={accent ? { background: `linear-gradient(90deg, ${accent}12, transparent)` } : undefined}
      >
        <PaymentLogo
          methodId={methodId}
          name={methodName}
          variant="badge"
          className="size-8 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-muted-foreground leading-none mb-0.5">
            Payer via
          </p>
          <p
            className="text-[13px] font-bold uppercase tracking-wide leading-none truncate"
            style={accent ? { color: accent } : undefined}
          >
            {methodName}
          </p>
        </div>
        {/* Badge commande si orderId */}
        {orderId != null && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-[10px] font-bold font-mono text-primary">
            <CheckCircle2 className="size-3" />
            #{orderId}
          </span>
        )}
      </div>

      {/* ── Corps ── */}
      <div className="p-3.5 space-y-2.5">

        {/* Montant hero si pas dans les KV */}
        {showAmountHero && <AmountRow amount={amountFormatted} accent={accent} />}

        {/* Sections dynamiques */}
        {sections.map((s, i) => {
          if (s.type === "amount") return <AmountRow key={i} amount={s.value} accent={accent} />;
          if (s.type === "kv")     return <FieldRow  key={i} label={s.label} value={s.value} accent={accent} />;
          if (s.type === "warn")   return <AlertRow  key={i} text={s.text} />;
          return (
            <p key={i} className="text-[12px] text-muted-foreground leading-relaxed px-0.5">
              {s.text}
            </p>
          );
        })}

        {/* Guide étapes ebook */}
        <div className="pt-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground font-mono mb-1.5 px-0.5">
            // Comment procéder
          </p>
          <EbookPaymentGuide methodName={methodName} />
        </div>

        {/* Tout copier */}
        <button
          onClick={() => copyAll(resolved)}
          className={cn(
            "w-full h-8 rounded-lg border text-[10px] font-bold uppercase tracking-widest font-mono transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-[0.98]",
            allCopied
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
              : "border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          {allCopied
            ? <><Check className="size-3" strokeWidth={3} /> Copié !</>
            : <><Copy className="size-3" /> Tout copier</>
          }
        </button>
      </div>
    </div>
  );
}
