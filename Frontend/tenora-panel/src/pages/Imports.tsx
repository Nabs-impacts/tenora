import { useEffect, useState, useCallback } from "react";
import { Inbox, ChevronRight, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { DataCard, DataCardHeader, DataCardContent } from "@/components/panel/DataCard";
import { SkeletonRow } from "@/components/panel/PanelSkeletons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getImports, updateImportStatus } from "@/lib/api/imports";
import api from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ImportItem {
  id: number;
  user_email?: string;
  category_name?: string;
  product_link?: string;
  product_name?: string;
  product_url?: string;
  status: string;
  staff_note?: string;
  created_at: string;
  notes?: string;
  screenshot_path?: string;
}

// Statuts alignés avec Backend/app/models/import_request.py (ImportStatus)
// et la liste IMPORT_STATUSES de app/routes/panel.py.
const statusOptions = [
  { label: "Toutes",     value: "all" },
  { label: "En attente", value: "pending" },
  { label: "Contactée",  value: "contacted" },
  { label: "En cours",   value: "in_progress" },
  { label: "Livrée",     value: "delivered" },
  { label: "Annulée",    value: "cancelled" },
];
const editStatuses = statusOptions.slice(1);

const screenshotUrl = (path?: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${base}/uploads/${path}`;
};

export default function Imports() {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<ImportItem | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [updating, setUpdating] = useState(false);

  const fetchImports = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getImports(statusFilter !== "all" ? { status: statusFilter } : undefined);
      setItems(Array.isArray(data) ? data : data?.imports || []);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les demandes d'import");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchImports(); }, [fetchImports]);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const open = (i: ImportItem) => {
    setSelected(i); setEditStatus(i.status); setStaffNote(i.staff_note || "");
    setShow(true);
  };

  const updateStatus = async () => {
    if (!selected) return;
    setUpdating(true);
    try {
      await updateImportStatus(selected.id, editStatus, staffNote);
      setItems(items.map((i) => i.id === selected.id ? { ...i, status: editStatus, staff_note: staffNote } : i));
      setSelected({ ...selected, status: editStatus, staff_note: staffNote });
      toast.success("Statut mis a jour");
    } catch {
      toast.error("Erreur");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader eyebrow="Logistique" title="Imports" subtitle={`// ${items.length} demande(s)`} />

      <DataCard>
        <DataCardHeader>
          <div className="flex flex-wrap items-center gap-2 flex-1 overflow-x-auto">
            {statusOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setStatusFilter(o.value)}
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
          <span className="chip border-border ml-auto">{items.length}</span>
        </DataCardHeader>
        <DataCardContent>
          {loading ? (
            [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2" />
              <p className="text-sm mono">// Aucune demande</p>
            </div>
          ) : (
            <div className="divide-y-2 divide-border">
              {items.map((i) => (
                <div
                  key={i.id}
                  onClick={() => open(i)}
                  className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <span className="mono text-[10px] text-muted-foreground w-12">#{i.id}</span>
                  <div className="h-9 w-9 border-2 border-tertiary/40 bg-tertiary-soft flex items-center justify-center mono text-xs font-bold text-tertiary shrink-0">
                    {i.user_email?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {i.category_name || "Import"}
                    </p>
                    <p className="text-[10px] mono text-muted-foreground truncate">
                      {i.product_link || i.product_name || i.user_email}
                    </p>
                  </div>
                  <div className="hidden md:block mono text-[10px] text-muted-foreground">{fmtDate(i.created_at)}</div>
                  <StatusBadge status={i.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </DataCardContent>
      </DataCard>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="rounded-none border-2 max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm">// Import #{selected?.id}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="brackets brut-card p-4 space-y-3">
                <p className="eyebrow">// Statut</p>
                <div className="flex items-center gap-2">
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger className="rounded-none border-2 mono"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-2">
                      {editStatuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={updateStatus} disabled={updating} className="rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider text-xs">
                    {updating ? "..." : "OK"}
                  </Button>
                </div>
                <div>
                  <Label className="eyebrow mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>Note interne</Label>
                  <Textarea rows={2} value={staffNote} onChange={(e) => setStaffNote(e.target.value)} className="rounded-none border-2 mono text-sm" />
                </div>
              </div>

              <div className="space-y-2 mono text-xs">
                {selected.product_link && (
                  <a href={selected.product_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 chip border-tertiary/40 text-tertiary hover:bg-tertiary hover:text-tertiary-foreground transition-colors break-all">
                    {selected.product_link} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}
              </div>

              {selected.notes && (
                <div className="brackets brut-card p-4">
                  <p className="eyebrow mb-2">// Note client</p>
                  <p className="text-sm whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}

              {selected.screenshot_path && (
                <div className="brackets brut-card p-4">
                  <p className="eyebrow mb-2">// Capture</p>
                  <a href={screenshotUrl(selected.screenshot_path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 chip border-tertiary/40 text-tertiary">
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
