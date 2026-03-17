import { useCallback, useEffect, useRef, useState } from "react";
import { X, CheckCircle, AlertTriangle, XCircle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

const ICONS = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info };
const COLORS = {
  success: "border-status-success/20 bg-status-success/8 text-status-success",
  error: "border-status-critical/20 bg-status-critical/8 text-status-critical",
  warning: "border-status-warning/20 bg-status-warning/8 text-status-warning",
  info: "border-accent/20 bg-accent/8 text-accent-text",
};

const TOAST_DURATION_MS = 3_500;

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const Icon = ICONS[toast.type];

  // Guard against double-removal: auto-dismiss timer + manual close button
  const dismissedRef = useRef(false);
  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  }, [onRemove, toast.id]);

  useEffect(() => {
    const t = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [dismiss]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-lg text-sm font-medium max-w-xs transition-all duration-300 ${COLORS[toast.type]} ${
        exiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"
      }`}
    >
      <Icon size={16} className="shrink-0" />
      <span className="text-text-primary">{toast.message}</span>
      <button
        onClick={dismiss}
        className="ml-auto text-text-ghost hover:text-text-primary transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} onRemove={onRemove} />)}
    </div>
  );
}
