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
      "sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

/**
 * Brutalist toast — BORDURES FRAPPANTES :
 * double cadre (bordure extérieure 3px + bordure intérieure inset)
 * fond saturé, texte blanc/noir, cohérent light/dark/mobile.
 */
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden " +
  "rounded-none border-[3px] border-black dark:border-white p-4 pr-11 " +
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
          "default bg-foreground text-background border-black dark:border-white " +
          "shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(255,255,255,0.95)] dark:shadow-[4px_4px_0_0_#fff,inset_0_0_0_2px_rgba(0,0,0,0.25)]",
        success:
          "success bg-[hsl(142_72%_38%)] dark:bg-[hsl(142_70%_42%)] text-white border-black " +
          "shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(0,0,0,0.25)]",
        destructive:
          "destructive bg-[hsl(0_78%_48%)] dark:bg-[hsl(0_75%_52%)] text-white border-black " +
          "shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(0,0,0,0.25)]",
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
      "inline-flex h-7 shrink-0 items-center justify-center rounded-none border-[2px] border-current bg-white px-3 " +
      "font-mono text-[10px] font-black uppercase tracking-wider text-black " +
      "transition-transform hover:bg-black hover:text-white active:translate-x-[1px] active:translate-y-[1px] " +
      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 " +
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

// CROIX NOIRE sur fond blanc, bordure noire épaisse, toujours visible
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-none border-[2.5px] border-black bg-white " +
      "text-black opacity-100 transition-all " +
      "hover:bg-gray-100 " +
      "focus:outline-none focus:ring-2 focus:ring-ring",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" strokeWidth={3.5} />
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
      "font-mono text-[12px] font-black uppercase tracking-[0.16em] text-current",
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
      "mt-1 text-[12.5px] font-medium leading-snug text-current/90",
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
