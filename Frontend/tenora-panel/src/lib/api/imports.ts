import api from "./client";

/**
 * Normalise une réponse backend qui peut être :
 *  - un tableau brut : [...]
 *  - un objet paginé : { imports: [...], total, page, ... }
 *  - un objet wrappé : { data: [...] }
 */
function normalizeList<T = any>(raw: any, key: string): { data: T[]; meta: any } {
  if (Array.isArray(raw)) {
    return { data: raw as T[], meta: { total: raw.length } };
  }
  if (raw && Array.isArray(raw[key])) {
    const { [key]: items, ...meta } = raw;
    return { data: items as T[], meta };
  }
  if (raw && Array.isArray(raw.data)) {
    return { data: raw.data as T[], meta: raw.meta ?? {} };
  }
  if (raw && Array.isArray(raw.items)) {
    return { data: raw.items as T[], meta: { total: raw.total ?? raw.items.length } };
  }
  return { data: [], meta: {} };
}

// ---------------------------------------------------------------------------
// LISTING
// ---------------------------------------------------------------------------
export async function getImports(params?: Record<string, any>) {
  const res = await api.get("/panel/imports", { params });
  const { data, meta } = normalizeList(res.data, "imports");
  return { ...res, data, meta };
}

// ---------------------------------------------------------------------------
// STATUS UPDATE  (celui qui manquait au build)
// ---------------------------------------------------------------------------
export async function updateImportStatus(id: string | number, status: string, note?: string) {
  return api.put(`/panel/imports/${id}/status`, { status, note });
}

// ---------------------------------------------------------------------------
// CRUD complémentaire (gardé identique à l'original)
// ---------------------------------------------------------------------------
export async function getImport(id: string | number) {
  return api.get(`/panel/imports/${id}`);
}

export async function createImport(payload: any) {
  return api.post("/panel/imports", payload);
}

export async function updateImport(id: string | number, payload: any) {
  return api.patch(`/panel/imports/${id}`, payload);
}

export async function deleteImport(id: string | number) {
  return api.delete(`/panel/imports/${id}`);
}

export default {
  getImports,
  getImport,
  createImport,
  updateImport,
  deleteImport,
  updateImportStatus,
};
