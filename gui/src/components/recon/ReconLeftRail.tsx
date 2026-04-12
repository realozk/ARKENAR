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
      style={{ background: on ? "#ff6b35" : "#333" }}
      onClick={() => onChange(!on)}
    >
      <span
        className="rw-toggle-thumb"
        style={{ transform: on ? "translateX(16px)" : "translateX(2px)" }}
      />
    </span>
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
    <div style={{
      width: 220,
      minWidth: 220,
      flexShrink: 0,
      background: "#141414",
      borderRight: "1px solid #2a2a2a",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <div className="rw-scroll" style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 16 }}>

        <div>
          <div style={{ fontSize: 10, color: "#ff6b35", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, marginBottom: 8 }}>Modules</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {modules.map(({ label, val, set }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: val ? "#e0e0e0" : "#666" }}>{label}</span>
                <Toggle on={val} onChange={set} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: "#2a2a2a", flexShrink: 0 }} />

        <div>
          <div style={{ fontSize: 10, color: "#ff6b35", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, marginBottom: 8 }}>Pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {pipelineSteps.map((step, i) => {
              const isActive = isRunning && step.enabled;
              const isEnabled = step.enabled;
              return (
                <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "#444", width: 12 }}>{i + 1}</span>
                  <span
                    style={{
                      fontSize: 11,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isActive ? "#ff6b35" : isEnabled ? "transparent" : "#333",
                      border: isEnabled && !isActive ? "1px solid #ff6b35" : isActive ? "none" : "1px solid #333",
                      flexShrink: 0,
                    }}
                    className={isActive ? "rw-pulse" : ""}
                  />
                  <span style={{ fontSize: 11, color: isEnabled ? "#aaa" : "#444" }}>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ height: 1, background: "#2a2a2a", flexShrink: 0 }} />

        <div>
          <div style={{ fontSize: 10, color: "#ff6b35", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, marginBottom: 8 }}>Queue</div>
          {queuedHosts.length === 0 ? (
            <div style={{ fontSize: 10, color: "#444", fontStyle: "italic" }}>No hosts queued</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {queuedHosts.map((h) => (
                <div key={h} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{h}</span>
                  <button
                    onClick={() => onRemoveFromQueue(h)}
                    style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11, padding: 0, lineHeight: 1, flexShrink: 0 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#f44336")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {queuedHosts.length > 0 && (
            <button
              onClick={onScanQueue}
              style={{
                marginTop: 8,
                width: "100%",
                background: "#1a1a1a",
                border: "1px solid #ff6b35",
                color: "#ff6b35",
                borderRadius: 4,
                padding: "5px 0",
                fontSize: 10,
                fontFamily: "monospace",
                cursor: "pointer",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,107,53,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
            >
              ▶ Scan Queue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
