import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast relative overflow-hidden rounded-none " +
            "border border-border/25 bg-card/97 backdrop-blur-sm " +
            "shadow-[0_2px_12px_-2px_hsl(var(--foreground)/0.06)] " +
            "before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-border/60 " +
            "[&_[data-title]]:font-bold [&_[data-title]]:uppercase [&_[data-title]]:tracking-[0.13em] [&_[data-title]]:text-[10.5px]",

          success:
            "border-[hsl(142_72%_29%/0.18)] " +
            "before:bg-[hsl(142_72%_29%)] " +
            "[&_[data-icon]]:text-[hsl(142_72%_29%)] " +
            "[&_[data-title]]:text-[hsl(142_72%_29%)] " +
            "[&_[data-description]]:text-[hsl(142_72%_29%/0.72)]",

          error:
            "border-[hsl(0_72%_51%/0.18)] " +
            "before:bg-[hsl(0_72%_51%)] " +
            "[&_[data-icon]]:text-[hsl(0_72%_51%)] " +
            "[&_[data-title]]:text-[hsl(0_72%_51%)] " +
            "[&_[data-description]]:text-[hsl(0_72%_51%/0.72)]",

          warning:
            "border-[hsl(38_92%_50%/0.18)] " +
            "before:bg-[hsl(38_92%_50%)] " +
            "[&_[data-icon]]:text-[hsl(38_92%_50%)] " +
            "[&_[data-title]]:text-[hsl(38_92%_50%)] " +
            "[&_[data-description]]:text-[hsl(38_92%_50%/0.72)]",

          info:
            "border-border/30 " +
            "before:bg-muted-foreground/50 " +
            "[&_[data-icon]]:text-foreground/70 " +
            "[&_[data-title]]:text-foreground " +
            "[&_[data-description]]:text-muted-foreground",

          description:
            "text-[11.5px] leading-relaxed",

          actionButton:
            "rounded-none border border-current bg-transparent text-current " +
            "font-bold uppercase tracking-wider text-[10px] " +
            "hover:bg-current/10 transition-colors",

          cancelButton:
            "rounded-none border border-border/50 bg-transparent " +
            "text-muted-foreground font-bold uppercase tracking-wider text-[10px] " +
            "hover:bg-muted/40 transition-colors",

          closeButton:
            "rounded-none border border-border/30 text-muted-foreground/60 " +
            "hover:text-foreground hover:border-border/60 hover:bg-muted/30 transition-colors",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
