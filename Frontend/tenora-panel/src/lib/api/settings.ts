import api from "./client";

export const getSettings = () => api.get("/panel/settings");
export const updateMaintenance = (data: { enabled: boolean; message: string }) =>
  api.put("/panel/settings/maintenance", data);
export const updateAnnouncement = (data: { enabled: boolean; text: string }) =>
  api.put("/panel/settings/announcement", data);
export const updateWhatsapp = (number: string) =>
  api.put("/panel/settings/whatsapp", { number });
export const updatePaymentMethods = (methods: unknown[]) =>
  api.put("/panel/settings/payment-methods", { methods });

// ─── Produits Hot Now (mis en avant sur la home) ──────────────────────
export interface FeaturedProduct {
  id: number;
  name: string;
  price: number;
  is_active: boolean;
  stock: number;
}
export interface FeaturedProductsResponse {
  product_ids: number[];
  products: FeaturedProduct[];
}

export const getFeaturedProducts = () =>
  api.get<FeaturedProductsResponse>("/panel/settings/featured-products");

export const updateFeaturedProducts = (productIds: number[]) =>
  api.put<{ message: string; product_ids: number[] }>(
    "/panel/settings/featured-products",
    { product_ids: productIds }
  );
