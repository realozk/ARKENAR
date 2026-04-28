import { useState, useMemo } from "react";
import type { ScanFindingEvent } from "../../types";
import {
  CopyIcon,
  DownloadIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  BoltIcon,
} from "../icons";

/* ── helpers ──────────────────────────────────────────────────────────── */

const CRITICAL_PATTERNS = [
  "sqli", "sql injection", "rce", "exec", "command injection",
  "lfi", "path traversal", "ssrf", "xxe", "remote code",
];

function isCriticalVuln(vulnType: string): boolean {
  const v = vulnType.toLowerCase();
  return CRITICAL_PATTERNS.some((p) => v.includes(p));
}

/* ── Severity badge ───────────────────────────────────────────────────── */
function SeverityBadge({ critical }: { critical: boolean }) {
  return (
    <span
      className={`font-mono uppercase px-2 py-0.5 rounded-sm shrink-0 border ${
        critical
          ? "bg-[color:var(--color-status-critical)]/10 text-[color:var(--color-status-critical)] border-[color:var(--color-status-critical)]/30"
          : "bg-[color:var(--color-status-warning)]/10 text-[color:var(--color-status-warning)] border-[color:var(--color-status-warning)]/30"
      }`}
      style={{ fontSize: 'var(--fs-label)', letterSpacing: '0.1em', fontWeight: 700 }}
    >
      {critical ? "Critical" : "Medium"}
    </span>
  );
}

