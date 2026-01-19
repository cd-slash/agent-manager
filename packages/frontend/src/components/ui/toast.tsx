import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const toastVariants = cva(
  "pointer-events-auto relative flex w-full items-start gap-component rounded-lg border p-card shadow-lg transition-all",
  {
    variants: {
      variant: {
        success: "border-success/30 bg-success/10 text-success",
        error: "border-destructive/30 bg-destructive/10 text-destructive",
        warning: "border-warning/30 bg-warning/10 text-warning",
        info: "border-info/30 bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export interface ToastProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  title: string;
  message?: string;
  onDismiss?: () => void;
}

function Toast({
  className,
  variant = "info",
  title,
  message,
  onDismiss,
  ...props
}: ToastProps) {
  const Icon = iconMap[variant ?? "info"];

  return (
    <div
      className={cn(toastVariants({ variant }), className)}
      role="alert"
      aria-live="polite"
      {...props}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-xs">
        <p className="text-sm font-semibold">{title}</p>
        {message && (
          <p className="text-sm opacity-90">{message}</p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export interface ToastContainerProps {
  children: React.ReactNode;
}

function ToastContainer({ children }: ToastContainerProps) {
  return (
    <div
      className="fixed top-4 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-sm pointer-events-none"
      aria-label="Notifications"
    >
      {children}
    </div>
  );
}

export { Toast, ToastContainer, toastVariants };
