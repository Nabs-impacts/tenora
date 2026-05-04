import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, children, action, className }: PageHeaderProps) {
  const rightSlot = action ?? children;
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-1.5">
        {eyebrow && (
          <div className="flex items-center gap-2">
            <span className="status-dot bg-primary text-primary animate-blink" />
            <p className="eyebrow">{eyebrow}</p>
          </div>
        )}
        <h1 className="display text-3xl sm:text-4xl tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mono">{subtitle}</p>
        )}
      </div>
      {rightSlot && <div className="flex flex-wrap items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
