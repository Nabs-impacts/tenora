import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { SiteProvider } from "@/context/SiteContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { MaintenanceGate } from "@/components/layout/MaintenanceGate";

import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductPage from "./pages/Product";
import Ebooks from "./pages/Ebooks";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import Profile from "./pages/Profile";
import Orders from "./pages/Orders";
import ImportPage from "./pages/Import";
import OrderConfirmation from "./pages/OrderConfirmation";
import Install from "./pages/Install";
import Legal from "./pages/Legal";
import NotFound from "./pages/NotFound";

// ──────────────────────────────────────────────────────────────────────────────
// QueryClient global — defaults pensés pour un site catalogue + commande.
// • staleTime 5 min : la majorité des données (catégories, produits, site init)
//   bougent peu. Évite les refetch en cascade sur chaque mount.
// • gcTime 30 min : on garde en mémoire pour les retours arrière.
// • Pas de refetchOnWindowFocus : le mobile change d'app → re-focus → refetch
//   massif sinon.
// • refetchOnReconnect: "always" : utile en zone réseau instable (Niamey).
// Chaque query peut surcharger ces defaults via son propre staleTime.
// ──────────────────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: "always",
    },
    mutations: {
      retry: 0,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <SiteProvider>
            <Sonner position="top-center" closeButton duration={4200} />
            <MaintenanceGate>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/boutique" element={<Shop />} />
                  <Route path="/produit/:id" element={<ProductPage />} />
                  <Route path="/ebooks" element={<Ebooks />} />
                  <Route path="/connexion" element={<Login />} />
                  <Route path="/inscription" element={<Register />} />
                  <Route
                    path="/verifier-email"
                    element={
                      <ProtectedRoute>
                        <VerifyEmail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profil"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/mes-commandes"
                    element={
                      <ProtectedRoute>
                        <Orders />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/import"
                    element={
                      <ProtectedRoute requireVerified>
                        <ImportPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/confirmation" element={<OrderConfirmation />} />
                  <Route path="/installer" element={<Install />} />
                  <Route path="/legal" element={<Legal />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </MaintenanceGate>
          </SiteProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
