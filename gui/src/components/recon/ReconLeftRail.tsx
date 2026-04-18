import { CloseIcon } from "../icons";

interface ReconLeftRailProps {
  enableSubdomains: boolean;
  enablePortScan: boolean;
  enableDns: boolean;
  enableJsSecrets: boolean;
  onToggleSubdomains: (v: boolean) => void;
  onTogglePortScan: (v: boolean) => void;
  onToggleDns: (v: boolean) => void;
  onToggleJsSecrets: (v: boolean) => void;
  isRunning: boolean;
  queuedHosts: string[];
  onRemoveFromQueue: (host: string) => void;
  onScanQueue: () => void;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      className="rw-toggle"
      style={{ background: on ? "var(--color-accent)" : "var(--color-border-hover)" }}
      onClick={() => onChange(!on)}
    >
      <span
        className="rw-toggle-thumb"
        style={{ transform: on ? "translateX(16px)" : "translateX(2px)" }}
      />
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: "var(--color-accent)" }}
      />
      <span
        className="font-mono text-[9.5px] font-bold tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
      >
        {children}
      </span>
    </div>
  );
}

export default function ReconLeftRail({
  enableSubdomains,
  enablePortScan,
  enableDns,
  enableJsSecrets,
  onToggleSubdomains,
  onTogglePortScan,
  onToggleDns,
  onToggleJsSecrets,
  isRunning,
  queuedHosts,
  onRemoveFromQueue,
  onScanQueue,
}: ReconLeftRailProps) {
  const modules = [
    { label: "Subdomains", val: enableSubdomains, set: onToggleSubdomains },
    { label: "Port Scan", val: enablePortScan, set: onTogglePortScan },
    { label: "DNS Probe", val: enableDns, set: onToggleDns },
    { label: "JS Secrets", val: enableJsSecrets, set: onToggleJsSecrets },
  ];

  const pipelineSteps = [
    { label: "Subfinder", enabled: enableSubdomains },
    { label: "Port Scan", enabled: enablePortScan },
    { label: "DNS Probe", enabled: enableDns },
    { label: "JS Secrets", enabled: enableJsSecrets },
  ];

  return (
    <div
      className="flex flex-col shrink-0 overflow-hidden border-r border-[color:var(--color-border-subtle)]"
      style={{ width: 220, minWidth: 220, background: "var(--color-bg-panel)" }}
    >
      <div className="rw-scroll flex-1 overflow-y-auto p-3 flex flex-col gap-4">

        {/* Modules */}
        <div>
          <SectionLabel>Modules</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {modules.map(({ label, val, set }) => (
              <div key={label} className="flex items-center justify-between">
                <span
                  className="font-mono text-[11px]"
                  style={{ color: val ? "var(--color-text-primary)" : "var(--color-text-ghost)" }}
                >
                  {label}
                </span>
                <Toggle on={val} onChange={set} />
              </div>
            ))}
          </div>
        </div>

        <div className="h-px shrink-0 border-t border-[color:var(--color-border-subtle)]" />

        {/* Pipeline */}
        <div>
          <SectionLabel>Pipeline</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {pipelineSteps.map((step, i) => {
              const isActive = isRunning && step.enabled;
              const isEnabled = step.enabled;
              return (
                <div key={step.label} className="flex items-center gap-2">
                  <span className="font-mono text-[9.5px] text-[color:var(--color-text-ghost)] w-3 shrink-0">
                    {i + 1}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 flex-shrink-0${isActive ? " rw-pulse" : ""}`}
                    style={{
                      background: isActive
                        ? "var(--color-accent)"
                        : isEnabled
                        ? "transparent"
                        : "var(--color-border-hover)",
                      border: isEnabled && !isActive
                        ? "1px solid var(--color-accent)"
                        : isActive
                        ? "none"
                        : "1px solid var(--color-border-hover)",
                    }}
                  />
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: isEnabled ? "var(--color-text-muted)" : "var(--color-text-ghost)" }}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-px shrink-0 border-t border-[color:var(--color-border-subtle)]" />

        {/* Queue */}
        <div>
          <SectionLabel>Queue</SectionLabel>
          {queuedHosts.length === 0 ? (
            <div className="font-mono text-[10px] italic text-[color:var(--color-text-ghost)]">
              No hosts queued
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {queuedHosts.map((h) => (
                <div
                  key={h}
                  className="flex items-center justify-between gap-1 px-2 py-1 rounded-sm border border-[color:var(--color-border-subtle)]"
                  style={{ background: "var(--color-bg-root)" }}
                >
                  <span className="font-mono text-[10px] text-[color:var(--color-text-muted)] overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                    {h}
                  </span>
                  <button
                    onClick={() => onRemoveFromQueue(h)}
                    className="shrink-0 flex items-center justify-center text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-status-critical)] transition-colors"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <CloseIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {queuedHosts.length > 0 && (
            <button
              onClick={onScanQueue}
              className="mt-2 w-full font-mono text-[10px] font-bold tracking-[0.12em] uppercase py-1.5 rounded-sm border transition-colors"
              style={{
                background: "transparent",
                borderColor: "var(--color-accent)",
                color: "var(--color-accent)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              ▶ Scan Queue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
