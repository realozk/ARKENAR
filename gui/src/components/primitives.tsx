import type { ScanStatus } from "../types";

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle-track ${checked ? "active" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

export function StatusDot({ status }: { status: ScanStatus }) {
  const colors: Record<ScanStatus, string> = {
    idle: "bg-status-idle",
    running: "bg-status-info animate-pulse",
    finished: "bg-status-success",
    error: "bg-status-critical",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
}

export function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <Icon size={14} className="text-accent-text neon-label" strokeWidth={2.5} />
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted neon-label">
        {children}
      </span>
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-border-subtle bg-bg-input px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-ghost focus:border-border-focus focus:outline-none transition-all duration-200 ${mono ? "font-mono text-[13px]" : ""}`}
    />
  );
}

export function NumberInput({ value, onChange, min, max }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      className="w-full rounded-lg border border-border-subtle bg-bg-input px-3.5 py-2.5 text-[13px] font-mono text-text-primary focus:border-border-focus focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

export function ToggleRow({ label, desc, checked, onChange }: {
  label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <span className="text-sm text-text-primary">{label}</span>
        {desc && <p className="text-xs text-text-muted mt-0.5 leading-snug">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
