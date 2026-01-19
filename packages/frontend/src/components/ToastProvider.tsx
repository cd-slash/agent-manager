import * as React from "react";
import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@agent-manager/convex/api";
import { Toast, ToastContainer } from "./ui/toast";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  persist?: boolean; // If true, also save to Convex
}

interface ToastContextValue {
  toast: (options: Omit<ToastItem, "id">) => string;
  success: (title: string, message?: string, options?: Partial<ToastItem>) => string;
  error: (title: string, message?: string, options?: Partial<ToastItem>) => string;
  warning: (title: string, message?: string, options?: Partial<ToastItem>) => string;
  info: (title: string, message?: string, options?: Partial<ToastItem>) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const createNotification = useMutation(api.notifications.create);

  const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const toast = useCallback(
    (options: Omit<ToastItem, "id">) => {
      const id = generateId();
      const duration = options.duration ?? DEFAULT_DURATION;

      const newToast: ToastItem = {
        ...options,
        id,
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto-dismiss after duration
      if (duration > 0) {
        const timer = setTimeout(() => {
          dismiss(id);
        }, duration);
        timersRef.current.set(id, timer);
      }

      // Persist to Convex if requested
      if (options.persist) {
        createNotification({
          type: options.type,
          title: options.title,
          message: options.message,
        }).catch(console.error);
      }

      return id;
    },
    [dismiss, createNotification]
  );

  const success = useCallback(
    (title: string, message?: string, options?: Partial<ToastItem>) =>
      toast({ type: "success", title, message, ...options }),
    [toast]
  );

  const error = useCallback(
    (title: string, message?: string, options?: Partial<ToastItem>) =>
      toast({ type: "error", title, message, ...options }),
    [toast]
  );

  const warning = useCallback(
    (title: string, message?: string, options?: Partial<ToastItem>) =>
      toast({ type: "warning", title, message, ...options }),
    [toast]
  );

  const info = useCallback(
    (title: string, message?: string, options?: Partial<ToastItem>) =>
      toast({ type: "info", title, message, ...options }),
    [toast]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider
      value={{ toast, success, error, warning, info, dismiss, dismissAll }}
    >
      {children}
      <ToastContainer>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-in slide-in-from-right-full fade-in duration-300"
          >
            <Toast
              variant={t.type}
              title={t.title}
              message={t.message}
              onDismiss={() => dismiss(t.id)}
            />
          </div>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
