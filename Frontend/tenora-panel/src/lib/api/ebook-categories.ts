import api from "./client";

export interface EbookCat {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  ebook_count?: number;
}

export const getEbookCategories = () =>
  api.get<EbookCat[]>("/panel/ebook-categories");

export const createEbookCategory = (data: Record<string, unknown>) =>
  api.post<{ id: number; message: string }>("/panel/ebook-categories", data);

export const updateEbookCategory = (id: number, data: Record<string, unknown>) =>
  api.put(`/panel/ebook-categories/${id}`, data);

export const deleteEbookCategory = (id: number) =>
  api.delete(`/panel/ebook-categories/${id}`);