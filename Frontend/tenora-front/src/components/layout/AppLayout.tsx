import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { MobileTabBar } from "./MobileTabBar";
import { AnnouncementBar } from "./AnnouncementBar";
import { WhatsAppFab } from "./WhatsAppFab";
import { OfflineBanner } from "./OfflineBanner";
import { useEffect } from "react";

export function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="min-h-dvh flex flex-col bg-background overflow-x-hidden px-safe">
      {/* Bannière offline — fixed, z-9999, invisible quand en ligne */}
      <OfflineBanner />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:font-bold focus:uppercase focus:tracking-widest focus:text-xs"
      >
        Aller au contenu
      </a>
      <AnnouncementBar />
      <Navbar />
      {/* pb-24 mobile = espace pour la tab bar fixe (~64px) + safe area iOS/Android */}
      <main id="main" className="flex-1 min-h-0 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileTabBar />
      <WhatsAppFab />
    </div>
  );
}
