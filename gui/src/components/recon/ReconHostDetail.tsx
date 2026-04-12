import { ReconHost } from "../../types";

const PORT_LABELS: Record<number, string> = {
  80: "HTTP",
  443: "HTTPS",
  8080: "HTTP-ALT",
  8443: "HTTPS-ALT",
  22: "SSH",
  21: "FTP",
  3306: "MySQL",
  5432: "PG",
  6379: "Redis",
  27017: "MongoDB",
  25: "SMTP",
  53: "DNS",
  3389: "RDP",
  5900: "VNC",
};

const PRIORITY_STYLE: Record<string, { border: string; bg: string; text: string; label: string }> = {
  high: { border: "#ff4444", bg: "rgba(255,68,68,0.1)", text: "#ff4444", label: "HIGH VALUE" },
  medium: { border: "#ff9800", bg: "rgba(255,152,0,0.1)", text: "#ff9800", label: "MEDIUM" },
  standard: { border: "#555", bg: "rgba(100,100,100,0.1)", text: "#888", label: "STANDARD" },
};

function getPriority(host: string): "high" | "medium" | "standard" {
  const h = host.split(".")[0].toLowerCase();
  if (
    ["admin", "api", "dev", "staging", "test", "vpn", "remote", "internal",
      "portal", "login", "secure", "auth", "manage", "dashboard"].some((k) => h.includes(k))
  )
    return "high";
  if (
    ["app", "web", "mail", "smtp", "ftp", "sftp", "jenkins", "gitlab",
      "jira", "confluence", "monitor"].some((k) => h.includes(k))
  )
    return "medium";
  return "standard";
}

interface ReconHostDetailProps {
  host: ReconHost | null;
  activeTab: "ports" | "dns" | "secrets";
  onTabChange: (t: "ports" | "dns" | "secrets") => void;
  onAddToQueue: (targets: string[]) => void;
  onSendToStudio: (host: string) => void;
  onClose: () => void;
  totalPorts: number;
  totalDns: number;
  totalSecrets: number;
}

