import axios from "axios";
import { toast } from "sonner";

const RAW_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const BASE_URL = RAW_BASE.replace(/\/+$/, "");

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// ── Timeouts différenciés ─────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const url = config.url || "";
  if (url.includes("/auth/me") || url.includes("/site/init")) {
    config.timeout = 5000;
  }
  if (url.includes("/export/csv") || url.includes("/imports/upload")) {
    config.timeout = 60000;
  }
  return config;
});

// ── Déduplication des toasts d'erreur ────────────────────────────────────────
// Quand la connexion tombe, toutes les requêtes en vol (+ leurs retries)
// échouent simultanément. Sans garde = spam de toasts.
// Une seule notif par type d'erreur par fenêtre de 8 secondes.
const TOAST_DEBOUNCE_MS = 8_000;
const _lastToastAt: Record<string, number> = {};

function showOnce(key: string, fn: () => void): void {
  const now = Date.now();
  if (now - (_lastToastAt[key] ?? 0) > TOAST_DEBOUNCE_MS) {
    _lastToastAt[key] = now;
    fn();
  }
}

// ── Intercepteur response unifié ─────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url    = error.config?.url || "";

    if (status === 401) {
      const isMe    = url.includes("/auth/me");
      const onLogin = typeof window !== "undefined" && window.location.pathname === "/login";
      if (!isMe && !onLogin && typeof window !== "undefined") {
        localStorage.removeItem("panel_session");
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    if (status === 429) {
      showOnce("rate-limit", () =>
        toast.warning("Trop de requêtes. Patientez quelques instants.")
      );
      return Promise.reject(error);
    }

    if (status >= 500) {
      showOnce("server-error", () =>
        toast.error("Erreur serveur. Réessayez dans quelques instants.")
      );
      return Promise.reject(error);
    }

    if (!error.response) {
      if (error.code === "ECONNABORTED") {
        showOnce("timeout", () =>
          toast.error("La requête a pris trop de temps. Vérifiez votre connexion.")
        );
      } else if (error.code !== "ERR_NETWORK") {
        showOnce("unreachable", () =>
          toast.error("Impossible de contacter le serveur.")
        );
      }
    }

    return Promise.reject(error);
  }
);

export default api;
