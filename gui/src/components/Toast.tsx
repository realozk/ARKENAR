import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, CheckCircleIcon, CheckIcon, InfoIcon } from "./icons";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

// Icon map — using available icons from icons.tsx
function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success") return <CheckCircleIcon size={16} className="shrink-0" />;
  if (type === "error") return <CloseIcon size={16} className="shrink-0" />;
  if (type === "warning") return <CheckIcon size={16} className="shrink-0" />;
  return <InfoIcon size={16} className="shrink-0" />;
}

const COLORS = {
  success: "border-[color:var(--color-status-success)]/20 bg-[color:var(--color-status-success)]/5 text-[color:var(--color-status-success)]",
  error: "border-[color:var(--color-status-critical)]/20 bg-[color:var(--color-status-critical)]/5 text-[color:var(--color-status-critical)]",
  warning: "border-[color:var(--color-status-warning)]/20 bg-[color:var(--color-status-warning)]/5 text-[color:var(--color-status-warning)]",
  info: "border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/5 text-[color:var(--color-accent)]",
};

const TOAST_DURATION_MS = 3_500;

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

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
      <ToastIcon type={toast.type} />
      <span className="text-[color:var(--color-text-primary)]">{toast.message}</span>
      <button
        onClick={dismiss}
        className="ml-auto text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] transition-colors"
      >
        <CloseIcon size={14} />
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
