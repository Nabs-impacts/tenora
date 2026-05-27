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
            "group toast mono overflow-hidden rounded-none border-2 bg-background text-foreground shadow-[5px_5px_0_0_hsl(var(--border))] before:absolute before:left-0 before:top-0 before:h-full before:w-1.5 before:bg-primary [&_[data-title]]:font-bold [&_[data-title]]:uppercase [&_[data-title]]:tracking-[0.16em] [&_[data-title]]:text-[11px]",
          success:
            "border-primary before:bg-primary shadow-[5px_5px_0_0_hsl(var(--primary)/0.55)] [&_[data-icon]]:text-primary [&_[data-title]]:text-primary",
          error:
            "border-secondary before:bg-secondary shadow-[5px_5px_0_0_hsl(var(--secondary)/0.45)] [&_[data-icon]]:text-secondary [&_[data-title]]:text-secondary",
          warning:
            "border-warning before:bg-warning shadow-[5px_5px_0_0_hsl(var(--warning)/0.45)] [&_[data-icon]]:text-warning [&_[data-title]]:text-warning",
          info:
            "border-info before:bg-info shadow-[5px_5px_0_0_hsl(var(--info)/0.45)] [&_[data-icon]]:text-info [&_[data-title]]:text-info",
          description: "text-muted-foreground text-[12px]",
          actionButton: "rounded-none border border-primary bg-primary text-primary-foreground font-bold uppercase tracking-wider",
          cancelButton: "rounded-none border border-border bg-muted text-muted-foreground font-bold uppercase tracking-wider",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
