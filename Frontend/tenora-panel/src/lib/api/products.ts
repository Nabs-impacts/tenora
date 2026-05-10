import api from "./client";

/**
 * Liste des produits — compatible:
 *   • ANCIEN backend : renvoie un tableau brut `[]`
 *   • NOUVEAU backend (paginé) : renvoie `{ products, total, page, per_page }`
 *
 * On normalise TOUJOURS vers un tableau côté client pour que les composants
 * existants (Products.tsx, FeaturedProductsManager.tsx) continuent de marcher
 * sans modif. Les métadonnées de pagination sont attachées sur l'objet retourné
 * via `meta` pour les futurs usages.
 */
export const getProducts = async (params?: Record<string, unknown>) => {
  // Par défaut on récupère TOUS les produits (la pagination backend par défaut
  // est de 50 et tronquait silencieusement la liste — certains produits étaient
  // alors invisibles dans le panel alors qu'ils existaient bien en base).
  const finalParams = { per_page: 1000, ...(params || {}) };
  const res = await api.get("/panel/products", { params: finalParams });
  const raw = res.data;

  if (Array.isArray(raw)) {
    return { ...res, data: raw, meta: { total: raw.length, page: 1, per_page: raw.length } };
  }

  if (raw && Array.isArray(raw.products)) {
    return {
      ...res,
      data: raw.products,
      meta: {
        total: raw.total ?? raw.products.length,
        page: raw.page ?? 1,
        per_page: raw.per_page ?? raw.products.length,
      },
    };
  }

  // Fallback ultra-défensif : jamais undefined.
  return { ...res, data: [], meta: { total: 0, page: 1, per_page: 0 } };
};

export const createProduct = (data: Record<string, unknown>) =>
  api.post("/panel/products", data);
export const updateProduct = (id: number, data: Record<string, unknown>) =>
  api.put(`/panel/products/${id}`, data);
export const deleteProduct = (id: number) =>
  api.delete(`/panel/products/${id}`);
export const uploadProductImage = (id: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/panel/products/${id}/image`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const deleteProductImage = (id: number) =>
  api.delete(`/panel/products/${id}/image`);
