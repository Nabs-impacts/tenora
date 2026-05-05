// Tenora — PaymentInstructions
// Carte d'instructions stylée affichée après création de la commande.
// Style brutalist Tenora : bords nets 2px, mono, ASCII deco, accents marque.
import { useMemo, useState } from "react";
import { Check, Copy, Wallet, AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { PaymentLogo, getPaymentAccent } from "./PaymentLogo";
import { cn } from "@/lib/utils";

interface Props {
  methodId: string;
  methodName: string;
  rawInstructions: string;
  amountFormatted: string;
  orderId: number;
}

/** Substitution des placeholders backend {amount} / {order_id}. */
function resolveInstructions(tpl: string, amount: string, orderId: number) {
  return tpl
    .split("{amount}").join(amount)
    .split("{order_id}").join(String(orderId));
}

/** Carte copiable, look brutalist (bord 2px, mono labels). */
function Copyable({
  label,
  value,
  accent,
  big = false,
}: {
  label: string;
  value: string;
  accent?: string | null;
  big?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {/* */}
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="group relative w-full text-left border-2 border-border bg-background hover:border-foreground transition-colors p-3 rounded-md"
    >
      <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono">
        {label}
      </span>
      <span
        style={accent ? { color: accent } : undefined}
        className={cn(
          "block font-display font-bold tabular-nums break-all leading-tight mt-0.5",
          big ? "text-2xl md:text-3xl" : "text-base md:text-lg",
          !accent && "text-foreground"
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest font-mono rounded-sm transition-colors border",
          copied
            ? "bg-success/15 text-success border-success/40"
            : "bg-muted text-muted-foreground border-border group-hover:bg-foreground group-hover:text-background group-hover:border-foreground"
        )}
      >
        {copied ? <Check className="size-3" strokeWidth={3} /> : <Copy className="size-3" />}
        {copied ? "OK" : "Copier"}
      </span>
    </button>
  );
}

/** Bouton compact "Copier" — pas de label, juste l'icône + texte. */
function CopyButton({ value, accent }: { value: string; accent?: string | null }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {/* */}
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      style={!copied && accent ? { borderColor: accent, color: accent } : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 h-9 text-[11px] font-bold uppercase tracking-widest font-mono border-2 transition-colors shrink-0",
        copied
          ? "bg-success text-success-foreground border-success"
          : "bg-background hover:bg-foreground hover:text-background hover:border-foreground"
      )}
    >
      {copied ? <Check className="size-3.5" strokeWidth={3} /> : <Copy className="size-3.5" />}
      {copied ? "Copié" : "Copier"}
    </button>
  );
}

