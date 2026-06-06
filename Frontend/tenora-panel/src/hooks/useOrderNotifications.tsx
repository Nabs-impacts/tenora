import { useEffect, useRef, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/auth";

// ─── Config ──────────────────────────────────────────────────────────────────

const SESSION_TOKEN_KEY  = "tenora_panel_session_token";
const API_BASE           = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");
const RECONNECT_BASE_MS  = 2_000;
const RECONNECT_MAX_MS   = 30_000;
const NOTIF_AUTO_CLOSE   = 8_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderEvent {
  id:             number;
  product_name:   string;
  user_email:     string;
  total_price:    number;
  payment_method: string;
  quantity:       number;
}

export type SSEStatus = "idle" | "connecting" | "connected" | "error";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " F";
}

// ─── Toast Tenora (styles inline — rendu hors de l'arbre React principal) ─────

function OrderToast({ order, onClose }: { order: OrderEvent; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        background:  "hsl(240 8% 8%)",
        border:      "2px solid hsl(72 100% 52% / 0.75)",
        boxShadow:   "4px 4px 0 0 hsl(72 100% 52% / 0.35), 0 0 20px hsl(72 100% 52% / 0.15)",
        padding:     "12px 14px",
        cursor:      "pointer",
        minWidth:    "290px",
        maxWidth:    "360px",
        fontFamily:  "'JetBrains Mono', monospace",
        userSelect:  "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px" }}>
        <span style={{
          display:      "inline-block",
          width:        "7px",
          height:       "7px",
          borderRadius: "50%",
          background:   "hsl(72 100% 52%)",
          boxShadow:    "0 0 8px hsl(72 100% 52%)",
          flexShrink:   0,
          animation:    "tenora-pulse 1.4s ease-in-out infinite",
        }} />
        <span style={{
          fontSize:      "9px",
          fontWeight:    700,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color:         "hsl(72 100% 52%)",
        }}>
          // Nouvelle commande
        </span>
      </div>

      <div style={{
        fontSize:     "13px",
        fontWeight:   600,
        color:        "hsl(60 10% 96%)",
        marginBottom: "5px",
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap",
      }}>
        {order.product_name}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <span style={{
          fontSize:     "11px",
          color:        "hsl(240 5% 58%)",
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {order.user_email}
        </span>
        <span style={{
          fontSize:   "14px",
          fontWeight: 700,
          color:      "hsl(72 100% 52%)",
          flexShrink: 0,
        }}>
          {formatPrice(order.total_price)}
        </span>
      </div>

      <div style={{
        marginTop:      "9px",
        paddingTop:     "7px",
        borderTop:      "1px solid hsl(240 5% 18%)",
        fontSize:       "9px",
        color:          "hsl(240 5% 45%)",
        display:        "flex",
        justifyContent: "space-between",
      }}>
        <span>#{order.id} · {order.payment_method.toUpperCase()}</span>
        <span>Voir les commandes →</span>
      </div>
    </div>
  );
}

// ─── Notification native — compatible PC + Android PWA ───────────────────────
//
// `new Notification()` fonctionne sur PC (page en foreground ou background).
// Sur Android Chrome / PWA installée, `new Notification()` est BLOQUÉ par le
// navigateur ; il faut obligatoirement passer par ServiceWorkerRegistration.
// On tente d'abord le ServiceWorker (universel), puis le fallback direct.

