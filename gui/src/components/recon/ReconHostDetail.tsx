import { ReconHost } from "../../types";
import { PlusIcon, ArrowRightIcon, CopyIcon, CloseIcon } from "../icons";

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

const PRIORITY_STYLE: Record<string, { borderColor: string; bg: string; textColor: string; label: string }> = {
  high: {
    borderColor: "var(--color-status-critical)",
    bg: "var(--color-status-critical-bg, color-mix(in srgb, var(--color-status-critical) 8%, transparent))",
    textColor: "var(--color-status-critical)",
    label: "HIGH VALUE",
  },
  medium: {
    borderColor: "var(--color-status-warning)",
    bg: "var(--color-status-warning-bg, color-mix(in srgb, var(--color-status-warning) 8%, transparent))",
    textColor: "var(--color-status-warning)",
    label: "MEDIUM",
  },
  standard: {
    borderColor: "var(--color-border-hover)",
    bg: "var(--color-bg-hover)",
    textColor: "var(--color-text-ghost)",
    label: "STANDARD",
  },
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
      <div className="rw-scroll flex-1 overflow-y-auto p-3 flex flex-col h-full" style={{ background: "var(--color-bg-panel)" }}>
        {/* Empty state */}
        <div
          className="flex-1 flex flex-col items-center justify-center gap-2"
          style={{ color: "var(--color-text-ghost)" }}
        >
          <span style={{ fontSize: 28, opacity: 0.3 }}>◎</span>
          <span className="font-mono text-[11px] text-center" style={{ lineHeight: 1.6 }}>
            Select a host<br />to view intel
          </span>
        </div>

        {/* Aggregate stats */}
        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--color-accent)" }}
            />
            <span className="font-mono text-[9.5px] font-bold tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
              Aggregate Stats
            </span>
          </div>
          <div className="rounded-sm border border-[color:var(--color-border-subtle)] overflow-hidden">
            {[
              { label: "total ports", val: totalPorts },
              { label: "DNS records", val: totalDns },
              { label: "JS secrets", val: totalSecrets },
            ].map(({ label, val }, i, arr) => (
              <div
                key={label}
                className="flex justify-between items-center px-3 py-1.5"
                style={{
                  borderBottom: i < arr.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                  background: "var(--color-bg-root)",
                }}
              >
                <span className="font-mono text-[10.5px] text-[color:var(--color-text-muted)]">{label}</span>
                <span
                  className="font-mono text-[11px] font-bold"
                  style={{ color: val > 0 ? "var(--color-text-primary)" : "var(--color-text-ghost)" }}
                >
                  {val}
                </span>
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

  const actionButtons = [
    {
      label: "+ Queue",
      icon: <PlusIcon size={10} />,
      action: () => onAddToQueue([host.host]),
    },
    {
      label: "→ Studio",
      icon: <ArrowRightIcon size={10} />,
      action: () => onSendToStudio(`https://${host.host}`),
    },
    {
      label: "⎘ Copy",
      icon: <CopyIcon size={10} />,
      action: () => navigator.clipboard.writeText(host.host),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--color-bg-panel)" }}>

      {/* Host header */}
      <div
        className="px-3 pt-2 pb-2 shrink-0 border-b border-[color:var(--color-border-subtle)]"
        style={{ background: ps.bg }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="font-mono text-[9px] font-bold tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm border"
            style={{ color: ps.textColor, borderColor: ps.borderColor }}
          >
            {ps.label}
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-muted)] transition-colors"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            style={{ fontSize: 8, color: isAlive ? "var(--color-status-success)" : "var(--color-status-critical)" }}
          >
            ●
          </span>
          <span
            className="font-mono text-[13px] font-bold overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ color: "var(--color-text-primary)" }}
          >
            {host.host}
          </span>
        </div>
        {metaParts.length > 0 && (
          <div className="font-mono text-[10px] mt-1 text-[color:var(--color-text-ghost)]">
            {metaParts.join("  ·  ")}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5 px-2 py-2 shrink-0 border-b border-[color:var(--color-border-subtle)]">
        {actionButtons.map(({ label, icon, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex-1 flex items-center justify-center gap-1 py-1 font-mono text-[10px] font-bold tracking-[0.05em] rounded-sm border border-[color:var(--color-border-subtle)] text-[color:var(--color-text-muted)] transition-colors"
            style={{ background: "var(--color-bg-root)", cursor: "pointer" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
              e.currentTarget.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-subtle)";
              e.currentTarget.style.color = "var(--color-text-muted)";
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-[color:var(--color-border-subtle)]">
        {(["ports", "dns", "secrets"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 relative py-2 font-mono text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border-b-2 ${
              activeTab === tab
                ? "bg-[color:var(--color-accent)]/5 text-[color:var(--color-accent-hover)] border-b-[color:var(--color-accent)]"
                : "bg-transparent text-[color:var(--color-text-ghost)] border-b-transparent"
            }`}
            style={{ border: "none", cursor: "pointer" }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rw-scroll flex-1 overflow-y-auto p-2">
        {activeTab === "ports" && (
          <div className="flex flex-col gap-1">
            {host.ports.length === 0 ? (
              <span className="font-mono text-[11px] italic text-[color:var(--color-text-ghost)]">No open ports</span>
            ) : host.ports.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm border border-[color:var(--color-border-subtle)]"
                style={{ background: "var(--color-bg-root)" }}
              >
                <span className="font-mono text-[12px] font-bold w-10 shrink-0 text-[color:var(--color-text-primary)]">
                  {p}
                </span>
                <span className="font-mono text-[11px] flex-1 text-[color:var(--color-text-muted)]">
                  {PORT_LABELS[p] || "TCP"}
                </span>
                <span className="font-mono text-[10px] text-[color:var(--color-status-success)]">● open</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "dns" && (
          <div className="flex flex-col gap-1.5">
            {!host.dns ? (
              <span className="font-mono text-[11px] italic text-[color:var(--color-text-ghost)]">No DNS records</span>
            ) : (
              <>
                {host.dns.a.length > 0 && host.dns.a.map((ip) => (
                  <div
                    key={ip}
                    className="flex gap-2 items-center px-2 py-1 rounded-sm border border-[color:var(--color-border-subtle)]"
                    style={{ background: "var(--color-bg-root)" }}
                  >
                    <span className="font-mono text-[10px] font-bold w-8 shrink-0 text-[color:var(--color-accent)]">A</span>
                    <span className="font-mono text-[11px] overflow-hidden text-ellipsis whitespace-nowrap text-[color:var(--color-text-primary)]">{ip}</span>
                  </div>
                ))}
                {host.dns.mx.length > 0 && host.dns.mx.map((m) => (
                  <div
                    key={m}
                    className="flex gap-2 items-center px-2 py-1 rounded-sm border border-[color:var(--color-border-subtle)]"
                    style={{ background: "var(--color-bg-root)" }}
                  >
                    <span className="font-mono text-[10px] font-bold w-8 shrink-0 text-[color:var(--color-text-muted)]">MX</span>
                    <span className="font-mono text-[11px] overflow-hidden text-ellipsis whitespace-nowrap text-[color:var(--color-text-primary)]">{m}</span>
                  </div>
                ))}
                {host.dns.txt.length > 0 && host.dns.txt.map((t, i) => (
                  <div
                    key={i}
                    className="flex gap-2 items-start px-2 py-1 rounded-sm border border-[color:var(--color-border-subtle)]"
                    style={{ background: "var(--color-bg-root)" }}
                  >
                    <span className="font-mono text-[10px] font-bold w-8 shrink-0 pt-px text-[color:var(--color-text-muted)]">TXT</span>
                    <span className="font-mono text-[10px] text-[color:var(--color-text-muted)] break-all">{t}</span>
                  </div>
                ))}
                {host.dns.cname && (
                  <div
                    className="flex gap-2 items-center px-2 py-1 rounded-sm border border-[color:var(--color-border-subtle)]"
                    style={{ background: "var(--color-bg-root)" }}
                  >
                    <span className="font-mono text-[10px] font-bold w-8 shrink-0 text-[color:var(--color-status-success)]">CN</span>
                    <span className="font-mono text-[11px] overflow-hidden text-ellipsis whitespace-nowrap text-[color:var(--color-text-primary)]">{host.dns.cname}</span>
                  </div>
                )}
                {host.dns.a.length === 0 && host.dns.mx.length === 0 && host.dns.txt.length === 0 && !host.dns.cname && (
                  <span className="font-mono text-[11px] italic text-[color:var(--color-text-ghost)]">No records found</span>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "secrets" && (
          <div className="flex flex-col gap-1.5">
            {host.jsSecrets.length === 0 ? (
              <span className="font-mono text-[11px] italic text-[color:var(--color-text-ghost)]">No secrets found</span>
            ) : host.jsSecrets.map((s, i) => (
              <div
                key={i}
                className="p-2 rounded-sm border border-[color:var(--color-border-subtle)] flex flex-col gap-1"
                style={{ background: "var(--color-bg-root)" }}
              >
                <div className="flex justify-between items-center">
                  <span
                    className="font-mono text-[9px] font-bold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-sm border border-[color:var(--color-status-warning)] bg-[color:var(--color-status-warning)]/10 text-[color:var(--color-status-warning)]"
                  >
                    {s.secret_type}
                  </span>
                  <span className="font-mono text-[9.5px] text-[color:var(--color-text-ghost)]">L:{s.line_number}</span>
                </div>
                <span className="font-mono text-[10px] text-[color:var(--color-text-muted)] break-all">
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
