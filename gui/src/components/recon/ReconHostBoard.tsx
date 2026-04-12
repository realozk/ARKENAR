import { ReconHost } from "../../types";

interface FeedItem {
  id: string;
  type: "subdomain-found" | "port-open" | "dns-record" | "secret-found";
  message: string;
  time: string;
}

const FEED_COLORS: Record<string, string> = {
  "subdomain-found": "#ff6b35",
  "port-open": "#4caf50",
  "dns-record": "#2196f3",
  "secret-found": "#ff9800",
};

const PRIORITY_STYLE: Record<string, { border: string }> = {
  high: { border: "#ff4444" },
  medium: { border: "#ff9800" },
  standard: { border: "#555" },
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

interface ReconHostBoardProps {
  hosts: Map<string, ReconHost>;
  hostFilter: string;
  onFilterChange: (v: string) => void;
  filterMode: "all" | "high" | "alive" | "secrets";
  onFilterModeChange: (m: "all" | "high" | "alive" | "secrets") => void;
  selectedHostId: string | null;
  onSelectHost: (id: string | null) => void;
  queuedHosts: string[];
  onToggleQueue: (host: string) => void;
  totalHosts: number;
  totalAlive: number;
  totalPorts: number;
  totalSecrets: number;
  totalDns: number;
  eventFeed: FeedItem[];
}

export default function ReconHostBoard({
  hosts,
  hostFilter,
  onFilterChange,
  filterMode,
  onFilterModeChange,
  selectedHostId,
  onSelectHost,
  queuedHosts,
  onToggleQueue,
  totalHosts,
  totalAlive,
  totalPorts,
  totalSecrets,
  totalDns,
  eventFeed,
}: ReconHostBoardProps) {
  const hostsArray = Array.from(hosts.values());

  const filteredHosts = hostsArray.filter((h) => {
    const matchesSearch = h.host.toLowerCase().includes(hostFilter.toLowerCase());
    if (!matchesSearch) return false;
    if (filterMode === "high") return getPriority(h.host) === "high";
    if (filterMode === "alive") return h.ports.length > 0;
    if (filterMode === "secrets") return h.jsSecrets.length > 0;
    return true;
  });

  return (
    <div style={{ flex: 1, minWidth: 0, background: "#111111", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      <div style={{
        display: "flex",
        gap: 1,
        flexShrink: 0,
        borderBottom: "1px solid #2a2a2a",
        background: "#141414",
      }}>
        {[
          { label: "HOSTS", val: totalHosts, color: "#ff6b35" },
          { label: "ALIVE", val: totalAlive, color: "#4caf50" },
          { label: "PORTS", val: totalPorts, color: "#e0e0e0" },
          { label: "SECRETS", val: totalSecrets, color: totalSecrets > 0 ? "#ff9800" : "#444" },
          { label: "DNS", val: totalDns, color: "#2196f3" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            flex: 1,
            padding: "6px 12px",
            borderRight: "1px solid #2a2a2a",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</span>
            <span style={{ fontSize: 16, color, fontWeight: 700, lineHeight: 1.2 }}>{val}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #2a2a2a", display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <input
            value={hostFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Filter hosts..."
            style={{
              flex: 1,
              background: "#0d0d0d",
              border: "1px solid #2a2a2a",
              color: "#e0e0e0",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              fontFamily: "monospace",
              outline: "none",
              height: 26,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#ff6b35")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
          />
          {(["all", "high", "alive", "secrets"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onFilterModeChange(mode)}
              style={{
                background: filterMode === mode ? "rgba(255,107,53,0.15)" : "#1a1a1a",
                border: `1px solid ${filterMode === mode ? "#ff6b35" : "#2a2a2a"}`,
                color: filterMode === mode ? "#ff6b35" : "#666",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 10,
                fontFamily: "monospace",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 700,
                height: 26,
              }}
            >
              {mode === "secrets" ? "🔑" : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 36px 80px 36px 28px",
          padding: "4px 12px",
          borderBottom: "1px solid #2a2a2a",
          flexShrink: 0,
        }}>
          {["HOST", "ST", "PORTS", "SEC", "Q"].map((h) => (
            <span key={h} style={{ fontSize: 10, color: "#ff6b35", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{h}</span>
          ))}
        </div>

        <div className="rw-scroll" style={{ flex: 1, overflowY: "auto" }}>
          {filteredHosts.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#444", gap: 8 }}>
              <span style={{ fontSize: 24, opacity: 0.3 }}>◎</span>
              <span style={{ fontSize: 11 }}>
                {totalHosts === 0 ? "Run recon above to populate hosts" : "No hosts match filter"}
              </span>
            </div>
          ) : (
            filteredHosts.map((h) => {
              const isAlive = h.ports.length > 0;
              const isSelected = selectedHostId === h.host;
              const priority = getPriority(h.host);
              const isQueued = queuedHosts.includes(h.host);
              return (
                <div
                  key={h.host}
                  onClick={() => onSelectHost(isSelected ? null : h.host)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 36px 80px 36px 28px",
                    padding: "5px 12px",
                    borderBottom: "1px solid #1a1a1a",
                    cursor: "pointer",
                    background: isSelected ? "#1a1a1a" : "transparent",
                    borderLeft: isSelected ? `2px solid ${PRIORITY_STYLE[priority].border}` : "2px solid transparent",
                    transition: "background 0.1s",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#141414"; }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 11, color: isSelected ? "#e0e0e0" : "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 4 }}>{h.host}</span>
                  <span style={{ fontSize: 11, color: isAlive ? "#4caf50" : "#f44336" }}>●</span>
                  <span style={{ fontSize: 10, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.ports.length > 0 ? h.ports.slice(0, 3).join(",") + (h.ports.length > 3 ? "…" : "") : "—"}
                  </span>
                  <span style={{ fontSize: 10, color: h.jsSecrets.length > 0 ? "#ff9800" : "#444" }}>
                    {h.jsSecrets.length > 0 ? h.jsSecrets.length : "—"}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); onToggleQueue(h.host); }}
                    title={isQueued ? "Remove from queue" : "Add to queue"}
                    style={{
                      fontSize: 11,
                      cursor: "pointer",
                      color: isQueued ? "#ff6b35" : "#444",
                      userSelect: "none",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#ff6b35")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = isQueued ? "#ff6b35" : "#444")}
                  >
                    {isQueued ? "✓" : "+"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ height: 160, minHeight: 160, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "5px 12px", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "#ff6b35", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>Latest Events</span>
        </div>
        <div className="rw-scroll" style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {eventFeed.length === 0 ? (
            <div style={{ padding: "12px", fontSize: 10, color: "#444", fontStyle: "italic" }}>
              Events stream here during scan…
            </div>
          ) : (
            eventFeed.map((item) => (
              <div key={item.id} style={{
                display: "flex",
                gap: 8,
                padding: "2px 12px",
                alignItems: "flex-start",
                borderBottom: "1px solid #161616",
              }}>
                <span style={{ fontSize: 10, color: "#444", whiteSpace: "nowrap", paddingTop: 1 }}>{item.time}</span>
                <span style={{
                  fontSize: 10,
                  color: FEED_COLORS[item.type],
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}>{item.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
