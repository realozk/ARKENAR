import React, { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import type { ScanStatus } from "../types";

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle-track transition-all duration-300 hover:scale-105 active:scale-95 ${checked ? "active shadow-sm shadow-accent-glow" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="toggle-thumb duration-300" />
    </button>
  );
}

export function StatusDot({ status, className = "" }: { status: ScanStatus; className?: string }) {
  const colors: Record<ScanStatus, string> = {
    idle: "bg-status-idle",
    running: "bg-status-info animate-pulse",
    finished: "bg-status-success",
    error: "bg-status-critical",
    stopping: "bg-status-warning animate-pulse",
  };

  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]} ${className}`} />;
}

export function SectionLabel({ icon: Icon, children, className = "mb-3" }: { icon: React.ElementType; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Icon size={16} className="text-accent-text neon-label" strokeWidth={3} />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted neon-label">
        {children}
      </span>
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, mono, id, dir }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; id?: string; dir?: "ltr" | "rtl";
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      dir={dir || (mono ? "ltr" : undefined)}
      className={`w-full rounded-lg border border-border-subtle bg-bg-input px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/40 transition-all duration-200 ${mono ? "font-mono text-[13px]" : ""}`}
    />
  );
}


export function NumberInput({ value, onChange, min, max }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  const [localVal, setLocalVal] = useState(value.toString());

  useEffect(() => {
    setLocalVal(value.toString());
  }, [value]);

  const handleBlur = () => {
    if (localVal === "") {
      const fallback = (min ?? 0);
      setLocalVal(fallback.toString());
      onChange(fallback);
    }
  };

  return (
    <input
      type="number"
      value={localVal}
      onChange={(e) => {
        setLocalVal(e.target.value);
        const parsed = parseInt(e.target.value, 10);
        if (!isNaN(parsed)) onChange(parsed);
      }}
      onBlur={handleBlur}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
      min={min}
      max={max}
      className="w-full rounded-lg border border-border-subtle bg-bg-input px-3.5 py-2.5 text-[13px] font-mono text-text-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}


export function SliderWithInput({ value, onChange, min = 0, max = 100, step = 1 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  // The slider ceiling grows when the user types a value beyond the default max.
  // This keeps the thumb accurate without hard-capping the text input.
  const effectiveMax = Math.max(max, value);
  const range = effectiveMax - min;
  const percent = range > 0 ? Math.max(0, Math.min(100, ((value - min) / range) * 100)) : 0;
  const isCustom = value > max;

  return (
    <div className="space-y-1.5" dir="ltr">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 h-1.5 rounded-full bg-bg-input flex items-center">
          {/* Active Track Fill */}
          <div
            className="absolute left-0 h-full rounded-full bg-accent transition-all duration-150 ease-out"
            style={{ width: `${percent}%` }}
          />

          {/* Thumb */}
          <div
            className="absolute h-3 w-3 -ml-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)] transition-all duration-150 ease-out"
            style={{ left: `${percent}%` }}
          />

          {/* Invisible Native Input */}
          <input
            type="range"
            min={min}
            max={effectiveMax}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0"
          />
        </div>
        {/* No `max` passed → user can type freely; slider adapts */}
        <div className="w-20">
          <NumberInput value={value} onChange={onChange} min={min} />
        </div>
      </div>

      {/* Subtle hint when value exceeds the default slider range */}
      {isCustom && (
        <p className="text-[10px] text-accent-text/70 leading-none pl-0.5">
          Custom — default max {max}
        </p>
      )}
    </div>
  );
}

export function ToggleRow({ label, desc, checked, onChange }: {
  label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="group hover-row-glow flex items-center justify-between gap-3 py-3 px-2 -mx-2 cursor-pointer">
      <div className="min-w-0" onClick={() => onChange(!checked)}>
        <span className="text-sm text-text-primary group-hover:text-accent-text transition-colors duration-200">{label}</span>
        {desc && <p className="text-xs text-text-muted mt-0.5 leading-snug">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export function CustomDropdown<T extends string>({
  value,
  onChange,
  options,
  icon: Icon
}: {
  value: T;
  onChange: (v: T) => void;
  options: { label: string; value: T }[];
  icon?: React.ElementType;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-bg-input border border-border-subtle text-xs text-text-primary rounded-lg px-3 py-2 outline-none hover:border-border-focus transition-colors min-w-[140px]"
      >
        {Icon && <Icon size={14} className="text-text-ghost" />}
        <span className="flex-1 text-left">{selectedOption?.label || value}</span>
        <span className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1L5 5L9 1" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-max bg-bg-panel border border-border-subtle rounded-lg shadow-lg overflow-hidden animate-fade-slide-in">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 text-xs transition-colors duration-150 ${value === option.value
                  ? "bg-accent/10 text-accent-text font-medium"
                  : "text-text-primary hover:bg-bg-hover"
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Yes, I understand",
  cancelText = "No, do not clear",
  type = "danger"
}: ConfirmationModalProps) {
  const [render, setRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
      setIsClosing(false);
    } else if (render) {
      setIsClosing(true);
      const timer = setTimeout(() => setRender(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, render]);

  if (!render) return null;

  const handleClose = () => {
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className={`relative w-full max-w-sm overflow-hidden rounded-2xl border border-border-subtle bg-bg-panel shadow-2xl ${isClosing ? "animate-fade-slide-out" : "animate-fade-slide-in"}`}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg ${type === "danger" ? "bg-status-critical/10 text-status-critical" :
              type === "warning" ? "bg-status-warning/10 text-status-warning" : "bg-accent/10 text-accent-text"
              }`}>
              <Trash2 size={20} strokeWidth={2.5} />
            </div>
            <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            {message}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                onConfirm();
                handleClose();
              }}
              className="w-full rounded-lg bg-status-critical py-2.5 text-sm font-bold text-white hover:brightness-110 transition-all duration-300 btn-glow shadow-sm"
            >
              {confirmText}
            </button>
            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-bg-card border border-border-subtle py-2.5 text-sm font-bold text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-300"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


import iconUrl from "../assets/arkenar-icon.png";

export function Logo({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-14 h-14"
  };

  const textSizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl"
  };

  return (
    <div className={`flex items-center gap-3 pointer-events-none select-none ${className}`}>
      <img
        src={iconUrl}
        alt="Arkenar Logo"
        className={`${sizeClasses[size]} object-contain drop-shadow-[0_0_1px_rgba(255,255,255,0.4)] antialiased shrink-0`}
      />
      <span className={`font-mono font-bold tracking-[0.15em] text-text-primary ${textSizeClasses[size]} drop-shadow-[0_0_12px_var(--color-accent-dim)]`}>
        ARKENAR
      </span>
    </div>
  );
}
