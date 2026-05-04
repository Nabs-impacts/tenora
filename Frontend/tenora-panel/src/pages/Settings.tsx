import { useEffect, useState } from "react";
import { Wrench, Megaphone, MessageCircle, CreditCard, AlertTriangle, Flame } from "lucide-react";
import { PageHeader } from "@/components/panel/PageHeader";
import { Skeleton } from "@/components/panel/PanelSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getSettings, updateMaintenance, updateAnnouncement,
  updateWhatsapp, updatePaymentMethods,
} from "@/lib/api/settings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FeaturedProductsManager } from "@/components/panel/FeaturedProductsManager";

interface PM {
  key: string; label: string; desc: string;
  enabled: boolean; instructions: string;
}

const PM_DEFS: Omit<PM, "enabled" | "instructions">[] = [
  { key: "wave",    label: "Wave",        desc: "Mobile money - Wave Niger" },
  { key: "airtel",  label: "Airtel Money",desc: "Mobile money - Airtel Niger" },
  { key: "mynita",  label: "Mynita",      desc: "Mobile Money - Mynita" },
  { key: "amanata", label: "Amanata",     desc: "Mobile Money - Amanata" },
  { key: "usdt",    label: "USDT TRC20",  desc: "Crypto - reseau Tron (TRC20)" },
  { key: "zcash",   label: "ZCash",       desc: "Mobile Money - ZCash" },
];

