/**
 * Hooks React Query centralisés pour le panel admin.
 * (Ajout des hooks Statistiques en bas — le reste est inchangé.)
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  getCategories, createCategory, updateCategory, deleteCategory,
  uploadCategoryImage, deleteCategoryImage,
} from "@/lib/api/categories";
import {
  getProducts, createProduct, updateProduct, deleteProduct,
  uploadProductImage,
} from "@/lib/api/products";
import { getOrders, updateOrderStatus } from "@/lib/api/orders";
import { getImports, updateImportStatus } from "@/lib/api/imports";
import { getUsers } from "@/lib/api/users";
import { getDashboard } from "@/lib/api/dashboard";
import { getSettings } from "@/lib/api/settings";
import {
  getStatisticsOverview, getStatisticsOrders, getStatisticsRevenue,
  getStatisticsProducts, getStatisticsCustomers, getStatisticsCoupons,
  type StatsParams,
} from "@/lib/api/statistics";

export const qk = {
  dashboard:      ["dashboard"] as const,
  categories:     ["categories"] as const,
  products: (params?: Record<string, unknown>) =>
    ["products", params ?? {}] as const,
  orders:   (params?: Record<string, unknown>) =>
    ["orders", params ?? {}] as const,
  imports:  (status?: string) => ["imports", status ?? "all"] as const,
  users:    (params?: Record<string, unknown>) =>
    ["users", params ?? {}] as const,
  settings:       ["settings"] as const,
  stats: {
    overview:  (p: StatsParams) => ["stats-overview",  p] as const,
    orders:    (p: StatsParams) => ["stats-orders",    p] as const,
    revenue:   (p: StatsParams) => ["stats-revenue",   p] as const,
    products:  (p: StatsParams) => ["stats-products",  p] as const,
    customers: (p: StatsParams) => ["stats-customers", p] as const,
    coupons:   (p: StatsParams) => ["stats-coupons",   p] as const,
  },
};

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: async () => (await getDashboard()).data,
    staleTime: 60_000,
  });
}

// ─── CATEGORIES ──────────────────────────────────────────────────────────────
export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: async () => (await getCategories()).data ?? [],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.categories });
    qc.invalidateQueries({ queryKey: ["products"] });
  };
  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) => createCategory(data),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
        updateCategory(id, data),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => deleteCategory(id),
      onSuccess: invalidate,
    }),
    uploadImage: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) =>
        uploadCategoryImage(id, file),
      onSuccess: invalidate,
    }),
    removeImage: useMutation({
      mutationFn: (id: number) => deleteCategoryImage(id),
      onSuccess: invalidate,
    }),
  };
}

// ─── PRODUITS ────────────────────────────────────────────────────────────────
export interface ProductsListParams {
  page?: number;
  per_page?: number;
  q?: string;
  category_id?: number;
  is_active?: boolean;
}

export function useProducts(params: ProductsListParams = {}) {
  return useQuery({
    queryKey: qk.products(params),
    queryFn: async () => {
      const { data } = await getProducts(params);
      if (Array.isArray(data)) return { products: data, total: data.length, page: 1, per_page: data.length };
      return data as { products: unknown[]; total: number; page: number; per_page: number };
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useProductMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: qk.dashboard });
    qc.invalidateQueries({ queryKey: qk.categories });
  };
  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) => createProduct(data),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
        updateProduct(id, data),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => deleteProduct(id),
      onSuccess: invalidate,
    }),
    uploadImage: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) =>
        uploadProductImage(id, file),
      onSuccess: invalidate,
    }),
  };
}

// ─── COMMANDES ───────────────────────────────────────────────────────────────
export function useOrders(params: { status?: string; page: number; per_page: number }) {
  return useQuery({
    queryKey: qk.orders(params),
    queryFn: async () => (await getOrders(params)).data as {
      orders: unknown[]; total: number; page: number; per_page: number;
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useOrderMutations() {
  const qc = useQueryClient();
  return {
    updateStatus: useMutation({
      mutationFn: ({ id, payload }: { id: number; payload: { status: string; staff_note: string } }) =>
        updateOrderStatus(id, payload),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: qk.dashboard });
      },
    }),
  };
}

// ─── IMPORTS ─────────────────────────────────────────────────────────────────
export function useImports(status?: string) {
  return useQuery({
    queryKey: qk.imports(status),
    queryFn: async () => {
      const { data } = await getImports(status);
      if (Array.isArray(data)) return { items: data, total: data.length };
      return data as { items: unknown[]; total: number };
    },
    staleTime: 60_000,
  });
}

export function useImportMutations() {
  const qc = useQueryClient();
  return {
    updateStatus: useMutation({
      mutationFn: ({ id, payload }: { id: number; payload: { status: string; staff_note: string } }) =>
        updateImportStatus(id, payload),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["imports"] }),
    }),
  };
}

// ─── UTILISATEURS ────────────────────────────────────────────────────────────
export function useUsers(params: { page: number; per_page: number; q?: string }) {
  return useQuery({
    queryKey: qk.users(params),
    queryFn: async () => (await getUsers(params)).data as {
      users: unknown[]; total: number; page: number; per_page: number;
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => (await getSettings()).data,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─── STATISTIQUES ────────────────────────────────────────────────────────────
export function useStatisticsOverview(params: StatsParams) {
  return useQuery({
    queryKey: qk.stats.overview(params),
    queryFn: async () => (await getStatisticsOverview(params)).data,
    staleTime: 60_000,
  });
}
export function useStatisticsOrders(params: StatsParams) {
  return useQuery({
    queryKey: qk.stats.orders(params),
    queryFn: async () => (await getStatisticsOrders(params)).data,
    staleTime: 60_000,
  });
}
export function useStatisticsRevenue(params: StatsParams) {
  return useQuery({
    queryKey: qk.stats.revenue(params),
    queryFn: async () => (await getStatisticsRevenue(params)).data,
    staleTime: 60_000,
  });
}
export function useStatisticsProducts(params: StatsParams) {
  return useQuery({
    queryKey: qk.stats.products(params),
    queryFn: async () => (await getStatisticsProducts(params)).data,
    staleTime: 60_000,
  });
}
export function useStatisticsCustomers(params: StatsParams) {
  return useQuery({
    queryKey: qk.stats.customers(params),
    queryFn: async () => (await getStatisticsCustomers(params)).data,
    staleTime: 60_000,
  });
}
export function useStatisticsCoupons(params: StatsParams) {
  return useQuery({
    queryKey: qk.stats.coupons(params),
    queryFn: async () => (await getStatisticsCoupons(params)).data,
    staleTime: 60_000,
  });
}
