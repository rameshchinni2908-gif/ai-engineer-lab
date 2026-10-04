import * as React from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal dependency-free toast system (no `@radix-ui/react-toast` package
 * is installed, so this is hand-rolled following the same cva/cn
 * conventions as the rest of `components/ui/`). Fire toasts imperatively
 * from anywhere (including outside React, e.g. a query error handler) via
 * `toast(...)`; mount `<Toaster />` once near the app root to render them.
 */

export type ToastVariant = "default" | "destructive" | "success";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastStoreState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  push: (toastInput) => {
    const id = toastInput.id ?? crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { ...toastInput, id }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

/** Imperatively fire a toast from anywhere - event handlers, query error callbacks, etc. */
export function toast(options: ToastOptions): string {
  return useToastStore.getState().push({
    title: options.title,
    description: options.description,
    variant: options.variant ?? "default",
    durationMs: options.durationMs ?? 5000,
  });
}

/** Hook form, for components that want reactive access to the current toast list (rarely needed directly). */
export function useToast(): { toasts: ToastItem[]; dismiss: (id: string) => void; toast: typeof toast } {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return { toasts, dismiss, toast };
}

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border bg-background text-foreground",
  destructive: "border-destructive/50 bg-destructive text-destructive-foreground",
  success: "border-emerald-600/50 bg-emerald-600 text-white",
};

function ToastCard({ item }: { item: ToastItem }): JSX.Element {
  const dismiss = useToastStore((s) => s.dismiss);

  React.useEffect(() => {
    const timer = window.setTimeout(() => dismiss(item.id), item.durationMs);
    return () => window.clearTimeout(timer);
  }, [item.id, item.durationMs, dismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-80 items-start gap-2 rounded-md border p-4 shadow-lg",
        variantClasses[item.variant],
      )}
    >
      <div className="flex-1">
        <div className="text-sm font-semibold">{item.title}</div>
        {item.description && <div className="mt-1 text-sm opacity-90">{item.description}</div>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss notification"
        className="rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Mount once near the app root. Renders active toasts in a fixed, `aria-live` region. */
export function Toaster(): JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts);
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>,
    document.body,
  );
}
