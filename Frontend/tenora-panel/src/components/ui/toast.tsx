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
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[380px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  // Base — panel band: no radius, thin border, subtle offset shadow, left accent line 2px
  "group pointer-events-auto mono relative flex w-full items-start justify-between gap-3 overflow-hidden " +
  "rounded-none border border-border/35 bg-background/98 p-4 pr-8 " +
  "shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.08),1px_1px_0_0_hsl(var(--border)/0.6)] " +
  "transition-all " +
  "before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] " +
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
          "before:bg-border/50 text-foreground",
        success:
          "success border-[hsl(142_72%_29%/0.22)] before:bg-[hsl(142_72%_29%)]",
        destructive:
          "destructive border-[hsl(0_72%_51%/0.22)] before:bg-[hsl(0_72%_51%)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
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
      "inline-flex h-6 shrink-0 items-center justify-center rounded-none border border-border/50 bg-transparent px-3 " +
      "text-[10px] font-bold uppercase tracking-wider text-muted-foreground " +
      "transition-colors hover:bg-muted/50 hover:border-border " +
      "focus:outline-none focus:ring-1 focus:ring-ring " +
      "group-[.destructive]:border-[hsl(0_72%_51%/0.25)] group-[.destructive]:text-[hsl(0_72%_51%)] group-[.destructive]:hover:bg-[hsl(0_72%_51%/0.08)] " +
      "group-[.success]:border-[hsl(142_72%_29%/0.25)] group-[.success]:text-[hsl(142_72%_29%)] group-[.success]:hover:bg-[hsl(142_72%_29%/0.08)] " +
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
      "absolute right-2 top-2 rounded-none p-1 " +
      "text-muted-foreground/40 opacity-0 transition-all " +
      "group-hover:opacity-100 " +
      "hover:text-muted-foreground hover:bg-muted/40 " +
      "focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring " +
      "group-[.destructive]:text-[hsl(0_72%_51%/0.45)] group-[.destructive]:hover:text-[hsl(0_72%_51%)] " +
      "group-[.success]:text-[hsl(142_72%_29%/0.45)] group-[.success]:hover:text-[hsl(142_72%_29%)]",
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
      "text-[10.5px] font-bold uppercase tracking-[0.14em] text-foreground " +
      "group-[.success]:text-[hsl(142_72%_29%)] " +
      "group-[.destructive]:text-[hsl(0_72%_51%)]",
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
      "text-[11.5px] leading-relaxed text-muted-foreground " +
      "group-[.success]:text-[hsl(142_72%_29%/0.72)] " +
      "group-[.destructive]:text-[hsl(0_72%_51%/0.72)]",
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
