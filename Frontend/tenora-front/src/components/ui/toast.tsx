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
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-4 p-5 " +
      "sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

/**
 * TENORA — Cyberpunk Toast (Radix)
 * ─────────────────────────────────────────────────
 *  Forme parallélogramme : skewX(-10deg) sur la root
 *  Contenu contre-rotaté via le wrapper interne CyberContent
 *  Couleurs : cyan / lime / rouge / amber
 */

const toastVariants = cva(
  // ── Base ──
  "group pointer-events-auto relative flex w-full overflow-visible " +
  "border-[2px] rounded-none p-0 " +
  // parallelogram
  "[transform:skewX(-10deg)] " +
  // animation
  "transition-all duration-200 " +
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
          "bg-[#0D0D0D] border-[#00D4FF] text-white " +
          "[box-shadow:0_0_14px_rgba(0,212,255,0.55),0_0_35px_rgba(0,212,255,0.18),5px_5px_0_rgba(0,212,255,0.22)] " +
          "[--accent:#00D4FF] [--accent-rgb:0,212,255]",
        success:
          "bg-[#0D0D0D] border-[#C8FF00] text-white " +
          "[box-shadow:0_0_14px_rgba(200,255,0,0.55),0_0_35px_rgba(200,255,0,0.18),5px_5px_0_rgba(200,255,0,0.22)] " +
          "[--accent:#C8FF00] [--accent-rgb:200,255,0]",
        destructive:
          "bg-[#0D0D0D] border-[#FF2B4E] text-white " +
          "[box-shadow:0_0_14px_rgba(255,43,78,0.55),0_0_35px_rgba(255,43,78,0.18),5px_5px_0_rgba(255,43,78,0.22)] " +
          "[--accent:#FF2B4E] [--accent-rgb:255,43,78]",
        warning:
          "bg-[#0D0D0D] border-[#FFB800] text-white " +
          "[box-shadow:0_0_14px_rgba(255,184,0,0.55),0_0_35px_rgba(255,184,0,0.18),5px_5px_0_rgba(255,184,0,0.22)] " +
          "[--accent:#FFB800] [--accent-rgb:255,184,0]",
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

/**
 * Inner wrapper that counter-skews content so text stays upright
 * inside the parallelogram shape.
 */
const ToastContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex w-full items-start justify-between gap-3 p-[14px_16px] " +
      "[transform:skewX(10deg)] " +
      // left accent bar (rendered straight via counter-skew parent)
      "relative " +
      "before:absolute before:left-[-14px] before:top-0 before:bottom-0 " +
      "before:w-[3px] before:bg-[var(--accent,#00D4FF)] " +
      "before:[box-shadow:0_0_8px_rgba(var(--accent-rgb,0,212,255),0.9)]",
      className,
    )}
    {...props}
  />
));
ToastContent.displayName = "ToastContent";

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-7 shrink-0 items-center justify-center rounded-none " +
      "border-[2px] border-[var(--accent,#00D4FF)] bg-transparent px-3 " +
      "font-mono text-[10px] font-black uppercase tracking-[0.15em] " +
      "text-[var(--accent,#00D4FF)] " +
      "transition-all duration-150 " +
      "hover:bg-[var(--accent,#00D4FF)] hover:text-black " +
      "active:scale-[0.97] " +
      "focus:outline-none focus:ring-1 focus:ring-[var(--accent,#00D4FF)] focus:ring-offset-0 " +
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
      "shrink-0 grid h-6 w-6 place-items-center rounded-none " +
      "border-[1.5px] border-white/20 bg-transparent " +
      "text-white/45 opacity-100 " +
      "transition-all duration-150 " +
      "hover:border-[var(--accent,#00D4FF)] hover:text-[var(--accent,#00D4FF)] " +
      "focus:outline-none focus:ring-1 focus:ring-[var(--accent,#00D4FF)]",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
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
      "font-mono text-[11px] font-black uppercase tracking-[0.18em] " +
      "text-[var(--accent,#00D4FF)]",
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
      "mt-1 text-[12px] font-medium leading-snug text-white/62",
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
  ToastContent,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
