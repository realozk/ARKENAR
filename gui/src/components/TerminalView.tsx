import { useRef, useEffect, useState } from "react";
import {
  FlaskConical, Bug, Download, Shield,
  AlertTriangle, ChevronDown, Copy, Check, Trash2,
} from "lucide-react";
import type { LogEntry, ScanFindingEvent } from "../types";

function FindingCard({ finding, index }: { finding: ScanFindingEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCritical = finding.vuln_type.toLowerCase().includes("sqli") || finding.vuln_type.toLowerCase().includes("sql");
  const severityClass = isCritical ? "text-status-critical bg-status-critical/10" : "text-status-warning bg-status-warning/10";
  const severityLabel = isCritical ? "Critical" : "Medium";

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
        <AlertTriangle size={15} className={isCritical ? "text-status-critical" : "text-status-warning"} strokeWidth={2.5} />
        <span className="text-sm font-semibold text-text-primary truncate flex-1">{finding.vuln_type}</span>
        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${severityClass}`}>{severityLabel}</span>
        <ChevronDown size={14} className={`text-text-ghost transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
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
            <p className="text-xs text-text-muted mb-1.5">Reproduce</p>
            <div className="flex items-start gap-2 rounded-lg bg-bg-root border border-border-subtle p-3">
              <code className="flex-1 text-[13px] font-mono text-text-secondary break-all leading-relaxed select-all">
                {finding.curl_cmd}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md p-2 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200"
                title="Copy curl command"
              >
                {copied ? <Check size={14} className="text-status-success" /> : <Copy size={14} />}
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
  activeTab: "terminal" | "findings";
  onTabChange: (tab: "terminal" | "findings") => void;
  onClear: () => void;
  onExportReport: () => void;
}

export function TerminalView({ logs, findings, activeTab, onTabChange, onClear, onExportReport }: TerminalViewProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden mx-6 mb-6 rounded-xl border border-border-subtle bg-bg-terminal">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onTabChange("terminal")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold uppercase tracking-wider transition-all duration-200 ${activeTab === "terminal"
              ? "bg-bg-hover text-text-primary"
              : "text-text-ghost hover:text-text-secondary"
            }`}
          >
            <FlaskConical size={13} strokeWidth={2} />
            Terminal
          </button>
          <button
            onClick={() => onTabChange("findings")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold uppercase tracking-wider transition-all duration-200 ${activeTab === "findings"
              ? "bg-bg-hover text-text-primary"
              : "text-text-ghost hover:text-text-secondary"
            }`}
          >
            <Bug size={13} strokeWidth={2} />
            Findings
            {findings.length > 0 && (
              <span className="ml-1 rounded-full bg-status-critical/20 text-status-critical px-2 py-0.5 text-[11px] font-bold">
                {findings.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === "findings" && findings.length > 0 && (
            <button
              onClick={onExportReport}
              className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-text-primary hover:text-accent-text hover:border-border-hover transition-all duration-200 group"
            >
              <Download size={14} strokeWidth={2.5} className="text-text-ghost group-hover:text-accent-text transition-colors" />
              Export HTML
            </button>
          )}
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-input px-3.5 py-2 text-xs font-medium text-text-muted btn-danger-ghost transition-all duration-200"
          >
            <Trash2 size={12} strokeWidth={2} />
            Clear
          </button>
        </div>
      </div>

      {activeTab === "terminal" && (
        <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4 font-mono text-[13px] leading-relaxed">
          {logs.length === 0 && (
            <span className="text-text-ghost">Awaiting scan configuration...</span>
          )}
          {logs.map((log, i) => (
            <div key={i} className={`terminal-line ${log.level}`}>
              <span className="text-text-ghost select-none mr-3">{log.time}</span>
              {log.message}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}

      {activeTab === "findings" && (
        <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4 space-y-3">
          {findings.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-text-ghost">
              <Shield size={32} strokeWidth={1.5} className="mb-3 opacity-30" />
              <span className="text-sm">No findings yet.</span>
            </div>
          )}
          {findings.map((f, i) => (
            <FindingCard key={i} finding={f} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
