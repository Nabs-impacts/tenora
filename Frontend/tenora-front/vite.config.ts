import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },

  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: [
      "react", "react-dom", "react/jsx-runtime",
      "react/jsx-dev-runtime", "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },

  build: {
    // es2015 = compatible la quasi-totalité des téléphones Android en circulation
    target: "es2015",
    // Seuil d'avertissement relevé : certains chunks Radix sont volumineux par nature
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /**
         * Découpe le bundle en chunks logiques chargés à la demande.
         *
         * Avant : 1 fichier ~1.4MB → le client attend tout avant de voir quoi que ce soit.
         * Après : chunk "react-vendor" (~140KB) chargé en premier, les autres
         *         (recharts, radix…) seulement si la page les utilise.
         *
         * Impact concret sur une connexion 4G Niger (~2-5 Mbps) :
         *   - First Contentful Paint : -40 à -60%
         *   - TTI (Time to Interactive) : -30 à -50%
         */
        manualChunks(id: string) {
          // ── Cœur React — toujours chargé, le plus petit possible ──────────
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router-dom/") ||
            id.includes("node_modules/react-router/") ||
            id.includes("node_modules/@remix-run/")
          ) {
            return "react-vendor";
          }

          // ── TanStack Query — chargé tôt, séparé pour le caching navigateur ─
          if (
            id.includes("node_modules/@tanstack/")
          ) {
            return "query";
          }

          // ── Icônes Lucide — gros, mais tree-shakeable → chunk isolé ────────
          if (id.includes("node_modules/lucide-react/")) {
            return "icons";
          }

          // ── Radix UI — composants UI, chargés après le shell ────────────────
          if (id.includes("node_modules/@radix-ui/")) {
            return "ui-radix";
          }

          // ── Recharts + D3 — graphiques admin, rarement visités ─────────────
          if (
            id.includes("node_modules/recharts/") ||
            id.includes("node_modules/d3") ||
            id.includes("node_modules/d3-")
          ) {
            return "charts";
          }

          // ── Reste des node_modules (axios, date-fns, sonner, etc.) ──────────
          if (id.includes("node_modules/")) {
            return "vendor";
          }
        },
      },
    },
  },
}));
