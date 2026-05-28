import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Brutalist toast — équilibré :
 *  - coins carrés
 *  - bordure 1.5px nette (pas exagérée)
 *  - ombre dure offset 3px (signature brutaliste sobre)
 *  - fond teinté : VERT pour succès, ROUGE pour erreur, AMBRE pour warning
 *  - typo mono uppercase pour le titre
 *  - cohérent light / dark / mobile (largeur fluide via Sonner)
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast relative w-full overflow-hidden rounded-none " +
            "border-[1.5px] border-foreground/85 bg-card text-foreground " +
            "shadow-[3px_3px_0_0_hsl(var(--foreground))] " +
            "p-4 " +
            "[&_[data-icon]]:shrink-0 " +
            "[&_[data-title]]:font-mono [&_[data-title]]:font-bold [&_[data-title]]:uppercase " +
            "[&_[data-title]]:tracking-[0.14em] [&_[data-title]]:text-[11px]",

          // SUCCESS — fond vert clair, accent vert profond, lisible light & dark
          success:
            "border-[hsl(142_68%_28%)] " +
            "bg-[hsl(142_60%_94%)] dark:bg-[hsl(142_45%_12%)] " +
            "shadow-[3px_3px_0_0_hsl(142_68%_28%)] " +
            "[&_[data-icon]]:text-[hsl(142_68%_28%)] dark:[&_[data-icon]]:text-[hsl(142_55%_60%)] " +
            "[&_[data-title]]:text-[hsl(142_68%_22%)] dark:[&_[data-title]]:text-[hsl(142_55%_72%)] " +
            "[&_[data-description]]:text-[hsl(142_45%_25%)] dark:[&_[data-description]]:text-[hsl(142_30%_78%)]",

          // ERROR — fond rouge clair, accent rouge profond
          error:
            "border-[hsl(0_72%_45%)] " +
            "bg-[hsl(0_75%_95%)] dark:bg-[hsl(0_50%_13%)] " +
            "shadow-[3px_3px_0_0_hsl(0_72%_45%)] " +
            "[&_[data-icon]]:text-[hsl(0_72%_45%)] dark:[&_[data-icon]]:text-[hsl(0_75%_68%)] " +
            "[&_[data-title]]:text-[hsl(0_72%_38%)] dark:[&_[data-title]]:text-[hsl(0_75%_78%)] " +
            "[&_[data-description]]:text-[hsl(0_55%_30%)] dark:[&_[data-description]]:text-[hsl(0_35%_82%)]",

          // WARNING — ambre
          warning:
            "border-[hsl(35_85%_40%)] " +
            "bg-[hsl(45_95%_93%)] dark:bg-[hsl(38_55%_13%)] " +
            "shadow-[3px_3px_0_0_hsl(35_85%_40%)] " +
            "[&_[data-icon]]:text-[hsl(35_85%_40%)] dark:[&_[data-icon]]:text-[hsl(40_90%_65%)] " +
            "[&_[data-title]]:text-[hsl(30_85%_30%)] dark:[&_[data-title]]:text-[hsl(40_90%_75%)] " +
            "[&_[data-description]]:text-[hsl(30_55%_25%)] dark:[&_[data-description]]:text-[hsl(40_35%_82%)]",

          // INFO / default — neutre brutaliste
          info:
            "border-foreground/85 bg-card " +
            "[&_[data-icon]]:text-foreground " +
            "[&_[data-title]]:text-foreground " +
            "[&_[data-description]]:text-muted-foreground",

          description: "text-[12px] leading-relaxed mt-0.5",

          actionButton:
            "rounded-none border-[1.5px] border-current bg-transparent text-current " +
            "font-mono font-bold uppercase tracking-wider text-[10px] px-2.5 py-1 " +
            "transition-transform active:translate-x-[1px] active:translate-y-[1px] " +
            "hover:bg-current/10",

          cancelButton:
            "rounded-none border-[1.5px] border-foreground/60 bg-transparent " +
            "text-foreground/70 font-mono font-bold uppercase tracking-wider text-[10px] px-2.5 py-1 " +
            "hover:bg-muted",

          closeButton:
            "!rounded-none !border-[1.5px] !border-current !bg-card " +
            "!text-current opacity-80 hover:opacity-100 hover:!bg-muted",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };