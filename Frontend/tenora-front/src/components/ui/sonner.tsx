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
            "group toast relative overflow-hidden rounded-none border border-border/50 bg-card/96 backdrop-blur-sm text-foreground " +
            "shadow-[0_4px_24px_-4px_hsl(var(--background)/0.9)] " +
            "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:bg-muted-foreground/40 " +
            "[&_[data-title]]:font-bold [&_[data-title]]:uppercase [&_[data-title]]:tracking-[0.14em] [&_[data-title]]:text-[11px]",

          success:
            "border-success/20 " +
            "before:bg-success " +
            "[&_[data-icon]]:text-success " +
            "[&_[data-title]]:text-success",

          error:
            "border-destructive/20 " +
            "before:bg-destructive " +
            "[&_[data-icon]]:text-destructive " +
            "[&_[data-title]]:text-destructive",

          warning:
            "border-warning/20 " +
            "before:bg-warning " +
            "[&_[data-icon]]:text-warning " +
            "[&_[data-title]]:text-warning",

          info:
            "border-accent/20 " +
            "before:bg-accent " +
            "[&_[data-icon]]:text-accent " +
            "[&_[data-title]]:text-accent",

          description:
            "text-muted-foreground text-[12px] leading-relaxed",

          actionButton:
            "rounded-none border border-primary bg-primary text-primary-foreground font-bold uppercase tracking-wider text-[11px]",

          cancelButton:
            "rounded-none border border-border bg-muted text-muted-foreground font-bold uppercase tracking-wider text-[11px]",

          closeButton:
            "rounded-none border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
