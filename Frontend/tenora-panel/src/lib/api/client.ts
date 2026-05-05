import axios from "axios";
import { toast } from "sonner";

// On retire un slash final éventuel sur VITE_API_URL : sinon les endpoints
// concaténés à la main (WhatsApp, downloads…) deviennent `//imports/...`,
// ce que FastAPI renvoie en 404 Not Found.
const RAW_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const BASE_URL = RAW_BASE.replace(/\/+$/, "");

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// ── Timeouts différenciés (4.3) ───────────────────────────────────────────────
// Intercepteur request : applique un timeout plus court sur les endpoints "ping"
// qui doivent répondre vite ou non (auth/me, site/init).
api.interceptors.request.use((config) => {
  const url = config.url || "";
  if (url.includes("/auth/me") || url.includes("/site/init")) {
    config.timeout = 5000;            // 5s suffit pour un ping de boot
  }
  if (url.includes("/export/csv") || url.includes("/imports/upload")) {
    config.timeout = 60000;           // exports & uploads peuvent être longs
  }
  return config;
});

// ── Intercepteur response unifié (2.1) ───────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url    = error.config?.url || "";

    if (status === 401) {
      const isMe     = url.includes("/auth/me");
      const onLogin  = typeof window !== "undefined" && window.location.pathname === "/login";
      if (!isMe && !onLogin && typeof window !== "undefined") {
        localStorage.removeItem("panel_session");
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    if (status === 429) {
      toast.warning("Trop de requêtes. Patientez quelques instants.");
      return Promise.reject(error);
    }

    if (status >= 500) {
      toast.error("Erreur serveur. Réessayez dans quelques instants.");
      return Promise.reject(error);
    }

    if (!error.response) {
      if (error.code === "ECONNABORTED") {
        toast.error("La requête a pris trop de temps. Vérifiez votre connexion.");
      } else if (error.code !== "ERR_NETWORK") {
        toast.error("Impossible de contacter le serveur.");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
