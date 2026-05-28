import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-3 p-4 " +
      "sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[400px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

/**
 * Brutalist toast — équilibré : coins carrés, bordure 1.5px nette,
 * ombre dure offset 3px, fond teinté vert/rouge selon la nature.
 * Cohérent light/dark, mobile via Viewport responsive.
 */
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden " +
  "rounded-none border-[1.5px] p-4 pr-10 " +
  "transition-transform " +
  "data-[swipe=cancel]:translate-x-0 " +
  "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] " +
  "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] " +
  "data-[swipe=move]:transition-none " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out " +
  "data-[swipe=end]:animate-out " +
  "data-[state=closed]:fade-out-80 " +
  "data-[state=closed]:slide-out-to-right-full " +
  "data-[state=open]:slide-in-from-top-full " +
  "data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default:
          "default border-foreground/85 bg-card text-foreground " +
          "shadow-[3px_3px_0_0_hsl(var(--foreground))]",
        success:
          "success border-[hsl(142_68%_28%)] " +
          "bg-[hsl(142_60%_94%)] dark:bg-[hsl(142_45%_12%)] " +
          "shadow-[3px_3px_0_0_hsl(142_68%_28%)]",
        destructive:
          "destructive border-[hsl(0_72%_45%)] " +
          "bg-[hsl(0_75%_95%)] dark:bg-[hsl(0_50%_13%)] " +
          "shadow-[3px_3px_0_0_hsl(0_72%_45%)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-7 shrink-0 items-center justify-center rounded-none border-[1.5px] border-foreground/70 bg-transparent px-3 " +
      "font-mono text-[10px] font-bold uppercase tracking-wider text-foreground " +
      "transition-transform hover:bg-foreground/5 active:translate-x-[1px] active:translate-y-[1px] " +
      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 " +
      "group-[.success]:border-[hsl(142_68%_28%)] group-[.success]:text-[hsl(142_68%_22%)] dark:group-[.success]:text-[hsl(142_55%_72%)] group-[.success]:hover:bg-[hsl(142_68%_28%/0.1)] " +
      "group-[.destructive]:border-[hsl(0_72%_45%)] group-[.destructive]:text-[hsl(0_72%_38%)] dark:group-[.destructive]:text-[hsl(0_75%_78%)] group-[.destructive]:hover:bg-[hsl(0_72%_45%/0.1)] " +
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-none border-[1.5px] border-foreground/40 bg-card " +
      "text-foreground/60 opacity-80 transition-all " +
      "hover:opacity-100 hover:border-foreground hover:text-foreground " +
      "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring " +
      "group-[.success]:border-[hsl(142_68%_28%/0.6)] group-[.success]:text-[hsl(142_68%_28%)] dark:group-[.success]:text-[hsl(142_55%_72%)] group-[.success]:hover:border-[hsl(142_68%_28%)] " +
      "group-[.destructive]:border-[hsl(0_72%_45%/0.6)] group-[.destructive]:text-[hsl(0_72%_45%)] dark:group-[.destructive]:text-[hsl(0_75%_78%)] group-[.destructive]:hover:border-[hsl(0_72%_45%)]",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3 w-3" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn(
      "font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-foreground " +
      "group-[.success]:text-[hsl(142_68%_22%)] dark:group-[.success]:text-[hsl(142_55%_72%)] " +
      "group-[.destructive]:text-[hsl(0_72%_38%)] dark:group-[.destructive]:text-[hsl(0_75%_78%)]",
      className,
    )}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn(
      "mt-0.5 text-[12px] leading-relaxed text-muted-foreground " +
      "group-[.success]:text-[hsl(142_45%_25%)] dark:group-[.success]:text-[hsl(142_30%_78%)] " +
      "group-[.destructive]:text-[hsl(0_55%_30%)] dark:group-[.destructive]:text-[hsl(0_35%_82%)]",
      className,
    )}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};