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
  const statusColor = isRunning ? "#ff6b35" : isComplete ? "#4caf50" : "#555";
  const statusLabel = isRunning ? "SCANNING" : isComplete ? "COMPLETE" : "IDLE";

  return (
    <div style={{
      height: 48,
      minHeight: 48,
      background: "#111111",
      borderBottom: "1px solid #2a2a2a",
      display: "flex",
      alignItems: "center",
      padding: "0 12px",
      gap: 8,
      flexShrink: 0,
    }}>
      <span style={{ color: "#ff6b35", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
         ARKENAR RECON
      </span>
      <span style={{ color: "#2a2a2a", margin: "0 4px" }}>·</span>
      <span
        className={isRunning ? "rw-pulse" : ""}
        style={{ color: statusColor, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", whiteSpace: "nowrap" }}
      >
        ● {statusLabel}
      </span>

      <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, marginLeft: 8 }}>
        <input
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !isRunning) onRun(); }}
          placeholder="target domain (e.g. example.com)"
          disabled={isRunning}
          style={{
            flex: 1,
            minWidth: 0,
            background: "#0d0d0d",
            border: "1px solid #2a2a2a",
            color: "#e0e0e0",
            borderRadius: 4,
            padding: "0 10px",
            height: 30,
            fontSize: 12,
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#ff6b35")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
        />
        {!isRunning ? (
          <button
            onClick={onRun}
            disabled={!domain.trim()}
            style={{
              background: domain.trim() ? "#ff6b35" : "#222",
              color: domain.trim() ? "#000" : "#555",
              border: "none",
              borderRadius: 4,
              padding: "0 14px",
              height: 30,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "monospace",
              cursor: domain.trim() ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
              letterSpacing: "0.1em",
            }}
          >
            ▶ LAUNCH
          </button>
        ) : (
          <button
            onClick={onStop}
            style={{
              background: "transparent",
              color: "#f44336",
              border: "1px solid #f44336",
              borderRadius: 4,
              padding: "0 14px",
              height: 30,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "monospace",
              cursor: "pointer",
              whiteSpace: "nowrap",
              letterSpacing: "0.1em",
            }}
          >
            ■ ABORT
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
        {[
          { label: "Hosts", val: totalHosts },
          { label: "Alive", val: totalAlive },
          { label: "Ports", val: totalPorts },
          { label: "Secrets", val: totalSecrets },
          { label: "DNS", val: totalDns },
        ].map(({ label, val }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}:</span>
            <span style={{ fontSize: 11, color: val > 0 ? "#e0e0e0" : "#444", fontWeight: 700 }}>{val}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onExportCsv}
        disabled={totalHosts === 0}
        title="Export CSV"
        style={{
          background: "#1a1a1a",
          border: "1px solid #2a2a2a",
          color: totalHosts > 0 ? "#aaa" : "#444",
          borderRadius: 4,
          padding: "0 10px",
          height: 30,
          fontSize: 11,
          fontFamily: "monospace",
          cursor: totalHosts > 0 ? "pointer" : "not-allowed",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { if (totalHosts > 0) { e.currentTarget.style.borderColor = "#ff6b35"; e.currentTarget.style.color = "#ff6b35"; } }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = totalHosts > 0 ? "#aaa" : "#444"; }}
      >
        ⎘ Export CSV
      </button>
    </div>
  );
}
