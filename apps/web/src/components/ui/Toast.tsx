import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/api";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds until auto-dismiss; 0 keeps it until the user closes it. */
  duration?: number;
}

interface ToastEntry extends Required<Omit<ToastOptions, "description">> {
  id: number;
  description?: string;
}

export interface ToastApi {
  /** `toast({ title: "Gespeichert" })` */
  toast: (options: ToastOptions) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  /** Shows the German message of any thrown value (ApiError aware). */
  fromError: (error: unknown, title?: string) => number;
  dismiss: (id: number) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const variantStyles: Record<ToastVariant, { wrapper: string; icon: ReactNode }> = {
  info: { wrapper: "border-line bg-surface text-fg", icon: <Info className="text-brand" /> },
  success: {
    wrapper: "border-success/40 bg-success-soft text-success-soft-fg",
    icon: <Check className="text-success" />,
  },
  warning: {
    wrapper: "border-warning/40 bg-warning-soft text-warning-soft-fg",
    icon: <TriangleAlert className="text-warning" />,
  },
  error: {
    wrapper: "border-danger/40 bg-danger-soft text-danger-soft-fg",
    icon: <CircleAlert className="text-danger" />,
  },
};

/** Wrap the app once; then use {@link useToast} anywhere below it. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      const entry: ToastEntry = {
        id,
        title: options.title,
        variant: options.variant ?? "info",
        duration: options.duration ?? (options.variant === "error" ? 7000 : 4000),
        ...(options.description !== undefined ? { description: options.description } : {}),
      };
      setEntries((current) => [...current.slice(-2), entry]);
      if (entry.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), entry.duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) =>
        toast({ title, variant: "success", ...(description ? { description } : {}) }),
      error: (title, description) =>
        toast({ title, variant: "error", ...(description ? { description } : {}) }),
      fromError: (error, title = "Das hat nicht funktioniert") =>
        toast({ title, description: errorMessage(error), variant: "error" }),
      dismiss,
      dismissAll: () => {
        for (const timer of timers.current.values()) clearTimeout(timer);
        timers.current.clear();
        setEntries([]);
      },
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(<ToastViewport entries={entries} onDismiss={dismiss} />, document.body)
        : null}
    </ToastContext.Provider>
  );
}

function ToastViewport({
  entries,
  onDismiss,
}: {
  entries: readonly ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      {entries.map((entry) => {
        const styles = variantStyles[entry.variant];
        return (
          <div
            key={entry.id}
            role={entry.variant === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-3 shadow-pop animate-slide-down",
              styles.wrapper,
            )}
          >
            <span aria-hidden="true" className="mt-0.5 [&_svg]:size-5">
              {styles.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{entry.title}</p>
              {entry.description ? (
                <p className="mt-0.5 text-sm break-words opacity-90">{entry.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(entry.id)}
              aria-label="Meldung schließen"
              className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Throws when used outside <ToastProvider> — that is a wiring bug, not a runtime state. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast muss innerhalb von <ToastProvider> verwendet werden.");
  return context;
}