/* ── Filter pill ─────────────────────── */
function Pill({
  active,
  critical,
  onClick,
  children,
}: {
  active: boolean;
  critical?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono uppercase px-2.5 h-6 cursor-pointer transition-colors duration-150 border focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2 ${
        active
          ? critical
            ? "border-[color:var(--color-status-critical)]/50 bg-[color:var(--color-status-critical)]/10 text-[color:var(--color-status-critical)]"
            : "border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent-hover)]"
          : "border-[color:var(--color-border-subtle)] bg-transparent text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-hover)]"
      }`}
      style={{ fontSize: 'var(--fs-label)', letterSpacing: 'var(--tr-label)', fontWeight: 700 }}
    >
      {children}
    </button>
  );
}

/* ── Icon action button ────────────────────────────────────────────────── */
function IconBtn({ onClick, title, children }: { onClick: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center p-1 rounded-sm
        text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)]
        hover:bg-[color:var(--color-bg-hover)] transition-colors duration-150
        focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-1"
    >
      {children}
    </button>
  );
}

/* ── Expanded field ───────────────────────────────────────────────────── */
function ExpandField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="font-mono uppercase text-[color:var(--color-text-ghost)] mb-1"
        style={{ fontSize: 'var(--fs-label)', letterSpacing: 'var(--tr-label)', fontWeight: 700 }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/* ── FindingCard ──────────────────────────────────────────────────────── */
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
      onClick={() => setExpanded((v) => !v)}
      className={`rounded-sm mb-1.5 overflow-hidden cursor-pointer transition-colors duration-150 border ${
        expanded
          ? critical
            ? "border-[color:var(--color-status-critical)]/40 bg-[color:var(--color-bg-hover)]"
            : "border-[color:var(--color-accent)]/30 bg-[color:var(--color-bg-hover)]"
          : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-hover)]"
      }`}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="font-mono text-[color:var(--color-text-ghost)] min-w-[24px]"
          style={{ fontSize: 'var(--fs-label)' }}
        >
          #{index + 1}
        </span>
        <span
          className="font-mono font-bold text-[color:var(--color-text-primary)] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontSize: 'var(--fs-code)' }}
        >
          {finding.vuln_type}
        </span>
        <span
          className="font-mono text-[color:var(--color-text-muted)] overflow-hidden text-ellipsis whitespace-nowrap max-w-[220px]"
          style={{ fontSize: 'var(--fs-code)' }}
        >
          {finding.url}
        </span>
        <SeverityBadge critical={critical} />
        <IconBtn onClick={handleCopy} title="Copy curl">
          <CopyIcon size={12} className={copied ? "text-[color:var(--color-status-success)]" : undefined} />
        </IconBtn>
        <IconBtn
          onClick={(e) => { e.stopPropagation(); onSendToStudio(finding); }}
          title="Send to Studio"
        >
          <BoltIcon size={12} />
        </IconBtn>
        {expanded ? <ChevronUpIcon size={12} className="text-[color:var(--color-text-ghost)] shrink-0" /> : <ChevronDownIcon size={12} className="text-[color:var(--color-text-ghost)] shrink-0" />}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div
          className="px-3 py-2.5 flex flex-col gap-2 border-t border-[color:var(--color-border-subtle)]"
          style={{ background: "var(--color-bg-panel)" }}
        >
          <ExpandField label="Target URL">
            <div
              className="font-mono text-[color:var(--color-text-muted)] bg-[color:var(--color-bg-root)] border border-[color:var(--color-border-subtle)] rounded-sm px-2 py-1.5 break-all leading-relaxed"
              style={{ fontSize: 'var(--fs-code)' }}
            >
              {finding.url}
            </div>
          </ExpandField>

          {finding.payload && (
            <ExpandField label="Payload">
              <div
                className="font-mono text-[color:var(--color-text-muted)] bg-[color:var(--color-bg-root)] border border-[color:var(--color-border-subtle)] rounded-sm px-2 py-1.5 break-all leading-relaxed"
                style={{ fontSize: 'var(--fs-code)' }}
              >
                {finding.payload}
              </div>
            </ExpandField>
          )}

          <div className="flex gap-4">
            <ExpandField label="Status">
              <span className="font-mono text-[color:var(--color-text-primary)]" style={{ fontSize: 'var(--fs-code)' }}>{finding.status_code}</span>
            </ExpandField>
            <ExpandField label="Timing">
              <span className="font-mono text-[color:var(--color-text-primary)]" style={{ fontSize: 'var(--fs-code)' }}>{finding.timing_ms}ms</span>
            </ExpandField>
            {finding.server && (
              <ExpandField label="Server">
                <span className="font-mono text-[color:var(--color-text-primary)]" style={{ fontSize: 'var(--fs-code)' }}>{finding.server}</span>
              </ExpandField>
            )}
          </div>

          <ExpandField label="Reproduce (cURL)">
            <div
              className="font-mono text-[color:var(--color-text-muted)] bg-[color:var(--color-bg-root)] border border-[color:var(--color-border-subtle)] rounded-sm px-2 py-1.5 break-all leading-relaxed select-text"
              style={{ fontSize: 'var(--fs-code)' }}
            >
              {finding.curl_cmd}
            </div>
          </ExpandField>

          {finding.tech_stack?.length > 0 && (
            <ExpandField label="Tech Stack">
              <div className="flex flex-wrap gap-1 mt-0.5">
                {finding.tech_stack.map((t) => (
                  <span
                    key={t}
                    className="font-mono uppercase px-1.5 py-0.5 rounded-sm border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent-hover)]"
                    style={{ fontSize: 'var(--fs-label)', letterSpacing: '0.1em', fontWeight: 700 }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </ExpandField>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */

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
      result = result.filter(
        (f) =>
          f.url.toLowerCase().includes(q) ||
          f.vuln_type.toLowerCase().includes(q) ||
          f.payload?.toLowerCase().includes(q)
      );
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
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--color-bg-panel)" }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--color-border-subtle)] shrink-0"
      >
        {/* Search */}
        <div
          className="flex items-center gap-1.5 flex-1 min-w-0 h-6 px-2 rounded-sm
            border border-[color:var(--color-border-subtle)] focus-within:border-[color:var(--color-accent)]
            transition-colors duration-150"
          style={{ background: "var(--color-bg-root)" }}
        >
          <SearchIcon size={11} className="text-[color:var(--color-text-ghost)] shrink-0" />
          <input
            type="text"
            placeholder="Search findings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent font-mono
              text-[color:var(--color-text-primary)] placeholder-[color:var(--color-text-ghost)]
              outline-none"
            style={{ fontSize: 'var(--fs-code)' }}
          />
        </div>
        <Pill active={severity === "all"} onClick={() => setSeverity("all")}>
          All ({findings.length})
        </Pill>
        <Pill active={severity === "critical"} critical onClick={() => setSeverity("critical")}>
          Crit ({critCount})
        </Pill>
        <Pill active={severity === "medium"} onClick={() => setSeverity("medium")}>
          Med ({medCount})
        </Pill>

        {/* Sort select */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="font-mono uppercase px-1.5 py-0.5 rounded-sm
            cursor-pointer outline-none transition-colors duration-150"
          style={{
            fontSize: 'var(--fs-label)',
            letterSpacing: '0.1em',
            background: "var(--color-bg-root)",
            border: "1px solid var(--color-border-subtle)",
            color: "var(--color-text-muted)",
          }}
        >
          <option value="newest">Newest</option>
          <option value="severity">Severity</option>
          <option value="url">URL A→Z</option>
        </select>
        {findings.length > 0 && (
          <button
            onClick={handleExport}
            className="h-6 px-2 flex items-center gap-1 rounded-sm font-mono uppercase
              border border-[color:var(--color-border-subtle)]
              text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)]
              hover:border-[color:var(--color-border-hover)] transition-colors duration-150
              focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
            style={{ fontSize: 'var(--fs-label)', letterSpacing: 'var(--tr-label)' }}
          >
            <DownloadIcon size={10} />
            Export
          </button>
        )}
      </div>

      {/* Content */}
      {processed.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-3
            font-mono text-[color:var(--color-text-ghost)]"
          style={{ fontSize: 'var(--fs-code)' }}
        >
          <ExternalLinkIcon size={24} className="opacity-20" />
          <span>
            {findings.length === 0
              ? "No findings yet — launch a scan."
              : "No matches for current filter."}
          </span>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto p-2"
          style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-border-hover) transparent" } as React.CSSProperties}
        >
          {processed.map((f) => (
            <FindingCard key={f._idx} finding={f} index={f._idx} onSendToStudio={onSendToStudio} />
          ))}
        </div>
      )}
    </div>
  );
}
