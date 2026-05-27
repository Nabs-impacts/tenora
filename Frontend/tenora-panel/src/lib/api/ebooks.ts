import api from "./client";

export const getEbooks = async (params?: Record<string, unknown>) => {
  const res = await api.get("/panel/ebooks", { params });
  return { ...res, data: Array.isArray(res.data) ? res.data : [] };
};

export const createEbook = (data: Record<string, unknown>) =>
  api.post("/panel/ebooks", data);

export const updateEbook = (id: number, data: Record<string, unknown>) =>
  api.put(`/panel/ebooks/${id}`, data);

export const deleteEbook = (id: number) =>
  api.delete(`/panel/ebooks/${id}`);

export const uploadEbookImage = (id: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/panel/ebooks/${id}/image`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const deleteEbookImage = (id: number) =>
  api.delete(`/panel/ebooks/${id}/image`);

export const uploadEbookPdf = (id: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/panel/ebooks/${id}/pdf`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const deleteEbookPdf = (id: number) =>
  api.delete(`/panel/ebooks/${id}/pdf`);
