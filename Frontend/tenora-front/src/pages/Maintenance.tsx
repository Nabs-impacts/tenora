import { useState } from "react";
import { Wrench } from "lucide-react";
import { TenoraLogo } from "@/components/brand/TenoraLogo";
import { useSite } from "@/context/SiteContext";

export default function Maintenance() {
  const { data, refresh } = useSite();
  const [checking, setChecking] = useState(false);

  const customMessage = data?.maintenance_message?.trim() || "";

  const handleCheck = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center px-6 py-10 overflow-hidden relative">
      {/* Bandeau d'identité haut */}
      <header className="absolute top-0 left-0 right-0 flex items-center justify-center pt-safe py-4 border-b-2 border-foreground/10">
        <TenoraLogo className="text-2xl" />
      </header>

      {/* Bloc central brutaliste */}
      <section className="w-full max-w-xl text-center">
        <div className="inline-flex items-center justify-center mb-8">
          <div className="relative border-2 border-foreground bg-warning text-warning-foreground p-6 shadow-[6px_6px_0_0_hsl(var(--foreground))]">
            <Wrench className="size-12 animate-[spin_4s_linear_infinite]" strokeWidth={2.5} />
          </div>
        </div>

        <h1 className="font-display font-bold uppercase tracking-tight leading-[0.9] text-foreground mb-4 text-[clamp(3rem,14vw,7rem)]">
          Site en
          <br />
          <span className="text-primary">maintenance.</span>
        </h1>

        <div className="border-2 border-foreground bg-card p-5 sm:p-6 shadow-[6px_6px_0_0_hsl(var(--foreground))] mb-6 text-left">
          {customMessage ? (
            /* ── Message personnalisé depuis le panel ── */
            <p className="text-sm sm:text-base font-medium leading-relaxed whitespace-pre-line">
              {customMessage}
            </p>
          ) : (
            /* ── Message par défaut ── */
            <>
              <p className="text-sm sm:text-base font-medium leading-relaxed">
                Nous mettons à jour la boutique pour vous offrir une meilleure expérience.
              </p>
              <p className="text-sm sm:text-base font-medium leading-relaxed mt-2">
                <span className="font-bold uppercase tracking-wider">Nous serons de retour le plus vite possible.</span>{" "}
                Merci de votre patience.
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="inline-flex items-center justify-center gap-2 border-2 border-foreground bg-foreground text-background px-6 py-3 font-bold uppercase tracking-widest text-sm shadow-[4px_4px_0_0_hsl(var(--primary))] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50"
        >
          {checking ? "Vérification…" : "Vérifier à nouveau"}
        </button>

        <p className="text-xs text-muted-foreground mt-6 uppercase tracking-widest">
          La page se rafraîchira automatiquement.
        </p>
      </section>

      {/* Footer minimal */}
      <footer className="absolute bottom-0 left-0 right-0 text-center pb-safe py-4 text-xs text-muted-foreground uppercase tracking-widest border-t-2 border-foreground/10">
        © Tenora — Hors-ligne temporaire
      </footer>
    </main>
  );
}
