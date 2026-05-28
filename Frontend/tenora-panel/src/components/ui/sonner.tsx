import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Brutalist toast — FRAPPANT mais équilibré :
 *  - fond saturé (vert succès / rouge erreur / ambre warning)
 *  - texte blanc épais, lisible immédiatement
 *  - bordure 2.5px noire nette
 *  - ombre dure 5px offset (signature brutaliste)
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
            "border-[2.5px] border-black dark:border-white " +
            "bg-card text-foreground " +
            "shadow-[5px_5px_0_0_#000] dark:shadow-[5px_5px_0_0_#fff] " +
            "p-4 " +
            "[&_[data-icon]]:shrink-0 [&_[data-icon]]:h-5 [&_[data-icon]]:w-5 " +
            "[&_[data-title]]:font-mono [&_[data-title]]:font-black [&_[data-title]]:uppercase " +
            "[&_[data-title]]:tracking-[0.16em] [&_[data-title]]:text-[12px]",

          // SUCCESS — vert saturé, texte blanc
          success:
            "!bg-[hsl(142_72%_38%)] dark:!bg-[hsl(142_70%_42%)] " +
            "!border-black dark:!border-black " +
            "!text-white " +
            "shadow-[5px_5px_0_0_#000] " +
            "[&_[data-icon]]:!text-white " +
            "[&_[data-title]]:!text-white " +
            "[&_[data-description]]:!text-white/90",

          // ERROR — rouge saturé, texte blanc
          error:
            "!bg-[hsl(0_78%_48%)] dark:!bg-[hsl(0_75%_52%)] " +
            "!border-black dark:!border-black " +
            "!text-white " +
            "shadow-[5px_5px_0_0_#000] " +
            "[&_[data-icon]]:!text-white " +
            "[&_[data-title]]:!text-white " +
            "[&_[data-description]]:!text-white/90",

          // WARNING — ambre saturé
          warning:
            "!bg-[hsl(38_95%_50%)] dark:!bg-[hsl(40_92%_55%)] " +
            "!border-black dark:!border-black " +
            "!text-black " +
            "shadow-[5px_5px_0_0_#000] " +
            "[&_[data-icon]]:!text-black " +
            "[&_[data-title]]:!text-black " +
            "[&_[data-description]]:!text-black/80",

          info:
            "!bg-foreground !text-background !border-black dark:!border-white " +
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

          closeButton:
            "!rounded-none !border-[2px] !border-current !bg-white !text-black " +
            "hover:!bg-black hover:!text-white",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
