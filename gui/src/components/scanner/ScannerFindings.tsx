import { useState, useMemo } from "react";
import { Copy, ExternalLink, Download, Search, ChevronDown, ChevronUp, Zap } from "lucide-react";
import type { ScanFindingEvent } from "../../types";

const CRITICAL_PATTERNS = ["sqli", "sql injection", "rce", "exec", "command injection", "lfi", "path traversal", "ssrf", "xxe", "remote code"];

function isCriticalVuln(vulnType: string): boolean {
  const v = vulnType.toLowerCase();
  return CRITICAL_PATTERNS.some((p) => v.includes(p));
}

function getSeverityStyle(isCritical: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    padding: "2px 8px",
    borderRadius: 3,
    background: isCritical ? "rgba(255,68,68,0.15)" : "rgba(255,152,0,0.15)",
    color: isCritical ? "#ff4444" : "#ff9800",
    border: `1px solid ${isCritical ? "rgba(255,68,68,0.3)" : "rgba(255,152,0,0.3)"}`,
    whiteSpace: "nowrap" as const,
  };
}

const S: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#111111",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderBottom: "1px solid #2a2a2a",
    flexShrink: 0,
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#0d0d0d",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: "4px 8px",
    flex: 1,
  },
  searchInput: {
    background: "transparent",
    border: "none",
    outline: "none",
    fontSize: 11,
    fontFamily: "monospace",
    color: "#e0e0e0",
    flex: 1,
    minWidth: 0,
  },
  btnSecondary: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: "4px 10px",
    fontSize: 10,
    color: "#aaaaaa",
    cursor: "pointer",
    fontFamily: "monospace",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    whiteSpace: "nowrap" as const,
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 10px",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#444444",
    fontFamily: "monospace",
    fontSize: 12,
    gap: 8,
  },
  card: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    marginBottom: 6,
    overflow: "hidden",
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
  },
  cardNum: {
    fontSize: 10,
    color: "#444444",
    fontFamily: "monospace",
    minWidth: 24,
  },
  cardType: {
    fontSize: 12,
    fontWeight: 700,
    color: "#e0e0e0",
    fontFamily: "monospace",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  cardUrl: {
    fontSize: 11,
    color: "#aaaaaa",
    fontFamily: "monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    maxWidth: 260,
  },
  expandBody: {
    borderTop: "1px solid #2a2a2a",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "#666666",
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "#e0e0e0",
    wordBreak: "break-all" as const,
    lineHeight: 1.5,
  },
  codeBlock: {
    background: "#0d0d0d",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 11,
    fontFamily: "monospace",
    color: "#aaaaaa",
    wordBreak: "break-all" as const,
    lineHeight: 1.5,
    userSelect: "text" as const,
  },
  iconBtn: {
    display: "flex",
    alignItems: "center",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#666666",
    padding: "3px 5px",
    borderRadius: 3,
    transition: "color 0.15s",
  },
};

