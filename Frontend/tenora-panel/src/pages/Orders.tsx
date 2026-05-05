import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Download, ChevronRight, ShoppingCart, ExternalLink,
  Phone, Mail, MessageCircle, Copy, MapPin, User as UserIcon, Info,
} from "lucide-react";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { DataCard, DataCardHeader, DataCardContent } from "@/components/panel/DataCard";
import { SkeletonRow } from "@/components/panel/PanelSkeletons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { exportOrdersCsv } from "@/lib/api/orders";
import api from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { OrderClaimBanner } from "@/components/panel/OrderClaimBanner";
import { useAuthStore } from "@/lib/stores/auth";
import { useOrders, useOrderMutations, qk } from "@/lib/queries/admin";
import type { OrderClaim } from "@/lib/api/orderClaim";

interface Order {
  id: number; user_email: string; product_name: string;
  quantity: number; total_price: number; status: string;
  payment_method: string; created_at: string;
  notes?: string; staff_note?: string; screenshot_path?: string;
  customer_info?: Record<string, string> | null;
  claim?: OrderClaim | null;
}

const statusOptions = [
  { label: "Toutes", value: "all" },
  { label: "En attente", value: "pending" },
  { label: "En cours", value: "processing" },
  { label: "Complétées", value: "completed" },
  { label: "Rejetées", value: "rejected" },
  { label: "Remboursées", value: "refunded" },
];
const editStatuses = statusOptions.slice(1);

