import { useRef, useEffect, useState, useMemo } from "react";
import {
  FlaskConical, Bug, Shield,
  AlertTriangle, ChevronDown, Copy, Check, Trash2,
  Search, Filter, ArrowUpDown, Clock, Download, ExternalLink, AlertOctagon,
} from "lucide-react";
import type { LogEntry, ScanFindingEvent, ScanHistoryEntry } from "../types";
import { CustomDropdown } from "./primitives";

/** Fix 1: Detect suspicious shell metacharacters in curl commands */
const SHELL_META = /[;&|`$(){}]/;

function FindingCard({ finding, index }: { finding: ScanFindingEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCritical = finding.vuln_type.toLowerCase().includes("sqli") || finding.vuln_type.toLowerCase().includes("sql");
  const severityClass = isCritical ? "text-status-critical bg-status-critical/10" : "text-status-warning bg-status-warning/10";
  const severityLabel = isCritical ? "Critical" : "Medium";
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
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="font-mono text-xs text-text-ghost select-none w-6 shrink-0">#{index + 1}</span>
        <AlertTriangle size={17} className={isCritical ? "text-status-critical" : "text-status-warning"} strokeWidth={2.5} />
        <span className="text-sm font-semibold text-text-primary truncate flex-1">{finding.vuln_type}</span>
        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${severityClass}`}>{severityLabel}</span>
        <ChevronDown size={16} className={`text-text-ghost transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {expanded && (
        <div className="animate-fade-slide-in px-5 pb-4 pt-0 border-t border-border-subtle space-y-3">
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs pt-3">
            <div>
              <span className="text-text-muted">Target</span>
              <p className="text-text-secondary font-mono text-[13px] truncate mt-0.5">{finding.url}</p>
            </div>
            <div>
              <span className="text-text-muted">Payload</span>
              <p className="text-text-secondary font-mono text-[13px] truncate mt-0.5">{finding.payload || "—"}</p>
            </div>
            <div>
              <span className="text-text-muted">Status</span>
              <p className="text-text-secondary font-mono mt-0.5">{finding.status_code}</p>
            </div>
            <div>
              <span className="text-text-muted">Timing</span>
              <p className="text-text-secondary font-mono mt-0.5">{finding.timing_ms}ms</p>
            </div>
            {finding.server && (
              <div>
                <span className="text-text-muted">Server</span>
                <p className="text-text-secondary font-mono mt-0.5">{finding.server}</p>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs text-text-muted">Reproduce</p>
              {hasSuspiciousChars && (
                <span className="flex items-center gap-1 rounded-full bg-status-warning/15 px-2 py-0.5 text-[10px] font-bold text-status-warning uppercase">
                  <AlertOctagon size={10} strokeWidth={3} />
                  Review before running
                </span>
              )}
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-bg-root border border-border-subtle p-3">
              <code className="flex-1 text-[13px] font-mono text-text-secondary break-all leading-relaxed select-all">
                {finding.curl_cmd}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md p-2 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200 hover:scale-110 active:scale-90"
                title="Copy curl command"
              >
                {copied ? <Check size={16} strokeWidth={2.5} className="text-status-success" /> : <Copy size={16} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TerminalViewProps {
  logs: LogEntry[];
  findings: ScanFindingEvent[];
  activeTab: "terminal" | "findings" | "history";
  onTabChange: (tab: "terminal" | "findings" | "history") => void;
  onClear: () => void;
  scanHistory: ScanHistoryEntry[];
  onClearHistory: () => void;
  onLoadFromHistory?: (target: string) => void;
}

export function TerminalView({ logs, findings, activeTab, onTabChange, onClear, scanHistory, onClearHistory, onLoadFromHistory }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Search/Filter/Sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "medium">("all");
  const [sortBy, setSortBy] = useState<"newest" | "severity">("newest");

  // Feature 15: Terminal log search
  const [termSearchQuery, setTermSearchQuery] = useState("");

  // Handle auto-scroll logic
  useEffect(() => {
    if (activeTab === "terminal" && autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    autoScrollRef.current = isAtBottom;
  };

  const processedFindings = useMemo(() => {
    let result = findings.map((f, i) => {
      const isCrit = f.vuln_type.toLowerCase().includes("sqli") || f.vuln_type.toLowerCase().includes("sql");
      return { ...f, originalIndex: i, severity: isCrit ? "critical" : "medium" as const };
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f =>
        f.url.toLowerCase().includes(q) ||
        f.vuln_type.toLowerCase().includes(q) ||
        (f.payload && f.payload.toLowerCase().includes(q))
      );
    }

    if (severityFilter !== "all") {
      result = result.filter(f => f.severity === severityFilter);
    }

    if (sortBy === "severity") {
      result.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
    } else {
      result.sort((a, b) => b.originalIndex - a.originalIndex); // Newest first
    }

    return result;
  }, [findings, searchQuery, severityFilter, sortBy]);

  // Feature 15: Filtered terminal logs
  const filteredLogs = useMemo(() => {
    if (!termSearchQuery.trim()) return logs;
    const q = termSearchQuery.toLowerCase();
    return logs.filter(l => l.message.toLowerCase().includes(q) || l.level.toLowerCase().includes(q));
  }, [logs, termSearchQuery]);

  // Feature 16: Export findings to JSON
  const handleExportJSON = () => {
    const data = JSON.stringify(findings, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arkenar-findings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden mx-6 mb-6 rounded-xl border border-border-subtle bg-bg-terminal">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onTabChange("terminal")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold uppercase tracking-wider transition-all duration-300 active:scale-95 ${activeTab === "terminal"
              ? "bg-bg-hover text-text-primary shadow-sm"
              : "text-text-ghost hover:text-text-secondary hover:-translate-y-0.5"
              }`}
          >
            <FlaskConical size={15} strokeWidth={2.5} />
            Terminal
          </button>
          <button
            onClick={() => onTabChange("findings")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold uppercase tracking-wider transition-all duration-300 active:scale-95 ${activeTab === "findings"
              ? "bg-bg-hover text-text-primary shadow-sm"
              : "text-text-ghost hover:text-text-secondary hover:-translate-y-0.5"
              }`}
          >
            <Bug size={15} strokeWidth={2.5} />
            Findings
            {findings.length > 0 && (
              <span className="ml-1 rounded-full bg-status-critical/20 text-status-critical px-2 py-0.5 text-[11px] font-bold">
                {findings.length}
              </span>
            )}
          </button>
          <button
            onClick={() => onTabChange("history")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold uppercase tracking-wider transition-all duration-300 active:scale-95 ${activeTab === "history"
              ? "bg-bg-hover text-text-primary shadow-sm"
              : "text-text-ghost hover:text-text-secondary hover:-translate-y-0.5"
              }`}
          >
            <Clock size={15} strokeWidth={2.5} />
            History
            {scanHistory.length > 0 && (
              <span className="ml-1 rounded-full bg-accent-dim text-accent-text px-2 py-0.5 text-[11px] font-bold">
                {scanHistory.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Feature 16: Export JSON button for findings tab */}
          {activeTab === "findings" && findings.length > 0 && (
            <button
              onClick={handleExportJSON}
              className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-hover transition-all duration-200"
              title="Export findings as JSON"
            >
              <Download size={14} strokeWidth={2.5} className="text-text-ghost group-hover:text-accent-text transition-colors" />
              Export JSON
            </button>
          )}
          {activeTab === "history" && scanHistory.length > 0 && (
            <button
              onClick={onClearHistory}
              className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3.5 py-2 text-xs font-semibold text-text-primary btn-danger-ghost transition-all duration-200"
            >
              <Trash2 size={15} strokeWidth={2.5} className="text-text-ghost group-hover:text-status-critical transition-colors" />
              Clear History
            </button>
          )}
          {activeTab !== "history" && (
            <button
              onClick={onClear}
              className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3.5 py-2 text-xs font-semibold text-text-primary btn-danger-ghost transition-all duration-200"
            >
              <Trash2 size={15} strokeWidth={2.5} className="text-text-ghost group-hover:text-status-critical transition-colors" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Feature 15: Terminal search bar */}
      {activeTab === "terminal" && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-subtle bg-bg-card/30">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ghost" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={termSearchQuery}
              onChange={(e) => setTermSearchQuery(e.target.value)}
              className="w-full bg-bg-input border border-border-subtle rounded-lg pl-9 pr-4 py-1.5 text-xs text-text-primary outline-none focus:border-border-focus transition-all duration-200 placeholder:text-text-ghost/50"
            />
          </div>
          {termSearchQuery && (
            <span className="text-[11px] text-text-ghost font-mono">{filteredLogs.length}/{logs.length}</span>
          )}
        </div>
      )}

      {activeTab === "terminal" && (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-relaxed relative scroll-smooth"
        >
          {filteredLogs.length === 0 ? (
            <span className="text-text-ghost">{termSearchQuery ? "No matching logs." : "Awaiting scan configuration..."}</span>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredLogs.map((log, i) => (
                <div
                  key={i}
                  className={`terminal-line ${log.level}`}
                  style={{ '--i': i % 50 } as React.CSSProperties}
                >
                  <span className="text-text-ghost select-none mr-3">{log.time}</span>
                  {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "findings" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Findings Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border-subtle bg-bg-card/30">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ghost" />
              <input
                type="text"
                placeholder="Search URL, payload, vulnerability..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-input border border-border-subtle rounded-lg pl-9 pr-4 py-2 text-xs text-text-primary outline-none focus:border-border-focus transition-all duration-200 placeholder:text-text-ghost/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <CustomDropdown
                value={severityFilter}
                onChange={setSeverityFilter}
                options={[
                  { label: 'All Severities', value: 'all' },
                  { label: 'Critical Only', value: 'critical' },
                  { label: 'Medium Only', value: 'medium' }
                ]}
                icon={Filter}
              />

              <CustomDropdown
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { label: 'Newest First', value: 'newest' },
                  { label: 'Severity', value: 'severity' }
                ]}
                icon={ArrowUpDown}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4 space-y-3">
            {processedFindings.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-text-ghost">
                <Shield size={36} strokeWidth={2} className="mb-3 opacity-30" />
                <span className="text-sm font-medium">
                  {searchQuery || severityFilter !== "all" ? "No matches found." : "No findings yet."}
                </span>
              </div>
            )}
            {processedFindings.map((f) => (
              <FindingCard key={f.originalIndex} finding={f} index={f.originalIndex} />
            ))}
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4 space-y-3">
          {scanHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-ghost">
              <Clock size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
              <span className="text-sm font-medium">No scan history yet.</span>
              <span className="text-xs text-text-ghost mt-1">Completed scans will appear here.</span>
            </div>
          ) : (
            scanHistory.map((entry) => {
              const date = new Date(entry.date);
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const timeStr = date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

              return (
                <div
                  key={entry.id}
                  className="finding-card animate-fade-slide-in rounded-xl border border-border-subtle bg-bg-card px-5 py-4 group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text-ghost">{dateStr}</span>
                      <span className="text-text-ghost/40">{"\u2022"}</span>
                      <span className="font-mono text-xs text-text-ghost">{timeStr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text-muted">{entry.elapsed}</span>
                      {/* Feature 13: Click to re-scan this target */}
                      {onLoadFromHistory && entry.target !== "—" && (
                        <button
                          onClick={() => onLoadFromHistory(entry.target)}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-md bg-accent/15 border border-accent/20 px-2 py-1 text-[10px] font-bold text-accent-text hover:bg-accent/25 transition-all duration-200"
                          title="Load this target into the scanner"
                        >
                          <ExternalLink size={10} strokeWidth={2.5} />
                          Re-scan
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-text-primary truncate mb-3 font-mono">{entry.target}</p>

                  <div className="grid grid-cols-5 gap-2">
                    <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                      <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">Targets</p>
                      <p className="font-mono text-sm font-bold text-text-primary">{entry.targetsCount}</p>
                    </div>
                    <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                      <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">URLs</p>
                      <p className="font-mono text-sm font-bold text-text-primary">{entry.urlsScanned}</p>
                    </div>
                    <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                      <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">Critical</p>
                      <p className={`font-mono text-sm font-bold ${entry.criticalCount > 0 ? "text-status-critical" : "text-text-primary"}`}>{entry.criticalCount}</p>
                    </div>
                    <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                      <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">Medium</p>
                      <p className={`font-mono text-sm font-bold ${entry.mediumCount > 0 ? "text-status-warning" : "text-text-primary"}`}>{entry.mediumCount}</p>
                    </div>
                    <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                      <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">Safe</p>
                      <p className={`font-mono text-sm font-bold ${entry.safeCount > 0 ? "text-status-success" : "text-text-primary"}`}>{entry.safeCount}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
