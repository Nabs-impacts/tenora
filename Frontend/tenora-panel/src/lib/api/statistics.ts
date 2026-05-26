// === src/lib/api/statistics.ts — NOUVEAU ===
import api from "./client";

export type StatsParams = Record<string, string>;

export const getStatisticsOverview  = (params: StatsParams) =>
  api.get("/panel/statistics/overview",  { params });
export const getStatisticsOrders    = (params: StatsParams) =>
  api.get("/panel/statistics/orders",    { params });
export const getStatisticsRevenue   = (params: StatsParams) =>
  api.get("/panel/statistics/revenue",   { params });
export const getStatisticsProducts  = (params: StatsParams) =>
  api.get("/panel/statistics/products",  { params });
export const getStatisticsCustomers = (params: StatsParams) =>
  api.get("/panel/statistics/customers", { params });
export const getStatisticsCoupons   = (params: StatsParams) =>
  api.get("/panel/statistics/coupons",   { params });

export const exportStatisticsCSV = (section: string, params: StatsParams) =>
  api.get(`/panel/statistics/export/${section}`, { params, responseType: "blob" });

export const exportStatisticsPDF = (section: string, params: StatsParams) =>
  api.get(`/panel/statistics/export/${section}/pdf`, { params, responseType: "blob" });

/** Déclenche un téléchargement côté navigateur à partir d'un Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