const screenshotUrl = (path?: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${base}/uploads/${path}`;
};

/* ───────────────── Helpers customer_info ───────────────── */

const prettifyKey = (k: string) =>
  k.replace(/[_\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

type FieldKind = "phone" | "email" | "address" | "name" | "url" | "text";

const detectKind = (key: string, value: string): FieldKind => {
  const k = key.toLowerCase();
  const v = (value || "").trim();
  if (/^https?:\/\//i.test(v)) return "url";
  if (/mail/.test(k) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "email";
  if (/(phone|tel|whats|mobile|gsm|numero|num$)/.test(k) || /^[+\d][\d\s().\-]{6,}$/.test(v)) return "phone";
  if (/(addr|adresse|ville|city|pays|country|location|livraison)/.test(k)) return "address";
  if (/(name|nom|prenom|client|user)/.test(k)) return "name";
  return "text";
};

const KindIcon = ({ kind }: { kind: FieldKind }) => {
  const cls = "h-3.5 w-3.5";
  switch (kind) {
    case "phone":   return <Phone className={cls} />;
    case "email":   return <Mail className={cls} />;
    case "address": return <MapPin className={cls} />;
    case "name":    return <UserIcon className={cls} />;
    case "url":     return <ExternalLink className={cls} />;
    default:        return <Info className={cls} />;
  }
};

const sanitizePhone = (v: string) => v.replace(/[^\d+]/g, "");

/* ───────────────── Composant ───────────────── */

export default function Orders() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: ordersData, isLoading: loading } = useOrders({
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    per_page: pageSize,
  });
  const orders = (ordersData?.orders ?? []) as Order[];
  const total  = ordersData?.total ?? 0;

  const { updateStatus: updateStatusMutation } = useOrderMutations();

  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const adminId = useAuthStore((s) => s.user?.id) ?? -1;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmt = (n: number) => `${n?.toLocaleString("fr-FR")} F`;

  const open = (o: Order) => {
    setSelected(o); setEditStatus(o.status); setStaffNote(o.staff_note || "");
    setCanEdit(true);
    setShow(true);
  };

  const updateStatus = async () => {
    if (!selected) return;
    if (!canEdit) { toast.error("Commande verrouillée par un autre admin"); return; }
    try {
      await updateStatusMutation.mutateAsync({ id: selected.id, payload: { status: editStatus, staff_note: staffNote } });
      toast.success("Statut mis à jour");
      setShow(false);
    } catch {
      toast.error("Erreur");
    }
  };

  const handleExport = async () => {
    try {
      const { data } = await exportOrdersCsv(statusFilter !== "all" ? statusFilter : undefined);
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement("a");
      a.href = url; a.download = `commandes_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("CSV exporté");
    } catch {
      toast.error("Erreur export");
    }
  };

  const customerEntries = selected?.customer_info
    ? Object.entries(selected.customer_info).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    : [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader eyebrow="Gestion" title="Commandes" subtitle={`// ${total} entrée(s)`}>
        <Button variant="outline" onClick={handleExport} className="h-9 rounded-none border-2 mono uppercase tracking-wider text-xs">
          <Download className="h-3.5 w-3.5 mr-2" /> Export CSV
        </Button>
      </PageHeader>

      <DataCard>
        <DataCardHeader>
          <div className="sm:hidden w-full">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="rounded-none border-2 mono text-xs h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none border-2">
                {statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden sm:flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {statusOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => { setStatusFilter(o.value); setPage(1); }}
                className={cn(
                  "px-3 py-1.5 border-2 mono text-[10px] uppercase tracking-[0.15em] font-semibold transition-all whitespace-nowrap",
                  statusFilter === o.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="chip border-border ml-auto shrink-0">{total} TOTAL</span>
        </DataCardHeader>

        <DataCardContent>
          {loading ? (
            [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ShoppingCart className="h-8 w-8 mb-2" />
              <p className="text-sm mono">// Aucune commande</p>
            </div>
          ) : (
            <div className="divide-y-2 divide-border">
              {orders.map((o) => (
                <div
                  key={o.id}
                  onClick={() => open(o)}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <span className="mono text-[10px] text-muted-foreground w-10 sm:w-12 shrink-0">#{o.id}</span>
                  <div className="h-9 w-9 border-2 border-primary/40 bg-primary-soft flex items-center justify-center mono text-xs font-bold text-primary shrink-0">
                    {o.user_email?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0 basis-[55%] sm:basis-auto">
                    <p className="text-sm font-semibold truncate">{o.product_name || "--"}</p>
                    <p className="text-[10px] mono text-muted-foreground truncate">{o.user_email}</p>
                    <p className="text-[10px] mono text-muted-foreground sm:hidden mt-0.5">{fmtDate(o.created_at)}</p>
                  </div>
                  <div className="hidden md:block mono text-[10px] text-muted-foreground shrink-0">{fmtDate(o.created_at)}</div>
                  <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0 flex-wrap justify-end">
                    <div className="mono text-sm font-bold whitespace-nowrap">{fmt(o.total_price)}</div>
                    <StatusBadge status={o.status} />
                    <span className="hidden lg:inline-block chip border-border">{o.payment_method}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > pageSize && (
            <div className="flex items-center justify-center gap-3 p-4 border-t-2 border-border">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded-none border-2 mono uppercase text-[10px] tracking-wider">
                Prev
              </Button>
              <span className="mono text-xs">{page} / {Math.ceil(total / pageSize)}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)} className="rounded-none border-2 mono uppercase text-[10px] tracking-wider">
                Next
              </Button>
            </div>
          )}
        </DataCardContent>
      </DataCard>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="rounded-none border-2 max-w-xl max-h-[92vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm">
              // Commande #{selected?.id}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <OrderClaimBanner
                key={selected.id}
                orderId={selected.id}
                initialClaim={selected.claim ?? null}
                currentAdminId={adminId}
                onChange={({ canEdit }) => setCanEdit(canEdit)}
                disabled={["completed", "rejected", "refunded"].includes(selected.status)}
              />
              <div className="brackets brut-card p-4 space-y-3">
                <p className="eyebrow">// Statut</p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Select value={editStatus} onValueChange={setEditStatus} disabled={!canEdit}>
                    <SelectTrigger className="rounded-none border-2 mono"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-2">
                      {editStatuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={updateStatus} disabled={updateStatusMutation.isPending || !canEdit} className="rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider text-xs">
                    {updateStatusMutation.isPending ? "..." : "OK"}
                  </Button>
                </div>
                <div>
                  <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Note interne</Label>
                  <Textarea rows={2} value={staffNote} onChange={(e) => setStaffNote(e.target.value)} disabled={!canEdit} className="rounded-none border-2 mono text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mono text-xs">
                <Field label="Client" value={selected.user_email} />
                <Field label="Produit" value={selected.product_name} />
                <Field label="Quantité" value={selected.quantity?.toString()} />
                <Field label="Total" value={`${selected.total_price?.toLocaleString("fr-FR")} F`} highlight />
                <Field label="Paiement" value={selected.payment_method} />
                <Field label="Créé le" value={new Date(selected.created_at).toLocaleString("fr-FR")} />
              </div>

              {/* ───── Infos client (dynamiques) ───── */}
              <div className="brackets brut-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="eyebrow">// Infos client</p>
                  {customerEntries.length > 0 && (
                    <span className="chip border-border text-[10px]">
                      {customerEntries.length} champ{customerEntries.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {customerEntries.length === 0 ? (
                  <div className="flex items-start gap-2 p-3 border-2 border-dashed border-border bg-muted/20">
                    <MessageCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Aucune information saisie par le client pour cette commande.
                      Le contact se fait directement par e-mail{" "}
                      <span className="mono text-foreground">{selected.user_email}</span>.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {customerEntries.map(([key, raw]) => {
                      const value = String(raw);
                      const kind = detectKind(key, value);
                      return (
                        <CustomerField
                          key={key}
                          label={prettifyKey(key)}
                          value={value}
                          kind={kind}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {selected.notes && (
                <div className="brackets brut-card p-4">
                  <p className="eyebrow mb-2">// Note client</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{selected.notes}</p>
                </div>
              )}

              {selected.screenshot_path && (
                <div className="brackets brut-card p-4">
                  <p className="eyebrow mb-2">// Capture paiement</p>
                  <a href={screenshotUrl(selected.screenshot_path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 chip border-tertiary/40 text-tertiary hover:bg-tertiary hover:text-tertiary-foreground transition-colors">
                    Ouvrir <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div className="border-2 border-border p-2.5 min-w-0">
      <p className="eyebrow mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</p>
      <p className={cn("mono break-words", highlight ? "text-primary font-bold text-sm" : "text-foreground text-xs")}>
        {value || "--"}
      </p>
    </div>
  );
}

/* ───────────────── Carte champ client ───────────────── */

function CustomerField({
  label, value, kind,
}: { label: string; value: string; kind: FieldKind }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copié");
    } catch {
      toast.error("Impossible de copier");
    }
  };

  const phoneDigits = kind === "phone" ? sanitizePhone(value) : "";
  const waNumber = phoneDigits.replace(/^\+/, "");

  return (
    <div className="border-2 border-border p-2.5 min-w-0 flex flex-col gap-1.5 group hover:border-foreground transition-colors">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <KindIcon kind={kind} />
        <p className="eyebrow truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
          {label}
        </p>
      </div>

      <p className="mono text-xs sm:text-sm text-foreground break-words leading-snug select-text">
        {value}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        {kind === "phone" && phoneDigits && (
          <>
            <a
              href={`tel:${phoneDigits}`}
              className="inline-flex items-center gap-1 px-2 py-1 border-2 border-border mono text-[10px] uppercase tracking-wider hover:border-foreground hover:bg-foreground hover:text-background transition-colors"
            >
              <Phone className="h-3 w-3" /> Appeler
            </a>
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 border-2 border-border mono text-[10px] uppercase tracking-wider hover:border-foreground hover:bg-foreground hover:text-background transition-colors"
            >
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </a>
          </>
        )}
        {kind === "email" && (
          <a
            href={`mailto:${value}`}
            className="inline-flex items-center gap-1 px-2 py-1 border-2 border-border mono text-[10px] uppercase tracking-wider hover:border-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            <Mail className="h-3 w-3" /> Écrire
          </a>
        )}
        {kind === "address" && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 border-2 border-border mono text-[10px] uppercase tracking-wider hover:border-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            <MapPin className="h-3 w-3" /> Maps
          </a>
        )}
        {kind === "url" && (
          <a
            href={value}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 border-2 border-border mono text-[10px] uppercase tracking-wider hover:border-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Ouvrir
          </a>
        )}
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 px-2 py-1 border-2 border-border mono text-[10px] uppercase tracking-wider hover:border-foreground hover:bg-foreground hover:text-background transition-colors ml-auto"
          aria-label={`Copier ${label}`}
        >
          <Copy className="h-3 w-3" /> Copier
        </button>
      </div>
    </div>
  );
}
