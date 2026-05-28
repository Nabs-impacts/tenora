import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Brutalist toast — BORDURES FRAPPANTES :
 *  - double cadre (bordure extérieure 3px + bordure intérieure inset)
 *  - fond saturé (vert succès / rouge erreur / ambre warning)
 *  - texte blanc/noir épais, lisible immédiatement
 *  - croix noire sur fond blanc, toujours visible
 *  - cohérent light / dark / mobile
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
            "border-[3px] border-black dark:border-white " +
            "bg-card text-foreground " +
            "shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(255,255,255,0.95)] dark:shadow-[4px_4px_0_0_#fff,inset_0_0_0_2px_rgba(0,0,0,0.25)] " +
            "p-4 " +
            "[&_[data-icon]]:shrink-0 [&_[data-icon]]:h-5 [&_[data-icon]]:w-5 " +
            "[&_[data-title]]:font-mono [&_[data-title]]:font-black [&_[data-title]]:uppercase " +
            "[&_[data-title]]:tracking-[0.16em] [&_[data-title]]:text-[12px]",

          // SUCCESS — vert saturé, texte blanc, cadre noir + inset noir
          success:
            "!bg-[hsl(142_72%_38%)] dark:!bg-[hsl(142_70%_42%)] " +
            "!border-black dark:!border-black " +
            "!text-white " +
            "shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(0,0,0,0.25)] " +
            "[&_[data-icon]]:!text-white " +
            "[&_[data-title]]:!text-white " +
            "[&_[data-description]]:!text-white/90",

          // ERROR — rouge saturé, texte blanc, cadre noir + inset noir
          error:
            "!bg-[hsl(0_78%_48%)] dark:!bg-[hsl(0_75%_52%)] " +
            "!border-black dark:!border-black " +
            "!text-white " +
            "shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(0,0,0,0.25)] " +
            "[&_[data-icon]]:!text-white " +
            "[&_[data-title]]:!text-white " +
            "[&_[data-description]]:!text-white/90",

          // WARNING — ambre saturé
          warning:
            "!bg-[hsl(38_95%_50%)] dark:!bg-[hsl(40_92%_55%)] " +
            "!border-black dark:!border-black " +
            "!text-black " +
            "shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(0,0,0,0.2)] " +
            "[&_[data-icon]]:!text-black " +
            "[&_[data-title]]:!text-black " +
            "[&_[data-description]]:!text-black/80",

          info:
            "!bg-foreground !text-background !border-black dark:!border-white " +
            "shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(255,255,255,0.95)] dark:shadow-[4px_4px_0_0_#fff,inset_0_0_0_2px_rgba(0,0,0,0.25)] " +
            "[&_[data-icon]]:!text-background " +
            "[&_[data-title]]:!text-background " +
            "[&_[data-description]]:!text-background/85",

          description: "text-[12.5px] leading-snug mt-1 font-medium",

          actionButton:
            "!rounded-none !border-[2px] !border-current !bg-white !text-black " +
            "font-mono font-black uppercase tracking-wider !text-[10px] !px-3 !py-1 " +
            "transition-transform active:translate-x-[1px] active:translate-y-[1px] " +
            "hover:!bg-black hover:!text-white",

          cancelButton:
            "!rounded-none !border-[2px] !border-current !bg-transparent " +
            "!text-current font-mono font-black uppercase tracking-wider !text-[10px] !px-3 !py-1",

          // CROIX NOIRE sur fond blanc, toujours visible
          closeButton:
            "!rounded-none !border-[2.5px] !border-black !bg-white !text-black " +
            "hover:!bg-gray-100 hover:!text-black",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
