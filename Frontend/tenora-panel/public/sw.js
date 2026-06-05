// public/sw.js
// Service worker minimal pour rendre le panel installable sur Android.
// Stratégie : network-first pour la navigation (jamais de version périmée
// dans l'admin), cache-first pour les assets statiques (icônes, manifest).

const CACHE = "tenora-panel-v1";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // JAMAIS cacher l'API : l'admin doit voir des données fraîches.
  if (url.pathname.startsWith("/panel") || url.pathname.startsWith("/api")) {
    return;
  }

  // Navigation HTML : network-first, fallback cache si offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Assets statiques : cache-first.
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});

// ─── Notification click → focus panel + navigation /orders ────────────────────
// Déclenché quand l'admin clique sur une notification native (Android/desktop).

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Si une fenêtre du panel est déjà ouverte → la focus et naviguer
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(self.location.origin + "/orders");
            return;
          }
        }
        // Sinon ouvrir une nouvelle fenêtre directement sur /orders
        if (clients.openWindow) {
          return clients.openWindow("/orders");
        }
      })
  );
});
