// === src/components/panel/stats/ExportButtons.tsx — NOUVEAU ===
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  downloadBlob,
  exportStatisticsCSV,
  exportStatisticsPDF,
  type StatsParams,
} from "@/lib/api/statistics";

interface Props {
  section: string;
  params: StatsParams;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function ExportButtons({ section, params }: Props) {
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const handleCsv = async () => {
    setLoadingCsv(true);
    try {
      const res = await exportStatisticsCSV(section, params);
      downloadBlob(res.data, `tenora_stats_${section}_${todayStamp()}.csv`);
    } catch (e) {
      toast.error("Export CSV impossible.");
    } finally {
      setLoadingCsv(false);
    }
  };

  const handlePdf = async () => {
    setLoadingPdf(true);
    try {
      const res = await exportStatisticsPDF(section, params);
      downloadBlob(res.data, `tenora_stats_${section}_${todayStamp()}.pdf`);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } };
      if (err?.response?.status === 501) {
        toast.warning("Export PDF non disponible côté serveur.");
      } else {
        toast.error("Export PDF impossible.");
      }
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleCsv}
        disabled={loadingCsv}
        className="rounded-none border-2 mono uppercase text-xs tracking-wider"
      >
        {loadingCsv ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
        CSV
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handlePdf}
        disabled={loadingPdf}
        className="rounded-none border-2 mono uppercase text-xs tracking-wider"
      >
        {loadingPdf ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
        PDF
      </Button>
    </div>
  );
}

export default ExportButtons;