const TABS = [
  { v: "maintenance",  icon: Wrench,        label: "Maintenance" },
  { v: "announcement", icon: Megaphone,     label: "Bandeau" },
  { v: "whatsapp",     icon: MessageCircle, label: "WhatsApp" },
  { v: "payments",     icon: CreditCard,    label: "Paiements" },
  { v: "featured",     icon: Flame,         label: "Hot Now" },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [announcement, setAnnouncement] = useState({ enabled: false, text: "" });
  const [pms, setPms] = useState<PM[]>(
    PM_DEFS.map((d) => ({ ...d, enabled: true, instructions: "" }))
  );
  const [saving, setSaving] = useState({ m: false, a: false, w: false, p: false });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSettings();
        setMaintenance(data.maintenance ?? false);
        setAnnouncement({ enabled: data.announcement?.enabled ?? false, text: data.announcement?.text ?? "" });
        setWhatsapp(data.whatsapp_number ?? "");
        if (Array.isArray(data.payment_methods)) {
          setPms((prev) => prev.map((m) => {
            const f = data.payment_methods.find((x: { id: string }) => x.id === m.key);
            return f ? { ...m, enabled: f.enabled ?? true, instructions: f.instructions ?? "" } : m;
          }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveMaintenance = async (v: boolean) => {
    setMaintenance(v); setSaving((s) => ({ ...s, m: true }));
    try { await updateMaintenance(v); toast.success("Maintenance mise a jour"); }
    catch { toast.error("Erreur"); }
    finally { setSaving((s) => ({ ...s, m: false })); }
  };
  const saveAnnouncement = async () => {
    setSaving((s) => ({ ...s, a: true }));
    try { await updateAnnouncement(announcement); toast.success("Bandeau mis a jour"); }
    catch { toast.error("Erreur"); }
    finally { setSaving((s) => ({ ...s, a: false })); }
  };
  const saveWhatsapp = async () => {
    const cleaned = whatsapp.replace(/\D/g, "");
    if (!cleaned) return;
    setSaving((s) => ({ ...s, w: true }));
    try { await updateWhatsapp(cleaned); setWhatsapp(cleaned); toast.success("WhatsApp mis a jour"); }
    catch { toast.error("Erreur"); }
    finally { setSaving((s) => ({ ...s, w: false })); }
  };
  const savePms = async () => {
    setSaving((s) => ({ ...s, p: true }));
    try {
      await updatePaymentMethods(pms.map((m) => ({ id: m.key, enabled: m.enabled, instructions: m.instructions })));
      toast.success("Modes de paiement mis a jour");
    } catch { toast.error("Erreur"); }
    finally { setSaving((s) => ({ ...s, p: false })); }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <PageHeader eyebrow="Configuration" title="Parametres" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader eyebrow="Configuration" title="Parametres" subtitle="// gestion globale" />

      <Tabs defaultValue="maintenance" className="space-y-6">

        {/* ── Tab bar : scrollable horizontalement sur mobile ── */}
        <div className="relative overflow-hidden">
          {/* Gradient droit = hint scroll */}
          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent z-10 sm:hidden" />
          <TabsList
            className="
              w-full rounded-none border-2 border-border bg-card p-0 h-auto
              flex flex-nowrap
              overflow-x-auto
              [scrollbar-width:none] [-ms-overflow-style:none]
              [&::-webkit-scrollbar]:hidden
            "
          >
            {TABS.map(({ v, icon: I, label }) => (
              <TabsTrigger
                key={v}
                value={v}
                className="
                  shrink-0 rounded-none mono uppercase tracking-wider text-[11px]
                  flex items-center gap-1.5
                  px-3 py-3 sm:px-4
                  border-r-2 border-border last:border-r-0
                  data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                  whitespace-nowrap
                "
              >
                <I className="h-3.5 w-3.5 shrink-0" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Maintenance ── */}
        <TabsContent value="maintenance">
          <div className="brackets brut-card max-w-2xl p-5 sm:p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="h-10 w-10 shrink-0 border-2 border-destructive/40 bg-destructive-soft flex items-center justify-center text-destructive">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h3 className="display text-xl mb-1">Mode maintenance</h3>
                <p className="text-sm text-muted-foreground">Affiche une page de maintenance sur le shop public.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 border-2 border-border p-3">
              <Switch checked={maintenance} onCheckedChange={saveMaintenance} disabled={saving.m} />
              <span className={cn("mono text-sm", maintenance ? "text-destructive" : "text-success")}>
                {maintenance ? "// MAINTENANCE ACTIVE" : "// SHOP EN LIGNE"}
              </span>
            </div>
            {maintenance && (
              <div className="mt-3 flex items-center gap-2 border-2 border-destructive/40 bg-destructive-soft p-3 text-xs text-destructive mono">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Boutique inaccessible aux visiteurs
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Bandeau ── */}
        <TabsContent value="announcement">
          <div className="brackets brut-card max-w-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 border-2 border-warning/40 bg-warning-soft flex items-center justify-center text-warning">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <h3 className="display text-xl mb-1">Bandeau d'annonce</h3>
                <p className="text-sm text-muted-foreground">Bandeau informatif en haut du shop.</p>
              </div>
            </div>
            <div className="border-2 border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="mono text-xs uppercase tracking-wider">Activer le bandeau</Label>
                <Switch
                  checked={announcement.enabled}
                  onCheckedChange={(v) => setAnnouncement((a) => ({ ...a, enabled: v }))}
                />
              </div>
              <div>
                <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">TEXTE DU BANDEAU</Label>
                <Input
                  value={announcement.text}
                  onChange={(e) => setAnnouncement((a) => ({ ...a, text: e.target.value }))}
                  disabled={!announcement.enabled}
                  placeholder="Ex: Livraison gratuite ce weekend"
                  className="rounded-none border-2 mono"
                />
              </div>
            </div>
            <Button
              onClick={saveAnnouncement}
              disabled={saving.a}
              className="w-full sm:w-auto rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider hover:bg-primary/90 h-11"
            >
              {saving.a ? "..." : "Enregistrer"}
            </Button>
          </div>
        </TabsContent>

        {/* ── WhatsApp ── */}
        <TabsContent value="whatsapp">
          <div className="brackets brut-card max-w-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 border-2 border-success/40 bg-success-soft flex items-center justify-center text-success">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="display text-xl mb-1">Numero WhatsApp</h3>
                <p className="text-sm text-muted-foreground">Numero affiche pour les commandes WhatsApp.</p>
              </div>
            </div>
            <div>
              <Label className="eyebrow mb-1.5 block text-[10px] text-muted-foreground">NUMERO (CHIFFRES UNIQUEMENT)</Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="22790000000"
                className="rounded-none border-2 mono text-base h-12"
                inputMode="numeric"
              />
            </div>
            <Button
              onClick={saveWhatsapp}
              disabled={saving.w}
              className="w-full sm:w-auto rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider hover:bg-primary/90 h-11"
            >
              {saving.w ? "..." : "Enregistrer"}
            </Button>
          </div>
        </TabsContent>

        {/* ── Paiements ── */}
        <TabsContent value="payments">
          <div className="brackets brut-card p-5 sm:p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="h-10 w-10 shrink-0 border-2 border-tertiary/40 bg-tertiary-soft flex items-center justify-center text-tertiary">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="display text-xl mb-1">Modes de paiement</h3>
                <p className="text-sm text-muted-foreground">Activez et configurez les instructions par mode.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pms.map((m, idx) => (
                <div
                  key={m.key}
                  className={cn(
                    "border-2 p-4 space-y-3 transition-opacity",
                    m.enabled ? "border-border" : "border-border/40 opacity-55"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="display text-base leading-tight">{m.label}</p>
                      <p className="text-[10px] mono text-muted-foreground truncate mt-0.5">{m.desc}</p>
                    </div>
                    <Switch
                      checked={m.enabled}
                      onCheckedChange={(v) =>
                        setPms((arr) => arr.map((x, i) => i === idx ? { ...x, enabled: v } : x))
                      }
                      className="shrink-0"
                    />
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="Instructions paiement..."
                    value={m.instructions}
                    onChange={(e) =>
                      setPms((arr) => arr.map((x, i) => i === idx ? { ...x, instructions: e.target.value } : x))
                    }
                    disabled={!m.enabled}
                    className="rounded-none border-2 mono text-xs resize-none"
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t-2 border-border">
              <Button
                onClick={savePms}
                disabled={saving.p}
                className="w-full sm:w-auto rounded-none border-2 border-primary bg-primary text-primary-foreground mono uppercase tracking-wider hover:bg-primary/90 h-11"
              >
                {saving.p ? "..." : "Enregistrer tout"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Hot Now ── */}
        <TabsContent value="featured">
          <FeaturedProductsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
