import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss. Errors default longer than success. */
  durationMs?: number;
};

type Toast = ToastInput & {
  id: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  warning: 5500,
  error: 7000,
};

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; classes: string; iconClasses: string }
> = {
  success: {
    icon: CheckCircle2,
    classes: "border-success/30 bg-white",
    iconClasses: "text-success",
  },
  error: {
    icon: XCircle,
    classes: "border-danger/30 bg-white",
    iconClasses: "text-danger",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-warning/30 bg-white",
    iconClasses: "text-warning",
  },
  info: {
    icon: Info,
    classes: "border-primary/30 bg-white",
    iconClasses: "text-primary",
  },
};

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const variant = input.variant ?? "info";
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const durationMs = input.durationMs ?? DEFAULT_DURATION[variant];
      const toast: Toast = { ...input, id, variant, durationMs };
      setToasts((current) => [...current, toast]);
      const timer = setTimeout(() => dismissToast(id), durationMs);
      timers.current.set(id, timer);
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

const NOOP_TOAST_CONTEXT: ToastContextValue = {
  showToast: () => {},
  dismissToast: () => {},
};

/**
 * Falls back to a no-op outside a ToastProvider (e.g. a page rendered standalone in a unit
 * test) instead of throwing — the real app always mounts ToastProvider at the root in App.tsx.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? NOOP_TOAST_CONTEXT;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 p-4 sm:bottom-4 sm:right-4 sm:inset-x-auto"
    >
      {toasts.map((toast) => {
        const style = VARIANT_STYLES[toast.variant];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 shadow-panel ring-1 ring-black/5 ${style.classes}`}
          >
            <div className="flex items-start gap-2.5">
              <Icon
                aria-hidden
                size={18}
                className={`mt-0.5 shrink-0 ${style.iconClasses}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-text">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-[12px] text-text-muted">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => onDismiss(toast.id)}
                className="-m-1 shrink-0 rounded-md p-1 text-text-muted transition hover:bg-surface-muted hover:text-text"
              >
                <X aria-hidden size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
