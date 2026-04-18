import { ReconHost } from "../../types";

interface FeedItem {
  id: string;
  type: "subdomain-found" | "port-open" | "dns-record" | "secret-found";
  message: string;
  time: string;
}

const FEED_COLORS: Record<string, string> = {
  "subdomain-found": "var(--color-accent)",
  "port-open": "var(--color-status-success)",
  "dns-record": "var(--color-text-muted)",
  "secret-found": "var(--color-status-warning)",
};

const PRIORITY_STYLE: Record<string, { accentColor: string; borderLeft: string }> = {
  high: { accentColor: "var(--color-status-critical)", borderLeft: "var(--color-status-critical)" },
  medium: { accentColor: "var(--color-status-warning)", borderLeft: "var(--color-status-warning)" },
  standard: { accentColor: "var(--color-text-ghost)", borderLeft: "var(--color-border-hover)" },
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

const FILTER_MODES = ["all", "high", "alive", "secrets"] as const;
type FilterMode = typeof FILTER_MODES[number];

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
    <div
      className="flex flex-col min-w-0 overflow-hidden"
      style={{ flex: 1, background: "var(--color-bg-root)" }}
    >
      {/* Stats bar */}
      <div
        className="flex shrink-0 border-b border-[color:var(--color-border-subtle)]"
        style={{ background: "var(--color-bg-panel)" }}
      >
        {[
          { label: "HOSTS", val: totalHosts, color: "var(--color-accent)" },
          { label: "ALIVE", val: totalAlive, color: "var(--color-status-success)" },
          { label: "PORTS", val: totalPorts, color: "var(--color-text-primary)" },
          { label: "SECRETS", val: totalSecrets, color: totalSecrets > 0 ? "var(--color-status-warning)" : "var(--color-text-ghost)" },
          { label: "DNS", val: totalDns, color: "var(--color-accent-hover)" },
        ].map(({ label, val, color }) => (
          <div
            key={label}
            className="flex flex-col items-center justify-center py-1.5 px-3 border-r border-[color:var(--color-border-subtle)]"
            style={{ flex: 1 }}
          >
            <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">
              {label}
            </span>
            <span
              className="font-mono text-[15px] font-bold leading-tight mt-0.5"
              style={{ color }}
            >
              {val}
            </span>
          </div>
        ))}
      </div>

      {/* Host list area */}
      <div
        className="flex flex-col min-h-0 overflow-hidden border-b border-[color:var(--color-border-subtle)]"
        style={{ flex: 1 }}
      >
        {/* Filter bar */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 shrink-0 border-b border-[color:var(--color-border-subtle)]"
          style={{ background: "var(--color-bg-root-2)" }}
        >
          <div
            className="flex-1 h-6 flex items-stretch rounded-sm border border-[color:var(--color-border-subtle)] focus-within:border-[color:var(--color-accent)]"
            style={{ background: "var(--color-bg-panel)", transition: "border-color 0.15s" }}
          >
            <input
              value={hostFilter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder="Filter hosts..."
              className="flex-1 min-w-0 bg-transparent font-mono text-[11px] px-2 outline-none placeholder-[color:var(--color-text-ghost)] text-[color:var(--color-text-primary)]"
            />
          </div>
          {FILTER_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => onFilterModeChange(mode as FilterMode)}
              className="h-6 px-2 rounded-sm font-mono text-[9.5px] font-bold tracking-[0.1em] uppercase border transition-colors"
              style={{
                background: filterMode === mode ? "var(--color-bg-hover)" : "var(--color-bg-panel)",
                borderColor: filterMode === mode ? "var(--color-accent)" : "var(--color-border-subtle)",
                color: filterMode === mode ? "var(--color-accent-hover)" : "var(--color-text-ghost)",
                cursor: "pointer",
              }}
            >
              {mode === "secrets" ? "🔑" : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Column headers */}
        <div
          className="grid shrink-0 px-3 py-1 border-b border-[color:var(--color-border-subtle)]"
          style={{ gridTemplateColumns: "1fr 32px 80px 32px 28px", background: "var(--color-bg-root-2)" }}
        >
          {["HOST", "ST", "PORTS", "SEC", "Q"].map((h) => (
            <span
              key={h}
              className="font-mono text-[9.5px] font-bold tracking-[0.12em] uppercase"
              style={{ color: "var(--color-accent)" }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Host rows */}
        <div className="rw-scroll flex-1 overflow-y-auto">
          {filteredHosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: "var(--color-text-ghost)" }}>
              <span style={{ fontSize: 22, opacity: 0.3 }}>◎</span>
              <span className="font-mono text-[11px]">
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
                  className="grid items-center px-3 py-1.5 border-b border-[color:var(--color-border-subtle)] cursor-pointer transition-colors"
                  style={{
                    gridTemplateColumns: "1fr 32px 80px 32px 28px",
                    background: isSelected ? "var(--color-bg-hover)" : "transparent",
                    borderLeft: `2px solid ${isSelected ? PRIORITY_STYLE[priority].borderLeft : "transparent"}`,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--color-bg-panel)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span
                    className="font-mono text-[11px] overflow-hidden text-ellipsis whitespace-nowrap pr-1"
                    style={{ color: isSelected ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
                  >
                    {h.host}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      color: isAlive ? "var(--color-status-success)" : "var(--color-status-critical)",
                    }}
                  >
                    ●
                  </span>
                  <span
                    className="font-mono text-[10px] overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {h.ports.length > 0 ? h.ports.slice(0, 3).join(",") + (h.ports.length > 3 ? "…" : "") : "—"}
                  </span>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: h.jsSecrets.length > 0 ? "var(--color-status-warning)" : "var(--color-text-ghost)" }}
                  >
                    {h.jsSecrets.length > 0 ? h.jsSecrets.length : "—"}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleQueue(h.host);
                    }}
                    title={isQueued ? "Remove from queue" : "Add to queue"}
                    className="font-mono text-[11px] cursor-pointer select-none transition-colors"
                    style={{ color: isQueued ? "var(--color-accent)" : "var(--color-text-ghost)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--color-accent)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = isQueued ? "var(--color-accent)" : "var(--color-text-ghost)")}
                  >
                    {isQueued ? "✓" : "+"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Event feed */}
      <div
        className="flex flex-col overflow-hidden shrink-0"
        style={{ height: 160, minHeight: 160 }}
      >
        <div
          className="px-2 py-1.5 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center gap-1.5"
          style={{ background: "var(--color-bg-root-2)" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "var(--color-accent)" }}
          />
          <span className="font-mono text-[9.5px] font-bold tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
            Latest Events
          </span>
        </div>
        <div className="rw-scroll flex-1 overflow-y-auto" style={{ background: "var(--color-bg-root)" }}>
          {eventFeed.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[10px] italic text-[color:var(--color-text-ghost)]">
              Events stream here during scan…
            </div>
          ) : (
            eventFeed.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 px-3 py-0.5 border-b"
                style={{ borderColor: "var(--color-bg-panel)" }}
              >
                <span className="font-mono text-[9.5px] text-[color:var(--color-text-ghost)] whitespace-nowrap pt-px">
                  {item.time}
                </span>
                <span
                  className="font-mono text-[10px] overflow-hidden text-ellipsis whitespace-nowrap flex-1"
                  style={{ color: FEED_COLORS[item.type] }}
                >
                  {item.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
