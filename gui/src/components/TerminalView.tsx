import React, { useRef, useEffect, useState, useMemo, useCallback, memo } from "react";
import {
  FlaskConical, Bug, Shield,
  AlertTriangle, ChevronDown, Copy, Check, Trash2,
  Search, ArrowUpDown, Clock, Download, ExternalLink, AlertOctagon, X,
  Clipboard, ArrowDownToLine, ArrowUpToLine, RotateCcw, Terminal as TerminalIcon, Zap
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { LogEntry, ScanFindingEvent, ScanHistoryEntry, ScanStatus } from "../types";
import { ThinProgressBar } from "./TopStats";
import { CustomDropdown } from "./primitives";
import { t } from "../utils/i18n";
import StudioPanel, { type StudioRequest, type StudioHistoryItem } from "./StudioPanel";

/** Detect suspicious shell metacharacters in curl commands */
const SHELL_META = /[;&|`$(){}]/;
const CRITICAL_PATTERNS = ["sqli", "sql", "rce", "exec", "command injection", "lfi", "path traversal", "ssrf", "xxe", "remote code"];

interface VulnInfo { description: string; impact: string; remediation: string; }

function getVulnInfo(vulnType: string): VulnInfo {
  const v = vulnType.toLowerCase();
  if (v.includes("sqli") || v.includes("sql injection")) return { description: "SQL Injection allows an attacker to manipulate database queries by injecting untrusted input into SQL statements.", impact: "Sensitive data theft, authentication bypass, data deletion or modification, and in some cases remote command execution.", remediation: "Use prepared statements and parameterized queries. Validate and sanitize all user input server-side." };
  if (v.includes("xss") || v.includes("cross-site scripting")) return { description: "Cross-Site Scripting (XSS) allows an attacker to inject malicious scripts into web pages viewed by other users.", impact: "Session and cookie theft, user impersonation, page defacement, and redirection to malicious sites.", remediation: "Apply output encoding (HTML encoding) and implement Content Security Policy (CSP). Validate and sanitize all input." };
  if (v.includes("lfi") || v.includes("local file inclusion")) return { description: "Local File Inclusion (LFI) allows an attacker to include files from the server itself in the application response.", impact: "Reading sensitive files like /etc/passwd, source code disclosure, and potentially leading to remote code execution.", remediation: "Validate and filter file paths. Avoid user-controlled file paths and use an allowlist of permitted files." };
  if (v.includes("rfi") || v.includes("remote file inclusion")) return { description: "Remote File Inclusion (RFI) allows an attacker to load and execute files from an external server.", impact: "Arbitrary code execution on the server, full system compromise, and malware deployment.", remediation: "Disable allow_url_include in PHP. Validate all file paths and use an allowlist of permitted resources." };
  if (v.includes("ssrf") || v.includes("server-side request forgery")) return { description: "Server-Side Request Forgery (SSRF) forces the server to make HTTP requests to internal or external resources controlled by the attacker.", impact: "Access to protected internal services, cloud metadata exfiltration, and lateral movement within the network.", remediation: "Validate and sanitize all user-supplied URLs. Use an allowlist of permitted domains and block internal IP ranges." };
  if (v.includes("rce") || v.includes("remote code execution") || v.includes("command injection")) return { description: "Remote Code Execution (RCE) allows an attacker to run arbitrary commands directly on the server.", impact: "Full server compromise, data theft, ransomware deployment, and complete system takeover.", remediation: "Never pass user input directly to system commands. Use safe APIs instead of shell commands and apply least-privilege principles." };
  if (v.includes("open redirect") || v.includes("redirect")) return { description: "Open Redirect allows an attacker to redirect users to arbitrary external websites.", impact: "Phishing attacks, credential theft, and reputational damage to the affected site.", remediation: "Validate redirect URLs against an allowlist of permitted destinations. Avoid user-controlled redirect parameters." };
  if (v.includes("idor") || v.includes("insecure direct object")) return { description: "IDOR (Insecure Direct Object Reference) allows an attacker to access other users' resources by manipulating object identifiers.", impact: "Unauthorized access to sensitive data, modification or deletion of other users' data.", remediation: "Enforce object-level authorization checks. Use unpredictable identifiers (UUIDs) and always verify resource ownership." };
  if (v.includes("path traversal") || v.includes("directory traversal")) return { description: "Path Traversal allows an attacker to access files and directories outside the intended root directory.", impact: "Reading sensitive files from the filesystem, including configuration files, passwords, and private keys.", remediation: "Sanitize file paths by removing '../' sequences. Use realpath() to ensure the path stays within the allowed directory." };
  return { description: "A potential security vulnerability was detected at this endpoint. Manual review of the related code is recommended.", impact: "Impact may vary depending on the nature and location of the vulnerability within the application.", remediation: "Consult the relevant OWASP documentation and apply security best practices to this endpoint." };
}

/* ─── H3: Finding Detail Modal ───────────────────────────────────── */
interface FindingWithMeta extends ScanFindingEvent {
  originalIndex: number;
  severity: "critical" | "medium";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded-md p-1.5 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200"
      title="Copy"
    >
      {copied ? <Check size={14} strokeWidth={2.5} className="text-status-success" /> : <Copy size={14} strokeWidth={2.5} />}
    </button>
  );
}

function FindingDetailModal({ finding, onClose, onSendToStudio }: { finding: FindingWithMeta; onClose: () => void; onSendToStudio: (finding: ScanFindingEvent) => void }) {
  const [closing, setClosing] = useState(false);
  const isCritical = finding.severity === "critical";
  const hasSuspiciousChars = SHELL_META.test(finding.curl_cmd);
  const vulnInfo = getVulnInfo(finding.vuln_type);
  const severityLabel = isCritical ? "Critical" : "Medium";
  const severityClass = isCritical
    ? "text-status-critical bg-status-critical/10 border-status-critical/20"
    : "text-status-warning bg-status-warning/10 border-status-warning/20";

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 280);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm transition-opacity duration-280 ${closing ? "opacity-0" : "opacity-100"}`}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-2xl max-h-[85vh] rounded-2xl border border-border-subtle bg-bg-panel shadow-2xl flex flex-col overflow-hidden transition-all duration-280 ${closing ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center gap-3 px-6 py-4 border-b border-border-subtle shrink-0 bg-bg-panel/80`}>
          <AlertTriangle size={18} className={isCritical ? "text-status-critical" : "text-status-warning"} strokeWidth={2.5} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-text-primary truncate">{finding.vuln_type}</h2>
            <span className="text-xs text-text-ghost">Finding #{finding.originalIndex + 1}</span>
          </div>
          <span className={`text-[11px] font-black uppercase px-3 py-1 rounded-full border ${severityClass}`}>{severityLabel}</span>
          <button onClick={handleClose} className="rounded-lg p-2 text-text-ghost hover:text-text-primary hover:bg-bg-hover transition-all duration-200">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* URL */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Target</p>
            <div className="flex items-center gap-2 rounded-lg bg-bg-root border border-border-subtle px-3 py-2.5">
              <code className="flex-1 text-sm font-mono text-text-primary break-all select-all leading-relaxed" dir="ltr">{finding.url}</code>
              <CopyButton text={finding.url} />
            </div>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-bg-card border border-border-subtle px-4 py-3">
              <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-1">Status</p>
              <p className="font-mono text-sm font-bold text-text-primary" dir="ltr">{finding.status_code}</p>
            </div>
            <div className="rounded-lg bg-bg-card border border-border-subtle px-4 py-3">
              <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-1">Timing</p>
              <p className="font-mono text-sm font-bold text-text-primary" dir="ltr">{finding.timing_ms}ms</p>
            </div>
            {finding.server && (
              <div className="rounded-lg bg-bg-card border border-border-subtle px-4 py-3">
                <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-1">Server</p>
                <p className="font-mono text-sm font-bold text-text-primary truncate" dir="ltr">{finding.server}</p>
              </div>
            )}
          </div>

          {/* Payload */}
          {finding.payload && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Payload</p>
              <div className="flex items-start gap-2 rounded-lg bg-bg-root border border-border-subtle px-3 py-2.5">
                <code className="flex-1 text-[13px] font-mono text-text-secondary break-all select-all leading-relaxed" dir="ltr">{finding.payload}</code>
                <CopyButton text={finding.payload} />
              </div>
            </div>
          )}

          {/* cURL */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Reproduce</p>
              <button
                onClick={() => onSendToStudio(finding)}
                className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-text hover:bg-accent/20 transition-all duration-200"
                title="Send to Studio"
              >
                Send to Studio
              </button>
              {hasSuspiciousChars && (
                <span className="flex items-center gap-1 rounded-full bg-status-warning/15 px-2 py-0.5 text-[10px] font-bold text-status-warning uppercase">
                  <AlertOctagon size={10} strokeWidth={3} />Review before running
                </span>
              )}
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-bg-root border border-border-subtle px-3 py-2.5">
              <code className="flex-1 text-[13px] font-mono text-text-secondary break-all select-all leading-relaxed" dir="ltr">{finding.curl_cmd}</code>
              <CopyButton text={finding.curl_cmd} />
            </div>
          </div>

          {/* Vuln info */}
          <div className={`rounded-xl border p-4 space-y-3 ${isCritical ? "border-status-critical/25 bg-status-critical/5" : "border-status-warning/25 bg-status-warning/5"}`}>
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className={isCritical ? "text-status-critical" : "text-status-warning"} strokeWidth={2.5} />
              <span className={`text-xs font-bold ${isCritical ? "text-status-critical" : "text-status-warning"}`}>Vulnerability Info</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Description</p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{vulnInfo.description}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Impact</p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{vulnInfo.impact}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Remediation</p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{vulnInfo.remediation}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── FindingCard ────────────────────────────────────────────────── */
function FindingCardInner({ finding, index, onOpenDetail, onSendToStudio }: {
  finding: ScanFindingEvent;
  index: number;
  onOpenDetail: () => void;
  onSendToStudio: (finding: ScanFindingEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const vulnLower = finding.vuln_type.toLowerCase();
  const isCritical = CRITICAL_PATTERNS.some(p => vulnLower.includes(p));
  const severityClass = isCritical ? "text-status-critical bg-status-critical/10" : "text-status-warning bg-status-warning/10";
  const hasSuspiciousChars = SHELL_META.test(finding.curl_cmd);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(finding.curl_cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="finding-card animate-fade-slide-in rounded-xl border border-border-subtle bg-bg-card cursor-pointer"
      onClick={() => {
        if (window.getSelection()?.toString()) return;
        setExpanded(!expanded);
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="font-mono text-xs text-text-ghost select-none w-6 shrink-0">#{index + 1}</span>
        <AlertTriangle size={17} className={isCritical ? "text-status-critical" : "text-status-warning"} strokeWidth={2.5} />
        <span className="text-sm font-semibold text-text-primary truncate flex-1 text-start">{finding.vuln_type}</span>
        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${severityClass}`}>
          {isCritical ? "Critical" : "Medium"}
        </span>
        {/* F2: Copy cURL to clipboard */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCopy(e); }}
          title="Copy curl command"
          className="rounded-lg p-1.5 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200 hover:scale-110"
        >
          {copied ? <Check size={14} strokeWidth={2.5} className="text-status-success" /> : <TerminalIcon size={14} strokeWidth={2.5} />}
        </button>
        {/* Open detail modal button */}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
          title="View full details"
          className="rounded-lg p-1.5 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200 hover:scale-110"
        >
          <ExternalLink size={14} strokeWidth={2.5} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSendToStudio(finding); }}
          title="Send to Studio"
          className="rounded-lg p-1.5 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200 hover:scale-110"
        >
          <Zap size={14} strokeWidth={2.5} />
        </button>
        <ChevronDown size={16} className={`text-text-ghost transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} />
      </div>

      {expanded && (
        <div className="animate-fade-slide-in px-5 pb-4 pt-0 border-t border-border-subtle space-y-3">
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs pt-3">
            <div className="text-start">
              <span className="text-text-muted">Target</span>
              <p className="text-text-secondary font-mono text-[13px] truncate mt-0.5 text-left" dir="ltr">{finding.url}</p>
            </div>
            <div className="text-start">
              <span className="text-text-muted">Payload</span>
              <p className="text-text-secondary font-mono text-[13px] truncate mt-0.5 text-left" dir="ltr">{finding.payload || "—"}</p>
            </div>
            <div className="text-start">
              <span className="text-text-muted">Status</span>
              <p className="text-text-secondary font-mono mt-0.5 text-left" dir="ltr">{finding.status_code}</p>
            </div>
            <div className="text-start">
              <span className="text-text-muted">Timing</span>
              <p className="text-text-secondary font-mono mt-0.5 text-left" dir="ltr">{finding.timing_ms}ms</p>
            </div>
            {finding.server && (
              <div className="text-start">
                <span className="text-text-muted">Server</span>
                <p className="text-text-secondary font-mono mt-0.5 text-left" dir="ltr">{finding.server}</p>
              </div>
            )}
          </div>
          <div className="text-start">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs text-text-muted">Reproduce</p>
              {hasSuspiciousChars && (
                <span className="flex items-center gap-1 rounded-full bg-status-warning/15 px-2 py-0.5 text-[10px] font-bold text-status-warning uppercase">
                  <AlertOctagon size={10} strokeWidth={3} />Review before running
                </span>
              )}
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-bg-root border border-border-subtle p-3">
              <code className="flex-1 text-[13px] font-mono text-text-secondary break-all leading-relaxed select-all text-left" dir="ltr">{finding.curl_cmd}</code>
              <button onClick={handleCopy} className="shrink-0 rounded-md p-2 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200 hover:scale-110 active:scale-90" title="Copy curl command">
                {copied ? <Check size={16} strokeWidth={2.5} className="text-status-success" /> : <Copy size={16} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const FindingCard = memo(FindingCardInner);

/* ─── T1: Log line with copy-on-hover ───────────────────────────── */
const ROW_HEIGHT = 28;
const VIRT_BUFFER = 6;

function LogLine({ log, absIdx, showTimestamps }: { log: LogEntry; absIdx: number; showTimestamps: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={`terminal-line ${log.level} group relative`}
      style={{ position: "absolute", top: absIdx * ROW_HEIGHT, left: 0, right: 0, "--i": absIdx % 50 } as React.CSSProperties}
    >
      {showTimestamps && <span className="text-text-ghost select-none mr-3">{log.time}</span>}
      <span className="font-bold mr-2 opacity-80">[{log.level === "error" ? "CRITICAL" : log.level.toUpperCase()}]</span>
      <span>{log.message}</span>
      <button
        onClick={async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(log.message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded text-text-ghost hover:text-accent-text transition-all duration-150"
        title="Copy line"
      >
        {copied ? <Check size={11} strokeWidth={2.5} className="text-status-success" /> : <Clipboard size={11} strokeWidth={2.5} />}
      </button>
    </div>
  );
}

/* ─── TerminalView ───────────────────────────────────────────────── */

interface TerminalViewProps {
  logs: LogEntry[];
  findings: ScanFindingEvent[];
  activeTab: "terminal" | "findings" | "history" | "studio";
  onTabChange: (tab: "terminal" | "findings" | "history" | "studio") => void;
  onRequestClear: () => void;
  scanHistory: ScanHistoryEntry[];
  onLoadFromHistory?: (target: string) => void;
  scanProgress?: number;
  scanStatus?: ScanStatus;
  onQuickRescan?: (target: string) => void;
  onSendToStudio?: (finding: ScanFindingEvent) => void;
  initialStudioRequest?: Partial<StudioRequest> | null;
  onInitialRequestConsumed?: () => void;
  studioHistory: StudioHistoryItem[];
  setStudioHistory: React.Dispatch<React.SetStateAction<StudioHistoryItem[]>>;
  selectedStudioHistoryId: string | null;
  setSelectedStudioHistoryId: (id: string | null) => void;
  onSendToBasic?: (url: string, headers: string) => void;
}

export function TerminalView({ logs, findings, activeTab, onTabChange,
  onRequestClear, scanHistory, onLoadFromHistory,
  scanProgress = 0, scanStatus = "idle", onQuickRescan,
  onSendToStudio, initialStudioRequest, onInitialRequestConsumed,
  studioHistory, setStudioHistory, selectedStudioHistoryId,
  setSelectedStudioHistoryId, onSendToBasic, }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termSearchRef = useRef<HTMLInputElement>(null);
  const findingsSearchRef = useRef<HTMLInputElement>(null);
  const historySearchRef = useRef<HTMLInputElement>(null);
  const prevFindingsLenRef = useRef(findings.length);

  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "medium">("all");
  const [sortBy, setSortBy] = useState<"newest" | "severity" | "url">("newest");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySortBy, setHistorySortBy] = useState<"newest" | "oldest" | "targets" | "findings">("newest");
  const [termSearchQuery, setTermSearchQuery] = useState("");
  const [isLogCopied, setIsLogCopied] = useState(false);
  const [detailFinding, setDetailFinding] = useState<FindingWithMeta | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  // T2: auto-scroll toggle
  const [autoScroll, setAutoScroll] = useState(true);
  // T3: timestamp toggle
  const [showTimestamps, setShowTimestamps] = useState(true);
  // T4: log level filter
  const [logFilter, setLogFilter] = useState("all");
  // F4: new findings badge
  const [newFindingsBadge, setNewFindingsBadge] = useState(0);

  const handleCopyLogs = useCallback(async () => {
    if (logs.length === 0) return;
    const text = logs.map(l => `[${l.time}] ${l.message}`).join("\n");
    try { await navigator.clipboard.writeText(text); setIsLogCopied(true); setTimeout(() => setIsLogCopied(false), 2000); } catch { /* ignore */ }
  }, [logs]);

  // T2: Auto-scroll
  useEffect(() => {
    if (activeTab === "terminal" && autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, activeTab, autoScroll]);

  // Track viewport height for virtual scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    setAutoScroll(isAtBottom);
    setScrollTop(target.scrollTop);
  }, []);

  const processedFindings = useMemo(() => {
    let result: FindingWithMeta[] = findings.map((f, i) => {
      const isCrit = CRITICAL_PATTERNS.some(p => f.vuln_type.toLowerCase().includes(p));
      return { ...f, originalIndex: i, severity: (isCrit ? "critical" : "medium") as "critical" | "medium" };
    });
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.url.toLowerCase().includes(q) || f.vuln_type.toLowerCase().includes(q) || (f.payload && f.payload.toLowerCase().includes(q)));
    }
    if (severityFilter !== "all") result = result.filter(f => f.severity === severityFilter);
    if (sortBy === "severity") result.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
    else if (sortBy === "url") result.sort((a, b) => a.url.localeCompare(b.url));
    else result.sort((a, b) => b.originalIndex - a.originalIndex);
    return result;
  }, [findings, searchQuery, severityFilter, sortBy]);

  const filteredLogs = useMemo(() => {
    let result = logFilter !== "all" ? logs.filter(l => l.level === logFilter) : logs;
    if (termSearchQuery.trim()) {
      const q = termSearchQuery.toLowerCase();
      result = result.filter(l => l.message.toLowerCase().includes(q) || l.level.toLowerCase().includes(q));
    }
    return result;
  }, [logs, termSearchQuery, logFilter]);

  const processedHistory = useMemo(() => {
    let result = [...scanHistory];
    if (historySearchQuery.trim()) { const q = historySearchQuery.toLowerCase(); result = result.filter(h => h.target.toLowerCase().includes(q)); }
    switch (historySortBy) {
      case "oldest": result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); break;
      case "targets": result.sort((a, b) => b.targetsCount - a.targetsCount); break;
      case "findings": result.sort((a, b) => b.findingsCount - a.findingsCount); break;
      default: result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); break;
    }
    return result;
  }, [scanHistory, historySearchQuery, historySortBy]);

  const handleExportJSON = useCallback(async () => {
    const filePath = await save({ defaultPath: `arkenar-findings-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (filePath) await writeTextFile(filePath, JSON.stringify(findings, null, 2));
  }, [findings]);

  // H2: Export history as CSV
  const handleExportCSV = useCallback(() => {
    const headers = "Date,Target,Elapsed,Critical,Medium,Safe,URLs";
    const rows = scanHistory.map(e => [`"${e.date}"`, `"${e.target}"`, `"${e.elapsed}"`, e.criticalCount, e.mediumCount, e.safeCount, e.urlsScanned].join(","));
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "arkenar-history.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [scanHistory]);

  // F4: tab change wrapper that resets badge
  const handleTabChange = useCallback((tab: "terminal" | "findings" | "history") => {
    if (tab === "findings") setNewFindingsBadge(0);
    onTabChange(tab);
  }, [onTabChange]);

  // F4: track new findings while not on findings tab
  useEffect(() => {
    if (activeTab !== "findings" && findings.length > prevFindingsLenRef.current) {
      setNewFindingsBadge(prev => prev + (findings.length - prevFindingsLenRef.current));
    }
    prevFindingsLenRef.current = findings.length;
  }, [findings.length, activeTab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        if (activeTab === "terminal") termSearchRef.current?.focus();
        else if (activeTab === "findings") findingsSearchRef.current?.focus();
        else if (activeTab === "history") historySearchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab]);

  // H2: Compute virtual scroll range
  const totalHeight = filteredLogs.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIRT_BUFFER);
  const endIdx = Math.min(filteredLogs.length - 1, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + VIRT_BUFFER);

  return (
    <div className="flex flex-1 flex-col overflow-hidden mx-6 mb-6 rounded-xl border border-border-subtle bg-bg-terminal">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          {activeTab !== "studio" && (
            <>
              <button onClick={() => handleTabChange("terminal")} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 border backdrop-blur-sm ${activeTab === "terminal" ? "bg-bg-card text-text-primary border-accent/40 shadow-[0_4px_12px_rgba(0,0,0,0.25)] ring-1 ring-accent/20" : "bg-bg-card/30 text-text-ghost border-border-subtle/40 hover:bg-bg-card/50 hover:border-border-subtle/80 hover:text-text-secondary"}`}>
                <FlaskConical size={15} strokeWidth={2.5} className={activeTab === "terminal" ? "text-accent-text" : ""} />{t("terminal")}
              </button>
              <button onClick={() => handleTabChange("findings")} className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 border backdrop-blur-sm ${activeTab === "findings" ? "bg-bg-card text-text-primary border-status-critical/40 shadow-[0_4px_12px_rgba(244,63,94,0.15)] ring-1 ring-status-critical/20" : "bg-bg-card/30 text-text-ghost border-border-subtle/40 hover:bg-bg-card/50 hover:border-border-subtle/80 hover:text-text-secondary"}`}>
                <Bug size={15} strokeWidth={2.5} className={activeTab === "findings" ? "text-status-critical" : ""} />{t("findings")}
                {findings.length > 0 && <span className="ml-1 rounded-full bg-status-critical/20 text-status-critical px-2 py-0.5 text-[10px] font-black">{findings.length}</span>}
                {/* F4: new findings badge */}
                {newFindingsBadge > 0 && activeTab !== "findings" && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent text-[9px] font-black text-bg-root px-1 animate-pulse shadow-[0_0_6px_var(--color-accent)]">{newFindingsBadge}</span>
                )}
              </button>
              <button onClick={() => handleTabChange("history")} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 border backdrop-blur-sm ${activeTab === "history" ? "bg-bg-card text-text-primary border-accent/40 shadow-[0_4px_12px_rgba(0,0,0,0.25)] ring-1 ring-accent/20" : "bg-bg-card/30 text-text-ghost border-border-subtle/40 hover:bg-bg-card/50 hover:border-border-subtle/80 hover:text-text-secondary"}`}>
                <Clock size={15} strokeWidth={2.5} className={activeTab === "history" ? "text-accent-text" : ""} />History
                {scanHistory.length > 0 && <span className="ml-1 rounded-full bg-accent/20 text-accent-text px-2 py-0.5 text-[10px] font-black">{scanHistory.length}</span>}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "findings" && findings.length > 0 && (
            <button onClick={handleExportJSON} className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-hover transition-all duration-200" title="Export findings as JSON">
              <Download size={14} strokeWidth={2.5} className="text-text-ghost group-hover:text-accent-text transition-colors" />Export JSON
            </button>
          )}
          {activeTab === "history" && scanHistory.length > 0 && (
            <>
              <button onClick={handleExportCSV} className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-hover transition-all duration-200" title="Export history as CSV">
                <Download size={14} strokeWidth={2.5} className="text-text-ghost group-hover:text-accent-text transition-colors" />CSV
              </button>
              <button onClick={onRequestClear} className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3.5 py-2 text-xs font-semibold text-text-primary btn-danger-ghost transition-all duration-200">
                <Trash2 size={15} strokeWidth={2.5} className="text-text-ghost group-hover:text-status-critical transition-colors" />Clear History
              </button>
            </>
          )}
          {activeTab === "terminal" && (
            <>
              {/* T3: Timestamps toggle */}
              <button onClick={() => setShowTimestamps(p => !p)} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all duration-200 ${showTimestamps ? "border-accent/30 bg-accent/10 text-accent-text" : "border-border-subtle bg-bg-card text-text-ghost hover:bg-bg-hover"}`} title="Toggle timestamps">
                <Clock size={13} strokeWidth={2.5} />
              </button>
              {/* T2: Auto-scroll pin */}
              <button onClick={() => setAutoScroll(p => !p)} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all duration-200 ${autoScroll ? "border-accent/30 bg-accent/10 text-accent-text" : "border-border-subtle bg-bg-card text-text-ghost hover:bg-bg-hover"}`} title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}>
                {autoScroll ? <ArrowDownToLine size={13} strokeWidth={2.5} /> : <ArrowUpToLine size={13} strokeWidth={2.5} />}
              </button>
              <button onClick={handleCopyLogs} disabled={logs.length === 0} className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-bg-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed" title="Copy terminal logs to clipboard">
                {isLogCopied ? <Check size={14} className="text-status-success" strokeWidth={3} /> : <Copy size={14} className="text-text-ghost group-hover:text-accent-text transition-colors" strokeWidth={2.5} />}
                {isLogCopied ? "Copied" : "Copy"}
              </button>
            </>
          )}
          {activeTab !== "history" && (
            <button onClick={onRequestClear} className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3.5 py-2 text-xs font-semibold text-text-primary btn-danger-ghost transition-all duration-300">
              <Trash2 size={15} strokeWidth={2.5} className="text-text-ghost group-hover:text-status-critical transition-colors" />
              {activeTab === "terminal" ? "Clear Logs" : "Clear Findings"}
            </button>
          )}
        </div>
      </div>

      {/* Terminal search bar */}
      {activeTab === "terminal" && (
        <div className="border-b border-border-subtle bg-bg-panel/30">
          <div className="flex items-center gap-3 px-5 py-2.5">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ghost group-focus-within:text-accent-text transition-colors duration-200" size={14} />
              <input ref={termSearchRef} type="text" placeholder="Search logs (Ctrl+F)..." value={termSearchQuery} onChange={e => setTermSearchQuery(e.target.value)} className="w-full rounded-lg border border-border-subtle bg-bg-input py-1.5 pl-9 pr-4 text-[13px] text-text-primary placeholder-text-ghost focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40 transition-all duration-300 shadow-sm" />
            </div>
            <span className="text-[11px] text-text-ghost font-mono whitespace-nowrap">{filteredLogs.length}/{logs.length}</span>
            {termSearchQuery && (
              <button onClick={() => setTermSearchQuery("")} className="rounded-md p-1 text-text-ghost hover:text-text-primary hover:bg-bg-hover transition-all duration-150" title="Clear search">
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>
          {/* T4: Log level filter pills */}
          <div className="flex items-center gap-1.5 px-5 pb-2">
            {["all", "info", "success", "warn", "error", "phase"].map(lvl => (
              <button key={lvl} onClick={() => setLogFilter(lvl)}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all duration-150 ${
                  logFilter === lvl ? "bg-accent text-bg-root" : "bg-bg-card border border-border-subtle text-text-ghost hover:text-text-secondary"
                }`}>
                {lvl === "all" ? "All" : lvl === "warn" ? "Warn" : lvl === "error" ? "Error" : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* H2: Virtual Terminal */}
      {activeTab === "terminal" && (
        <div ref={containerRef} onScroll={handleScroll} dir="ltr" className="flex-1 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-relaxed relative scroll-smooth text-left">
          {filteredLogs.length === 0 ? (
            <span className="text-text-ghost">{termSearchQuery || logFilter !== "all" ? "No matching logs." : "Awaiting scan configuration..."}</span>
          ) : (
            <div style={{ height: totalHeight, position: "relative" }}>
              {filteredLogs.slice(startIdx, endIdx + 1).map((log, relIdx) => {
                const absIdx = startIdx + relIdx;
                return <LogLine key={`${log.time}-${absIdx}`} log={log} absIdx={absIdx} showTimestamps={showTimestamps} />;
              })}
            </div>
          )}
        </div>
      )}

      {/* Findings Tab */}
      {activeTab === "findings" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border-subtle bg-bg-panel/30">
            <div className="flex items-center gap-3 px-5 py-2.5">
              <div className="relative flex-1 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ghost group-focus-within:text-accent-text transition-colors duration-200" size={14} />
                <input ref={findingsSearchRef} type="text" placeholder="Search findings (Ctrl+F)..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-border-subtle bg-bg-input py-1.5 pl-9 pr-4 text-[13px] text-text-primary placeholder-text-ghost focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40 transition-all duration-300 shadow-sm" dir="ltr" />
              </div>
              <CustomDropdown value={sortBy} onChange={setSortBy} options={[{ label: "Time ↓", value: "newest" }, { label: "Severity", value: "severity" }, { label: "URL A→Z", value: "url" }]} icon={ArrowUpDown} />
            </div>
            {/* F1: Severity filter pills with counts */}
            {(() => {
              const critCount = findings.filter(f => CRITICAL_PATTERNS.some(p => f.vuln_type.toLowerCase().includes(p))).length;
              const medCount = findings.length - critCount;
              return (
                <div className="flex items-center gap-2 px-5 pb-2">
                  {([{ v: "all", label: `All (${findings.length})` }, { v: "critical", label: `Critical (${critCount})` }, { v: "medium", label: `Medium (${medCount})` }] as const).map(({ v, label }) => (
                    <button key={v} onClick={() => setSeverityFilter(v)}
                      className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all duration-150 ${
                        severityFilter === v
                          ? v === "critical" ? "bg-status-critical/20 text-status-critical border border-status-critical/30"
                          : v === "medium"   ? "bg-status-warning/20 text-status-warning border border-status-warning/30"
                          :                    "bg-accent/15 text-accent-text border border-accent/25"
                          : "bg-bg-card border border-border-subtle text-text-ghost hover:text-text-secondary"
                      }`}>{label}</button>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4 space-y-3">
            {processedFindings.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-text-ghost">
                <Shield size={36} strokeWidth={2} className="mb-3 opacity-30" />
                <span className="text-sm font-medium">{searchQuery || severityFilter !== "all" ? "No matches found." : "No findings yet"}</span>
              </div>
            )}
            {processedFindings.map(f => (
              <FindingCard key={f.originalIndex} finding={f} index={f.originalIndex} onOpenDetail={() => setDetailFinding(f)} onSendToStudio={(finding) => onSendToStudio?.(finding)} />
            ))}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="flex flex-1 flex-col overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between border-b border-border-subtle bg-bg-panel/30 px-5 py-3 gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ghost group-focus-within:text-accent-text transition-colors duration-200" size={14} />
              <input ref={historySearchRef} type="text" placeholder="Search history (Ctrl+F)..." value={historySearchQuery} onChange={e => setHistorySearchQuery(e.target.value)} className="w-full rounded-lg border border-border-subtle bg-bg-input py-1.5 pl-9 pr-4 text-[13px] text-text-primary placeholder-text-ghost focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40 transition-all duration-300 shadow-sm" />
            </div>
            <CustomDropdown value={historySortBy} onChange={setHistorySortBy} options={[{ label: "Newest First", value: "newest" }, { label: "Oldest First", value: "oldest" }, { label: "Most Targets", value: "targets" }, { label: "Most Findings", value: "findings" }]} icon={ArrowUpDown} />
          </div>
          <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4 space-y-3">
            {processedHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted py-20">
                {historySearchQuery ? <><Search size={36} strokeWidth={1.5} className="mb-3 opacity-30" /><span className="text-sm font-medium">No historical match found.</span></> : <><Clock size={36} strokeWidth={1.5} className="mb-3 opacity-30" /><span className="text-sm font-medium">No scan history yet.</span><span className="text-xs text-text-ghost mt-1">Completed scans will appear here.</span></>}
              </div>
            ) : processedHistory.map(entry => {
              const date = new Date(entry.date);
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const timeStr = date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
              return (
                <div key={entry.id} className="finding-card animate-fade-slide-in rounded-xl border border-border-subtle bg-bg-card px-5 py-4 group">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2"><span className="font-mono text-xs text-text-ghost">{dateStr}</span><span className="text-text-ghost/40">{"•"}</span><span className="font-mono text-xs text-text-ghost">{timeStr}</span></div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text-muted" dir="ltr">{entry.elapsed}</span>
                      <div className="flex items-center gap-1.5">
                        {onLoadFromHistory && entry.target !== "—" && (
                          <button onClick={() => onLoadFromHistory(entry.target)} className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-md bg-accent/15 border border-accent/20 px-2 py-1 text-[10px] font-bold text-accent-text hover:bg-accent/25 transition-all duration-200" title="Re-scan">
                            <ExternalLink size={10} strokeWidth={2.5} />Re-scan
                          </button>
                        )}
                        {/* H1: Quick re-scan */}
                        {onQuickRescan && entry.target !== "—" && (
                          <button onClick={() => onQuickRescan(entry.target)} className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-md bg-status-success/10 border border-status-success/20 px-2 py-1 text-[10px] font-bold text-status-success hover:bg-status-success/20 transition-all duration-200" title="Quick re-scan">
                            <RotateCcw size={10} strokeWidth={2.5} />Re-scan
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-text-primary truncate mb-3 font-mono text-start" dir="ltr">{entry.target}</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[{ label: "Targets", val: entry.targetsCount, cls: "text-text-primary" }, { label: "URLs", val: entry.urlsScanned, cls: "text-text-primary" }, { label: "Critical", val: entry.criticalCount, cls: entry.criticalCount > 0 ? "text-status-critical" : "text-text-primary" }, { label: "Medium", val: entry.mediumCount, cls: entry.mediumCount > 0 ? "text-status-warning" : "text-text-primary" }, { label: "Safe", val: entry.safeCount, cls: entry.safeCount > 0 ? "text-status-success" : "text-text-primary" }].map(s => (
                      <div key={s.label} className="rounded-lg bg-bg-root px-3 py-2 text-center">
                        <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">{s.label}</p>
                        <p className={`font-mono text-sm font-bold ${s.cls}`}>{s.val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* H3: Finding Detail Modal */}
      {detailFinding && <FindingDetailModal finding={detailFinding} onClose={() => setDetailFinding(null)} onSendToStudio={(finding) => onSendToStudio?.(finding)} />}

      {/* Studio Tab */}
      {activeTab === "studio" && (
        <div className="flex-1 overflow-hidden">
          <StudioPanel
            initialRequest={initialStudioRequest}
            onInitialRequestConsumed={onInitialRequestConsumed}
            history={studioHistory}
            setHistory={setStudioHistory}
            selectedHistoryId={selectedStudioHistoryId}
            setSelectedHistoryId={setSelectedStudioHistoryId}
            onSendToBasic={onSendToBasic}
          />
        </div>
      )}

      {/* Progress bar at the bottom of the terminal panel */}
      {activeTab !== "studio" && <ThinProgressBar progress={scanProgress} status={scanStatus} />}
    </div>
  );
}
