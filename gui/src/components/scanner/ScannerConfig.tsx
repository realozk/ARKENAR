import type { ScanConfig } from "../../types";

/* ── Toggle — TASK 5: Smaller 28×14px dense toggle matching chrome ── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); } }}
      className="relative inline-flex items-center cursor-pointer transition-colors duration-200 shrink-0 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
      style={{
        width: 28,
        height: 14,
        borderRadius: 7,
        background: checked ? "var(--color-accent)" : "var(--color-border-hover)",
      }}
    >
      <span
        className="absolute rounded-full transition-transform duration-200"
        style={{
          width: 10,
          height: 10,
          background: "var(--color-bg-root)",
          transform: checked ? "translateX(16px)" : "translateX(2px)",
          top: '50%',
          marginTop: -5,
        }}
      />
    </div>
  );
}

/* ── ToggleRow ───────────────────────────────────────────────────────── */
interface ToggleRowProps {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}
function ToggleRow({ label, desc, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <div className="flex-1 min-w-0">
        <div
          className="font-mono text-[color:var(--color-text-muted)] leading-tight"
          style={{ fontSize: 'var(--fs-body)' }}
        >
          {label}
        </div>
        {desc && (
          <div
            className="font-mono text-[color:var(--color-text-ghost)] mt-0.5"
            style={{ fontSize: 'var(--fs-label)' }}
          >
            {desc}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

/* ── NumberRow ───────────────────────────────────────────────────────── */
interface NumberRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}
function NumberRow({ label, value, onChange, min = 1, max = 1000 }: NumberRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span
        className="font-mono text-[color:var(--color-text-muted)] flex-1 min-w-0"
        style={{ fontSize: 'var(--fs-body)' }}
      >
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-16 shrink-0 font-mono text-right px-1.5 py-1 rounded-sm
          bg-[color:var(--color-bg-root)] border border-[color:var(--color-border-subtle)]
          text-[color:var(--color-text-primary)] outline-none
          focus:border-[color:var(--color-accent)] transition-colors duration-150"
        style={{ fontSize: 'var(--fs-body)' }}
      />
    </div>
  );
}

/* ── ModeButton — TASK 5: Studio segmented control pattern ──────────── */
// Flat border container, accent background for active state
function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1 font-mono uppercase cursor-pointer transition-colors duration-150
        focus-visible:outline-none focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
      style={{
        fontSize: 'var(--fs-label)',
        letterSpacing: 'var(--tr-label)',
        fontWeight: 700,
        background: active ? "rgba(249,115,22,0.12)" : "transparent",
        color: active ? "var(--color-accent-hover)" : "var(--color-text-ghost)",
        borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

/* ── TextFieldRow ────────────────────────────────────────────────────── */
function TextFieldRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-2">
      <div
        className="font-mono text-[color:var(--color-text-muted)] mb-1"
        style={{ fontSize: 'var(--fs-body)' }}
      >
        {label}
      </div>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full font-mono px-2 py-1 rounded-sm
          bg-[color:var(--color-bg-root)] border border-[color:var(--color-border-subtle)]
          text-[color:var(--color-text-primary)] placeholder-[color:var(--color-text-ghost)]
          outline-none focus:border-[color:var(--color-accent)]
          transition-colors duration-150 box-border"
        style={{ fontSize: 'var(--fs-body)' }}
      />
    </div>
  );
}

/* ── Section divider ─────────────────────────────────────────────────── */
function Divider() {
  return <div className="border-t border-[color:var(--color-border-subtle)] my-3.5" />;
}

/* ── Section header — TASK 5: Studio-style muted mono uppercase (no icon, no orange) */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono uppercase mb-2 block"
      style={{
        fontSize: 'var(--fs-label)',
        letterSpacing: 'var(--tr-label)',
        color: 'var(--color-text-muted)',
      }}
    >
      {children}
    </span>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
interface ScannerConfigProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
}

export default function ScannerConfig({ config, onUpdate }: ScannerConfigProps) {
  return (
    <div
      className="w-[240px] min-w-[240px] shrink-0 flex flex-col overflow-hidden
        border-r border-[color:var(--color-border-subtle)]"
      style={{ background: "var(--color-bg-panel)" }}
    >
      {/* Header — Studio style: small mono uppercase */}
      <div className="px-3.5 py-2.5 border-b border-[color:var(--color-border-subtle)] shrink-0">
        <span
          className="font-mono uppercase text-[color:var(--color-text-muted)]"
          style={{ fontSize: 'var(--fs-label)', letterSpacing: 'var(--tr-label)' }}
        >
          Config
        </span>
      </div>

      {/* Scrollable body */}
      <div
        className="flex-1 overflow-y-auto px-3.5 py-2.5"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-border-hover) transparent" } as React.CSSProperties}
      >
        {/* Mode — TASK 5: flat segmented control */}
        <div className="mb-4">
          <SectionLabel>Mode</SectionLabel>
          <div
            className="flex overflow-hidden border border-[color:var(--color-border-subtle)] mb-1.5"
            style={{ background: "var(--color-bg-root)" }}
          >
            <ModeButton active={config.mode === "simple"} onClick={() => onUpdate("mode", "simple")} label="Simple" />
            <ModeButton active={config.mode === "advanced"} onClick={() => onUpdate("mode", "advanced")} label="Advanced" />
          </div>
        </div>

        <Divider />

        {/* Modules */}
        <div className="mb-4">
          <SectionLabel>Modules</SectionLabel>
          <ToggleRow label="Katana Crawler" desc="Deep URL discovery" checked={config.enableCrawler} onChange={(v) => onUpdate("enableCrawler", v)} />
          <ToggleRow label="Nuclei Scanner" desc="CVE template matching" checked={config.enableNuclei} onChange={(v) => onUpdate("enableNuclei", v)} />
          <ToggleRow label="JS Endpoint Analysis" desc="Hidden API endpoints in JS" checked={config.enableJsAnalysis} onChange={(v) => onUpdate("enableJsAnalysis", v)} />
          <ToggleRow label="Parameter Fuzzing" desc="Contextual payload per param" checked={config.enableParamFuzz} onChange={(v) => onUpdate("enableParamFuzz", v)} />
          <ToggleRow label="Smart Payloads" desc="Priority by param name" checked={config.enableSmartPayloads} onChange={(v) => onUpdate("enableSmartPayloads", v)} />
          <ToggleRow label="Fingerprinting" checked={config.enableFingerprint} onChange={(v) => onUpdate("enableFingerprint", v)} />
        </div>

        <Divider />

        {/* Performance */}
        <div className="mb-4">
          <SectionLabel>Performance</SectionLabel>
          <NumberRow label="Threads" value={config.threads} onChange={(v) => onUpdate("threads", v)} min={1} max={500} />
          <NumberRow label="Timeout (s)" value={config.timeout} onChange={(v) => onUpdate("timeout", v)} min={1} max={120} />
          <NumberRow label="Rate Limit (req/s)" value={config.rateLimit} onChange={(v) => onUpdate("rateLimit", v)} min={1} max={5000} />
        </div>

        {/* Crawler — conditionally shown */}
        {config.enableCrawler && (
          <>
            <Divider />
            <div className="mb-4">
              <SectionLabel>Crawler</SectionLabel>
              <NumberRow label="Depth" value={config.crawlerDepth} onChange={(v) => onUpdate("crawlerDepth", v)} min={1} max={10} />
              <NumberRow label="Timeout (s)" value={config.crawlerTimeout} onChange={(v) => onUpdate("crawlerTimeout", v)} min={10} max={300} />
              <NumberRow label="Max URLs" value={config.crawlerMaxUrls} onChange={(v) => onUpdate("crawlerMaxUrls", v)} min={5} max={1000} />
            </div>
          </>
        )}

        {/* Advanced — conditionally shown */}
        {config.mode === "advanced" && (
          <>
            <Divider />
            <div className="mb-4">
              <SectionLabel>Advanced</SectionLabel>
              <TextFieldRow label="Proxy" value={config.proxy} placeholder="http://127.0.0.1:8080" onChange={(v) => onUpdate("proxy", v)} />
              <TextFieldRow label="Custom Headers" value={config.headers} placeholder="Auth: Bearer token" onChange={(v) => onUpdate("headers", v)} />
              <TextFieldRow label="Nuclei Tags" value={config.tags} placeholder="sqli,xss,lfi" onChange={(v) => onUpdate("tags", v)} />
              <TextFieldRow label="Output File" value={config.output} placeholder="scan_results.json" onChange={(v) => onUpdate("output", v)} />
              <TextFieldRow label="Scope Regex" value={config.scopeRegex} placeholder="^https?://target\.com" onChange={(v) => onUpdate("scopeRegex", v)} />
              {config.enableNuclei && (
                <TextFieldRow label="Nuclei Templates Dir" value={config.nucleiTemplatesDir} placeholder="~/.arkenar/plugins/nuclei" onChange={(v) => onUpdate("nucleiTemplatesDir", v)} />
              )}
            </div>
          </>
        )}

        <Divider />

        {/* Options */}
        <div className="mb-4">
          <SectionLabel>Options</SectionLabel>
          <ToggleRow label="Same-domain scope" checked={config.scope} onChange={(v) => onUpdate("scope", v)} />
          <ToggleRow label="Verbose" checked={config.verbose} onChange={(v) => onUpdate("verbose", v)} />
          <ToggleRow label="Dry Run" desc="No real requests sent" checked={config.dryRun} onChange={(v) => onUpdate("dryRun", v)} />
        </div>
      </div>
    </div>
  );
}