export default function ReconHostDetail({
  host,
  activeTab,
  onTabChange,
  onAddToQueue,
  onSendToStudio,
  onClose,
  totalPorts,
  totalDns,
  totalSecrets,
}: ReconHostDetailProps) {
  if (!host) {
    return (
      <div className="rw-scroll" style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#444" }}>
          <span style={{ fontSize: 28, opacity: 0.3 }}>◎</span>
          <span style={{ fontSize: 11, textAlign: "center" }}>Select a host<br />to view intel</span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#ff6b35", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, marginBottom: 8 }}>Aggregate Stats</div>
          <div style={{ border: "1px solid #2a2a2a", borderRadius: 4, overflow: "hidden" }}>
            {[
              { label: "total ports", val: totalPorts },
              { label: "DNS records", val: totalDns },
              { label: "JS secrets", val: totalSecrets },
            ].map(({ label, val }) => (
              <div key={label} style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderBottom: "1px solid #2a2a2a",
              }}>
                <span style={{ fontSize: 11, color: "#666" }}>{label}</span>
                <span style={{ fontSize: 11, color: val > 0 ? "#e0e0e0" : "#444", fontWeight: 700 }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const priority = getPriority(host.host);
  const ps = PRIORITY_STYLE[priority];
  const isAlive = host.ports.length > 0;

  const metaParts: string[] = [];
  if (host.dns?.a[0]) metaParts.push(host.dns.a[0]);
  if (host.ports.some((p) => p === 443)) metaParts.push("HTTPS");
  else if (host.ports.some((p) => p === 80)) metaParts.push("HTTP");
  if (host.ports.length > 0) metaParts.push(`${host.ports.length} port${host.ports.length !== 1 ? "s" : ""}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        padding: "8px 12px 6px",
        borderBottom: "1px solid #2a2a2a",
        flexShrink: 0,
        background: ps.bg,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            border: `1px solid ${ps.border}`,
            color: ps.text,
            padding: "1px 6px",
            borderRadius: 4,
          }}>{ps.label}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#aaa")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#444")}
          >×</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: isAlive ? "#4caf50" : "#f44336", fontSize: 10 }}>●</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{host.host}</span>
        </div>
        {metaParts.length > 0 && (
          <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{metaParts.join("  ·  ")}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
        {[
          { label: "+ Queue", action: () => onAddToQueue([host.host]) },
          { label: "→ Studio", action: () => onSendToStudio(`https://${host.host}`) },
          { label: "⎘ Copy", action: () => navigator.clipboard.writeText(host.host) },
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              flex: 1,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              color: "#aaa",
              borderRadius: 4,
              padding: "4px 0",
              fontSize: 10,
              fontFamily: "monospace",
              cursor: "pointer",
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff6b35"; e.currentTarget.style.color = "#ff6b35"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#aaa"; }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
        {(["ports", "dns", "secrets"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            style={{
              flex: 1,
              background: activeTab === tab ? "#1a1a1a" : "transparent",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #ff6b35" : "2px solid transparent",
              color: activeTab === tab ? "#e0e0e0" : "#666",
              padding: "7px 0",
              fontSize: 10,
              fontFamily: "monospace",
              cursor: "pointer",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="rw-scroll" style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {activeTab === "ports" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {host.ports.length === 0 ? (
              <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>No open ports</span>
            ) : host.ports.map((p) => (
              <div key={p} style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 8px",
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: 4,
              }}>
                <span style={{ fontSize: 12, color: "#e0e0e0", fontWeight: 700, width: 40, flexShrink: 0 }}>{p}</span>
                <span style={{ fontSize: 11, color: "#666", flex: 1 }}>{PORT_LABELS[p] || "TCP"}</span>
                <span style={{ fontSize: 10, color: "#4caf50" }}>● open</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "dns" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {!host.dns ? (
              <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>No DNS records</span>
            ) : (
              <>
                {host.dns.a.length > 0 && host.dns.a.map((ip) => (
                  <div key={ip} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 8px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4 }}>
                    <span style={{ fontSize: 10, color: "#ff6b35", fontWeight: 700, width: 30, flexShrink: 0 }}>A</span>
                    <span style={{ fontSize: 11, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ip}</span>
                  </div>
                ))}
                {host.dns.mx.length > 0 && host.dns.mx.map((m) => (
                  <div key={m} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 8px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4 }}>
                    <span style={{ fontSize: 10, color: "#2196f3", fontWeight: 700, width: 30, flexShrink: 0 }}>MX</span>
                    <span style={{ fontSize: 11, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m}</span>
                  </div>
                ))}
                {host.dns.txt.length > 0 && host.dns.txt.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 8px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4 }}>
                    <span style={{ fontSize: 10, color: "#aaa", fontWeight: 700, width: 30, flexShrink: 0, paddingTop: 1 }}>TXT</span>
                    <span style={{ fontSize: 10, color: "#aaa", wordBreak: "break-all" }}>{t}</span>
                  </div>
                ))}
                {host.dns.cname && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 8px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4 }}>
                    <span style={{ fontSize: 10, color: "#4caf50", fontWeight: 700, width: 30, flexShrink: 0 }}>CN</span>
                    <span style={{ fontSize: 11, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{host.dns.cname}</span>
                  </div>
                )}
                {host.dns.a.length === 0 && host.dns.mx.length === 0 && host.dns.txt.length === 0 && !host.dns.cname && (
                  <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>No records found</span>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "secrets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {host.jsSecrets.length === 0 ? (
              <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>No secrets found</span>
            ) : host.jsSecrets.map((s, i) => (
              <div key={i} style={{
                padding: "6px 8px",
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#ff9800",
                    border: "1px solid #ff9800",
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(255,152,0,0.1)",
                  }}>{s.secret_type}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>L:{s.line_number}</span>
                </div>
                <span style={{ fontSize: 10, color: "#aaa", wordBreak: "break-all", fontFamily: "monospace" }}>
                  {s.matched_value.length > 60 ? s.matched_value.slice(0, 60) + "…" : s.matched_value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