function pillStyle(active: boolean, crit?: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    padding: "3px 10px",
    borderRadius: 12,
    border: active
      ? (crit ? "1px solid rgba(255,68,68,0.5)" : "1px solid rgba(255,107,53,0.5)")
      : "1px solid #2a2a2a",
    background: active
      ? (crit ? "rgba(255,68,68,0.15)" : "rgba(255,107,53,0.15)")
      : "#1a1a1a",
    color: active ? (crit ? "#ff4444" : "#ff6b35") : "#666666",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

interface FindingCardProps {
  finding: ScanFindingEvent;
  index: number;
  onSendToStudio: (f: ScanFindingEvent) => void;
}

function FindingCard({ finding, index, onSendToStudio }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const critical = isCriticalVuln(finding.vuln_type);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(finding.curl_cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      style={{
        ...S.card,
        borderColor: expanded ? (critical ? "rgba(255,68,68,0.4)" : "rgba(255,107,53,0.3)") : "#2a2a2a",
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div style={S.cardHeader}>
        <span style={S.cardNum}>#{index + 1}</span>
        <span style={S.cardType}>{finding.vuln_type}</span>
        <span style={S.cardUrl}>{finding.url}</span>
        <span style={getSeverityStyle(critical)}>{critical ? "Critical" : "Medium"}</span>
        <button style={S.iconBtn} onClick={handleCopy} title="Copy curl">
          <Copy size={13} color={copied ? "#4caf50" : "#666"} />
        </button>
        <button
          style={S.iconBtn}
          onClick={(e) => { e.stopPropagation(); onSendToStudio(finding); }}
          title="Send to Studio"
        >
          <Zap size={13} />
        </button>
        {expanded ? <ChevronUp size={13} color="#666" /> : <ChevronDown size={13} color="#666" />}
      </div>

      {expanded && (
        <div style={S.expandBody}>
          <div>
            <div style={S.fieldLabel}>Target URL</div>
            <div style={S.codeBlock}>{finding.url}</div>
          </div>
          {finding.payload && (
            <div>
              <div style={S.fieldLabel}>Payload</div>
              <div style={S.codeBlock}>{finding.payload}</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 16 }}>
            <div>
              <div style={S.fieldLabel}>Status</div>
              <div style={S.fieldValue}>{finding.status_code}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Timing</div>
              <div style={S.fieldValue}>{finding.timing_ms}ms</div>
            </div>
            {finding.server && (
              <div>
                <div style={S.fieldLabel}>Server</div>
                <div style={S.fieldValue}>{finding.server}</div>
              </div>
            )}
          </div>
          <div>
            <div style={S.fieldLabel}>Reproduce (cURL)</div>
            <div style={S.codeBlock}>{finding.curl_cmd}</div>
          </div>
          {finding.tech_stack?.length > 0 && (
            <div>
              <div style={S.fieldLabel}>Tech Stack</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                {finding.tech_stack.map((t) => (
                  <span key={t} style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "1px 7px",
                    borderRadius: 3, background: "rgba(255,107,53,0.15)", color: "#ff6b35",
                    border: "1px solid rgba(255,107,53,0.3)", textTransform: "uppercase" as const,
                  }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type SeverityFilter = "all" | "critical" | "medium";
type SortMode = "newest" | "severity" | "url";

interface ScannerFindingsProps {
  findings: ScanFindingEvent[];
  onSendToStudio: (f: ScanFindingEvent) => void;
}

export default function ScannerFindings({ findings, onSendToStudio }: ScannerFindingsProps) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");

  const processed = useMemo(() => {
    let result = findings.map((f, i) => ({ ...f, _idx: i, _crit: isCriticalVuln(f.vuln_type) }));
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((f) => f.url.toLowerCase().includes(q) || f.vuln_type.toLowerCase().includes(q) || f.payload?.toLowerCase().includes(q));
    }
    if (severity === "critical") result = result.filter((f) => f._crit);
    if (severity === "medium") result = result.filter((f) => !f._crit);
    if (sort === "severity") result.sort((a, b) => (a._crit === b._crit ? 0 : a._crit ? -1 : 1));
    else if (sort === "url") result.sort((a, b) => a.url.localeCompare(b.url));
    else result.sort((a, b) => b._idx - a._idx);
    return result;
  }, [findings, query, severity, sort]);

  const critCount = useMemo(() => findings.filter((f) => isCriticalVuln(f.vuln_type)).length, [findings]);
  const medCount = findings.length - critCount;

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(findings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "arkenar-findings.json"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.root}>
      <div style={S.toolbar}>
        <div style={S.searchWrap}>
          <Search size={12} color="#666" />
          <input
            style={S.searchInput}
            type="text"
            placeholder="Search findings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <button style={pillStyle(severity === "all")} onClick={() => setSeverity("all")}>
          All ({findings.length})
        </button>
        <button style={pillStyle(severity === "critical", true)} onClick={() => setSeverity("critical")}>
          Crit ({critCount})
        </button>
        <button style={pillStyle(severity === "medium")} onClick={() => setSeverity("medium")}>
          Med ({medCount})
        </button>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          style={{
            background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4,
            color: "#aaaaaa", fontSize: 10, fontFamily: "monospace", padding: "4px 6px",
            cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: 1,
          }}
        >
          <option value="newest">Newest</option>
          <option value="severity">Severity</option>
          <option value="url">URL A→Z</option>
        </select>

        {findings.length > 0 && (
          <button style={S.btnSecondary} onClick={handleExport}>
            <Download size={11} /> Export
          </button>
        )}
      </div>

      {processed.length === 0 ? (
        <div style={S.empty}>
          <ExternalLink size={28} color="#333" />
          <span>{findings.length === 0 ? "No findings yet — launch a scan." : "No matches for current filter."}</span>
        </div>
      ) : (
        <div style={{ ...S.list, scrollbarWidth: "thin", scrollbarColor: "#333 #0d0d0d" } as React.CSSProperties}>
          {processed.map((f) => (
            <FindingCard key={f._idx} finding={f} index={f._idx} onSendToStudio={onSendToStudio} />
          ))}
        </div>
      )}
    </div>
  );
}