async function showSystemNotification(order: OrderEvent): Promise<void> {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = "// NOUVELLE COMMANDE";
  const options: NotificationOptions = {
    body:     `${order.product_name} — ${formatPrice(order.total_price)}`,
    icon:     "/icons/icon-192.png",
    badge:    "/icons/icon-192.png",
    tag:      `tenora-order-${order.id}`,
    renotify: false,
  };

  // Chemin 1 : via Service Worker (Android PWA + PC en arrière-plan)
  // On utilise getRegistration() et NON serviceWorker.ready :
  // .ready ne resolve jamais si aucun SW n'est enregistré (ex : mode dev,
  // première visite), ce qui bloque la fonction et empêche le fallback.
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
      // Pas de SW actif → on tombe dans le fallback direct ci-dessous
    } catch (err) {
      // SW non dispo (ex : dev sans HTTPS) → fallback
      console.warn("[SSE] SW notification failed, fallback direct:", err);
    }
  }

  // Chemin 2 : fallback direct (PC, page active, sans SW)
  try {
    const notif = new Notification(title, options);
    setTimeout(() => notif.close(), NOTIF_AUTO_CLOSE);
  } catch (err) {
    console.warn("[SSE] Direct notification failed:", err);
  }
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useOrderNotifications(): { sseStatus: SSEStatus } {
  const { isLoggedIn } = useAuthStore();
  const navigate       = useNavigate();
  const esRef          = useRef<EventSource | null>(null);
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef       = useRef(RECONNECT_BASE_MS);
  const mountedRef     = useRef(true);
  const [sseStatus, setSseStatus] = useState<SSEStatus>("idle");

  // Injecte l'animation pulse si absente
  useEffect(() => {
    const id = "tenora-sse-style";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = `@keyframes tenora-pulse {
        0%,100% { opacity:1; box-shadow: 0 0 6px hsl(72 100% 52%); }
        50%      { opacity:.6; box-shadow: 0 0 14px hsl(72 100% 52%); }
      }`;
      document.head.appendChild(s);
    }
  }, []);

  const showToast = useCallback((order: OrderEvent) => {
    toast.custom(
      (t) => (
        <OrderToast
          order={order}
          onClose={() => {
            navigate("/orders");
            toast.dismiss(t);
          }}
        />
      ),
      { id: `order-${order.id}`, duration: NOTIF_AUTO_CLOSE, position: "top-right" }
    );
  }, [navigate]);

  const handleNewOrder = useCallback((e: MessageEvent) => {
    console.log("[SSE] new_order reçu:", e.data);
    try {
      const order: OrderEvent = JSON.parse(e.data);
      showToast(order);
      // Navigation si page en arrière-plan (ne change rien si déjà sur /orders)
      showSystemNotification(order).catch(() => {});
    } catch (err) {
      console.error("[SSE] Erreur parsing new_order:", err);
    }
  }, [showToast]);

  const connect = useCallback(() => {
    if (!mountedRef.current || !isLoggedIn) return;

    // Guard : ne pas ouvrir une deuxième connexion si l'une est déjà active
    if (
      esRef.current !== null &&
      esRef.current.readyState !== EventSource.CLOSED
    ) {
      return;
    }

    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      console.warn("[SSE] Token introuvable dans localStorage, connexion annulée");
      setSseStatus("error");
      return;
    }

    setSseStatus("connecting");
    const url = `${API_BASE}/panel/stream?access_token=${encodeURIComponent(token)}`;
    console.log("[SSE] Connexion vers", url.split("?")[0]);

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      console.log("[SSE] ✅ Connexion établie");
      setSseStatus("connected");
      delayRef.current = RECONNECT_BASE_MS;
    };

    es.addEventListener("new_order", handleNewOrder);

    es.addEventListener("ping", () => {
      // Keepalive reçu — la connexion est vivante
    });

    es.onerror = (err) => {
      console.error("[SSE] ❌ Erreur connexion:", err, "— reconnexion dans", delayRef.current, "ms");
      setSseStatus("error");
      es.close();
      esRef.current = null;
      if (!mountedRef.current || !isLoggedIn) return;
      timerRef.current = setTimeout(() => {
        delayRef.current = Math.min(delayRef.current * 2, RECONNECT_MAX_MS);
        connect();
      }, delayRef.current);
    };
  }, [isLoggedIn, handleNewOrder]);

  useEffect(() => {
    mountedRef.current = true;
    if (isLoggedIn) connect();
    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      setSseStatus("idle");
    };
  }, [isLoggedIn, connect]);

  return { sseStatus };
}