export function PaymentInstructions({
  methodId,
  methodName,
  rawInstructions,
  amountFormatted,
  orderId,
}: Props) {
  const accent = getPaymentAccent(methodId);

  const { addresses, warnings, body } = useMemo(() => {
    const text = resolveInstructions(rawInstructions || "", amountFormatted, orderId);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const addr: { label: string; value: string }[] = [];
    const warn: string[] = [];
    const rest: string[] = [];

    for (const line of lines) {
      // ligne d'avertissement
      if (/^[⚠⚡]/.test(line) || /^attention/i.test(line)) {
        warn.push(line.replace(/^[⚠⚡]\s*/, ""));
        continue;
      }
      // adresses crypto / numéros / mémo — MAIS on exclut "Référence" car
      // déjà affichée en grand en haut → évite les doublons.
      const m = line.match(
        /^(Adresse|Adress|Address|Mémo|Memo|Compte|Numéro|Numero)\s*:?\s*(.+)$/i
      );
      if (m) {
        addr.push({ label: m[1], value: m[2] });
        continue;
      }
      // on ignore les lignes "Référence : ..." (redondance)
      if (/^(Référence|Reference)\s*:/i.test(line)) continue;
      // on ignore les lignes qui ne contiennent qu'un montant déjà affiché en haut
      // (ex. "Envoyez 3 000 FCFA au …") → on garde quand même, c'est l'instruction principale
      rest.push(line);
    }

    return { body: rest, addresses: addr, warnings: warn };
  }, [rawInstructions, amountFormatted, orderId]);

  return (
    <div className="overflow-hidden border-2 border-border bg-card rounded-md">
      {/* ═══ HEADER bandeau couleur marque ═══ */}
      <div
        style={accent ? { backgroundColor: accent } : undefined}
        className={cn(
          "relative flex items-center gap-3 px-4 py-3 text-white border-b-2 border-foreground/10",
          !accent && "bg-foreground"
        )}
      >
        <PaymentLogo
          methodId={methodId}
          name={methodName}
          variant="badge"
          className="ring-2 ring-white/30"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 font-mono">
            // Procédure de paiement
          </p>
          <p className="font-display text-xl font-bold uppercase leading-none truncate">
            {methodName}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest opacity-90 font-mono">
          <Sparkles className="size-3.5" /> ORDER #{orderId}
        </div>
      </div>

      {/* ═══ CORPS ═══ */}
      <div className="p-4 space-y-4">
        {/* MONTANT — vedette */}
        <div className="border-2 border-foreground bg-background p-4 relative overflow-hidden">
          <div
            aria-hidden
            style={accent ? { backgroundColor: accent } : undefined}
            className={cn("absolute top-0 left-0 h-1 w-full", !accent && "bg-foreground")}
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono">
            // Tu envoies exactement
          </p>
          <div className="flex items-end justify-between gap-3 mt-1">
            <p
              style={accent ? { color: accent } : undefined}
              className={cn(
                "font-display font-bold text-3xl md:text-4xl tabular-nums leading-none",
                !accent && "text-foreground"
              )}
            >
              {amountFormatted}
            </p>
            <CopyButton value={amountFormatted} accent={accent} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono mt-3 pt-2 border-t border-border">
            Mentionne <span style={accent ? { color: accent } : undefined} className="text-foreground font-display text-sm">#{orderId}</span> dans ta note de paiement et veilles payer a tes frais
          </p>
        </div>

        {/* Adresses / numéros détectés depuis le template backend */}
        {addresses.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono px-1">
              // Coordonnées du destinataire
            </p>
            {addresses.map((a, i) => (
              <Copyable
                key={i}
                label={a.label}
                value={a.value}
                accent={accent}
              />
            ))}
          </div>
        )}

        {/* Instructions texte (brutalist terminal-like) */}
        {body.length > 0 && (
          <div className="border-2 border-dashed border-border bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono mb-2">
              // Marche à suivre
            </p>
            <ul className="space-y-1.5">
              {body.map((l, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed">
                  <ArrowRight
                    style={accent ? { color: accent } : undefined}
                    className={cn("size-4 mt-0.5 shrink-0", !accent && "text-foreground")}
                  />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Avertissements */}
        {warnings.length > 0 && (
          <div className="border-2 border-warning bg-warning/10 p-3 flex gap-2">
            <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-warning font-mono">
                Attention
              </p>
              {warnings.map((w, i) => (
                <p key={i} className="text-xs leading-relaxed font-medium">
                  {w}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Mini-stepper Tenora */}
        <div className="border-2 border-border bg-background p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono mb-2">
            // Étapes restantes
          </p>
          <ol className="grid grid-cols-3 gap-2 text-center">
            {[
              { n: "01", t: "Payer", done: false },
              { n: "02", t: "Capture", done: false },
              { n: "03", t: "Valider", done: false },
            ].map((s) => (
              <li key={s.n} className="border-2 border-border bg-card px-2 py-2">
                <span
                  style={accent ? { color: accent } : undefined}
                  className={cn(
                    "block font-display font-bold text-lg leading-none tabular-nums",
                    !accent && "text-foreground"
                  )}
                >
                  {s.n}
                </span>
                <span className="block text-[10px] uppercase tracking-widest text-muted-foreground font-mono mt-1">
                  {s.t}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Footer signature Tenora */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono text-center pt-1">
          // Tenora · ne jamais payer hors de cette procédure
        </p>
      </div>
    </div>
  );
}
