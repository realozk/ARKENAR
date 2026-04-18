import { PlayIcon, StopIcon, DownloadIcon } from "../icons";

interface ReconTopBarProps {
  domain: string;
  onDomainChange: (v: string) => void;
  isRunning: boolean;
  isComplete: boolean;
  onRun: () => void;
  onStop: () => Promise<void>;
  totalHosts: number;
  totalAlive: number;
  totalPorts: number;
  totalSecrets: number;
  totalDns: number;
  onExportCsv: () => void;
}

export default function ReconTopBar({
  domain,
  onDomainChange,
  isRunning,
  isComplete,
  onRun,
  onStop,
  totalHosts,
  totalAlive,
  totalPorts,
  totalSecrets,
  totalDns,
  onExportCsv,
}: ReconTopBarProps) {
  const statusColor = isRunning
    ? "var(--color-accent)"
    : isComplete
    ? "var(--color-status-success)"
    : "var(--color-text-ghost)";

  const statusLabel = isRunning ? "SCANNING" : isComplete ? "COMPLETE" : "IDLE";

  return (
    <div
      className="flex items-center gap-2 px-3 shrink-0 border-b border-[color:var(--color-border-subtle)]"
      style={{ height: 48, minHeight: 48, background: "var(--color-bg-root-2)" }}
    >
      {/* Wordmark + status */}
      <span
        className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase whitespace-nowrap"
        style={{ color: "var(--color-accent)" }}
      >
        RECON
      </span>
      <span className="text-[color:var(--color-border-hover)]">·</span>
      <span
        className={`font-mono text-[10px] font-bold tracking-[0.14em] whitespace-nowrap flex items-center gap-1${isRunning ? " rw-pulse" : ""}`}
        style={{ color: statusColor }}
      >
        <span style={{ fontSize: 8 }}>●</span>
        {statusLabel}
      </span>

      {/* Domain input + action button */}
      <div className="flex flex-1 min-w-0 items-center gap-1.5 ml-1">
        <div
          className="flex-1 min-w-0 h-7 flex items-stretch rounded-sm border border-[color:var(--color-border-subtle)] focus-within:border-[color:var(--color-accent)]"
          style={{ background: "var(--color-bg-panel)", transition: "border-color 0.15s" }}
        >
          <input
            value={domain}
            onChange={(e) => onDomainChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isRunning) onRun();
            }}
            placeholder="target domain (e.g. example.com)"
            disabled={isRunning}
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent font-mono text-[11.5px] px-2 outline-none placeholder-[color:var(--color-text-ghost)] text-[color:var(--color-text-primary)]"
            style={{ opacity: isRunning ? 0.5 : 1 }}
          />
        </div>

        {!isRunning ? (
          <button
            onClick={onRun}
            disabled={!domain.trim()}
            className="h-7 px-3 flex items-center gap-1.5 font-mono text-[10.5px] font-bold tracking-[0.14em] text-white rounded-sm transition-opacity"
            style={{
              background: domain.trim() ? "var(--color-accent)" : "var(--color-bg-hover)",
              color: domain.trim() ? "var(--color-bg-root)" : "var(--color-text-ghost)",
              cursor: domain.trim() ? "pointer" : "not-allowed",
              opacity: domain.trim() ? 1 : 0.5,
            }}
          >
            <PlayIcon size={10} />
            LAUNCH
          </button>
        ) : (
          <button
            onClick={onStop}
            className="h-7 px-3 flex items-center gap-1.5 font-mono text-[10.5px] font-bold tracking-[0.14em] rounded-sm border"
            style={{
              background: "transparent",
              color: "var(--color-status-critical)",
              borderColor: "var(--color-status-critical)",
              cursor: "pointer",
            }}
          >
            <StopIcon size={10} />
            ABORT
          </button>
        )}
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-4 shrink-0">
        {[
          { label: "HOSTS", val: totalHosts, color: "var(--color-accent)" },
          { label: "ALIVE", val: totalAlive, color: "var(--color-status-success)" },
          { label: "PORTS", val: totalPorts, color: "var(--color-text-primary)" },
          { label: "SEC", val: totalSecrets, color: totalSecrets > 0 ? "var(--color-status-warning)" : "var(--color-text-ghost)" },
          { label: "DNS", val: totalDns, color: "var(--color-accent-hover)" },
        ].map(({ label, val, color }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">
              {label}
            </span>
            <span
              className="font-mono text-[11px] font-bold"
              style={{ color: val > 0 ? color : "var(--color-text-ghost)" }}
            >
              {val}
            </span>
          </div>
        ))}
      </div>

      {/* Export CSV */}
      <button
        onClick={onExportCsv}
        disabled={totalHosts === 0}
        title="Export CSV"
        className="h-7 px-2 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] rounded-sm border border-[color:var(--color-border-subtle)] text-[color:var(--color-text-muted)] transition-colors shrink-0"
        style={{
          background: "var(--color-bg-panel)",
          cursor: totalHosts > 0 ? "pointer" : "not-allowed",
          opacity: totalHosts > 0 ? 1 : 0.4,
        }}
        onMouseEnter={(e) => {
          if (totalHosts > 0) {
            e.currentTarget.style.borderColor = "var(--color-accent)";
            e.currentTarget.style.color = "var(--color-accent)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border-subtle)";
          e.currentTarget.style.color = "var(--color-text-muted)";
        }}
      >
        <DownloadIcon size={10} />
        CSV
      </button>
    </div>
  );
}
