import React, { useRef, useEffect, useState, useMemo, useCallback, memo } from "react";
import {
  FlaskConical, Bug, Shield,
  AlertTriangle, ChevronDown, Copy, Check, Trash2,
  Search, Filter, ArrowUpDown, Clock, Download, ExternalLink, AlertOctagon,
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { LogEntry, ScanFindingEvent, ScanHistoryEntry } from "../types";
import { CustomDropdown } from "./primitives";
import { t } from "../utils/i18n";

/** Fix 1: Detect suspicious shell metacharacters in curl commands */
const SHELL_META = /[;&|`$(){}]/;

function FindingCardInner({ finding, index, language }: { finding: ScanFindingEvent; index: number; language: "en" | "ar" }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCritical = finding.vuln_type.toLowerCase().includes("sqli") || finding.vuln_type.toLowerCase().includes("sql");
  const severityClass = isCritical ? "text-status-critical bg-status-critical/10" : "text-status-warning bg-status-warning/10";
  const hasSuspiciousChars = SHELL_META.test(finding.curl_cmd);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(finding.curl_cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const alignClass = language === "ar" ? "text-right" : "text-left";

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
          {isCritical ? t("critical", language) : t("medium", language)}
        </span>
        <ChevronDown size={16} className={`text-text-ghost transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {expanded && (
        <div className="animate-fade-slide-in px-5 pb-4 pt-0 border-t border-border-subtle space-y-3">
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs pt-3">
            <div className="text-start">
              <span className="text-text-muted">{t("target", language)}</span>
              <p className={`text-text-secondary font-mono text-[13px] truncate mt-0.5 ${alignClass}`} dir="ltr">
                {finding.url}
              </p>
            </div>
            <div className="text-start">
              <span className="text-text-muted">{t("payload", language)}</span>
              <p className={`text-text-secondary font-mono text-[13px] truncate mt-0.5 ${alignClass}`} dir="ltr">
                {finding.payload || "—"}
              </p>
            </div>
            <div className="text-start">
              <span className="text-text-muted">{t("status", language)}</span>
              <p className={`text-text-secondary font-mono mt-0.5 ${alignClass}`} dir="ltr">
                {finding.status_code}
              </p>
            </div>
            <div className="text-start">
              <span className="text-text-muted">{t("timing", language)}</span>
              <p className={`text-text-secondary font-mono mt-0.5 ${alignClass}`} dir="ltr">
                {finding.timing_ms}ms
              </p>
            </div>
            {finding.server && (
              <div className="text-start">
                <span className="text-text-muted">{t("server", language)}</span>
                <p className={`text-text-secondary font-mono mt-0.5 ${alignClass}`} dir="ltr">
                  {finding.server}
                </p>
              </div>
            )}
          </div>
          <div className="text-start">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs text-text-muted">{t("reproduce", language)}</p>
              {hasSuspiciousChars && (
                <span className="flex items-center gap-1 rounded-full bg-status-warning/15 px-2 py-0.5 text-[10px] font-bold text-status-warning uppercase">
                  <AlertOctagon size={10} strokeWidth={3} />
                  {t("reproduceDesc", language)}
                </span>
              )}
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-bg-root border border-border-subtle p-3">
              <code className={`flex-1 text-[13px] font-mono text-text-secondary break-all leading-relaxed select-all ${alignClass}`} dir="ltr">
                {finding.curl_cmd}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md p-2 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200 hover:scale-110 active:scale-90"
                title={t("copyCurl", language)}
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
const FindingCard = memo(FindingCardInner);

interface TerminalViewProps {
  logs: LogEntry[];
  findings: ScanFindingEvent[];
  activeTab: "terminal" | "findings" | "history";
  onTabChange: (tab: "terminal" | "findings" | "history") => void;
  onRequestClear: () => void;
  scanHistory: ScanHistoryEntry[];
  onLoadFromHistory?: (target: string) => void;
  isClearGlowing?: boolean;
  language: "en" | "ar";
}

export function TerminalView({
  logs,
  findings,
  activeTab,
  onTabChange,
  onRequestClear,
  scanHistory,
  onLoadFromHistory,
  isClearGlowing,
  language
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const termSearchRef = useRef<HTMLInputElement>(null);
  const findingsSearchRef = useRef<HTMLInputElement>(null);
  const historySearchRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "medium">("all");
  const [sortBy, setSortBy] = useState<"newest" | "severity">("newest");

  // History Search/Sort state
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySortBy, setHistorySortBy] = useState<"newest" | "oldest" | "targets" | "findings">("newest");

  // Feature 15: Terminal log search
  const [termSearchQuery, setTermSearchQuery] = useState("");
  const [isLogCopied, setIsLogCopied] = useState(false);

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;

    // Format logs into a single string
    const textToCopy = logs.map(log => `[${log.time}] ${log.message}`).join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsLogCopied(true);
      setTimeout(() => setIsLogCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs', err);
    }
  };

  // Handle auto-scroll logic
  useEffect(() => {
    if (activeTab === "terminal" && autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    autoScrollRef.current = isAtBottom;
  }, []);

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

  // Filtered/Sorted history
  const processedHistory = useMemo(() => {
    let result = [...scanHistory];

    if (historySearchQuery.trim()) {
      const q = historySearchQuery.toLowerCase();
      result = result.filter(h => h.target.toLowerCase().includes(q));
    }

    switch (historySortBy) {
      case "oldest":
        result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        break;
      case "targets":
        result.sort((a, b) => b.targetsCount - a.targetsCount);
        break;
      case "findings":
        result.sort((a, b) => b.findingsCount - a.findingsCount);
        break;
      case "newest":
      default:
        result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
    }

    return result;
  }, [scanHistory, historySearchQuery, historySortBy]);

  // Feature 16: Export findings to JSON
  const handleExportJSON = useCallback(async () => {
    const filePath = await save({
      defaultPath: `arkenar-findings-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (filePath) {
      await writeTextFile(filePath, JSON.stringify(findings, null, 2));
    }
  }, [findings]);

  // Ctrl+F → Focus search bar of current tab
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden mx-6 mb-6 rounded-xl border border-border-subtle bg-bg-terminal">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onTabChange("terminal")}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 border backdrop-blur-sm ${activeTab === "terminal"
              ? "bg-bg-card text-text-primary border-accent/40 shadow-[0_4px_12px_rgba(0,0,0,0.25)] ring-1 ring-accent/20"
              : "bg-bg-card/30 text-text-ghost border-border-subtle/40 hover:bg-bg-card/50 hover:border-border-subtle/80 hover:text-text-secondary"
              }`}
          >
            <FlaskConical size={15} strokeWidth={2.5} className={activeTab === "terminal" ? "text-accent-text" : ""} />
            {t("terminal", language)}
          </button>
          <button
            onClick={() => onTabChange("findings")}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 border backdrop-blur-sm ${activeTab === "findings"
              ? "bg-bg-card text-text-primary border-status-critical/40 shadow-[0_4px_12px_rgba(244,63,94,0.15)] ring-1 ring-status-critical/20"
              : "bg-bg-card/30 text-text-ghost border-border-subtle/40 hover:bg-bg-card/50 hover:border-border-subtle/80 hover:text-text-secondary"
              }`}
          >
            <Bug size={15} strokeWidth={2.5} className={activeTab === "findings" ? "text-status-critical" : ""} />
            {t("findings", language)}
            {findings.length > 0 && (
              <span className={`${language === "ar" ? "mr-1" : "ml-1"} rounded-full bg-status-critical/20 text-status-critical px-2 py-0.5 text-[10px] font-black`}>
                {findings.length}
              </span>
            )}
          </button>
          <button
            onClick={() => onTabChange("history")}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 border backdrop-blur-sm ${activeTab === "history"
              ? "bg-bg-card text-text-primary border-accent/40 shadow-[0_4px_12px_rgba(0,0,0,0.25)] ring-1 ring-accent/20"
              : "bg-bg-card/30 text-text-ghost border-border-subtle/40 hover:bg-bg-card/50 hover:border-border-subtle/80 hover:text-text-secondary"
              }`}
          >
            <Clock size={15} strokeWidth={2.5} className={activeTab === "history" ? "text-accent-text" : ""} />
            {language === "ar" ? "السجل" : "History"}
            {scanHistory.length > 0 && (
              <span className={`${language === "ar" ? "mr-1" : "ml-1"} rounded-full bg-accent/20 text-accent-text px-2 py-0.5 text-[10px] font-black`}>
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
              title={language === "ar" ? "تصدير بصيغة JSON" : "Export findings as JSON"}
            >
              <Download size={14} strokeWidth={2.5} className="text-text-ghost group-hover:text-accent-text transition-colors" />
              {language === "ar" ? "تصدير JSON" : "Export JSON"}
            </button>
          )}
          {activeTab === "history" && scanHistory.length > 0 && (
            <button
              onClick={onRequestClear}
              className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3.5 py-2 text-xs font-semibold text-text-primary btn-danger-ghost transition-all duration-200"
            >
              <Trash2 size={15} strokeWidth={2.5} className="text-text-ghost group-hover:text-status-critical transition-colors" />
              {t("clear", language)} {language === "ar" ? "السجل" : "History"}
            </button>
          )}
          {activeTab === "terminal" && (
            <button
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
              className="group flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-bg-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy terminal logs to clipboard"
            >
              {isLogCopied ? (
                <Check size={14} className="text-status-success" strokeWidth={3} />
              ) : (
                <Copy size={14} className="text-text-ghost group-hover:text-accent-text transition-colors" strokeWidth={2.5} />
              )}
              {isLogCopied ? (language === "ar" ? "تم النسخ" : "Copied") : t("copy", language)}
            </button>
          )}
          {activeTab !== "history" && (
            <button
              onClick={onRequestClear}
              className={`group flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold text-text-primary btn-danger-ghost transition-all duration-300 ${isClearGlowing
                ? "bg-status-critical/20 border-status-critical/50 shadow-[0_0_15px_rgba(244,63,94,0.4)] scale-105"
                : "bg-bg-card border-border-subtle"
                }`}
            >
              <Trash2 size={15} strokeWidth={2.5} className={`transition-colors ${isClearGlowing ? "text-status-critical" : "text-text-ghost group-hover:text-status-critical"}`} />
              {activeTab === "terminal" ? t("clear", language) + " " + (language === "ar" ? "السجلات" : "Logs") : t("clear", language) + " " + (language === "ar" ? "النتائج" : "Findings")}
            </button>
          )}
        </div>
      </div>

      {/* Feature 15: Terminal search bar */}
      {activeTab === "terminal" && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-subtle bg-bg-panel/30">
          <div className="relative flex-1 group">
            <Search className={`absolute ${language === "ar" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-text-ghost group-focus-within:text-accent-text transition-colors duration-200`} size={14} />
            <input
              ref={termSearchRef}
              type="text"
              placeholder={t("searchPlaceholder", language)}
              value={termSearchQuery}
              onChange={(e) => setTermSearchQuery(e.target.value)}
              className={`w-full rounded-lg border border-border-subtle bg-bg-input py-1.5 ${language === "ar" ? "pr-9 pl-4 text-right" : "pl-9 pr-4"} text-[13px] text-text-primary placeholder-text-ghost focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40 transition-all duration-300 shadow-sm`}
            />
          </div>
          {termSearchQuery && (
            <>
              <span className="text-[11px] text-text-ghost font-mono">{filteredLogs.length}/{logs.length}</span>
              <button
                onClick={() => setTermSearchQuery("")}
                className="rounded-md p-1 text-text-ghost hover:text-text-primary hover:bg-bg-hover transition-all duration-150"
                title="Clear search"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" /></svg>
              </button>
            </>
          )}
        </div>
      )}

      {activeTab === "terminal" && (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          dir="ltr"
          className="flex-1 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-relaxed relative scroll-smooth text-left"
        >
          {filteredLogs.length === 0 ? (
            <span className="text-text-ghost">{termSearchQuery ? (language === "ar" ? "لم يتم العثور على سجلات مطابقة." : "No matching logs.") : (language === "ar" ? "في انتظار بدء الفحص..." : "Awaiting scan configuration...")}</span>
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
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border-subtle bg-bg-panel/30">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ghost group-focus-within:text-accent-text transition-colors duration-200" size={14} />
              <input
                ref={findingsSearchRef}
                type="text"
                placeholder="Search findings (Ctrl+F)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg-input py-1.5 pl-9 pr-4 text-[13px] text-text-primary placeholder-text-ghost focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40 transition-all duration-300 shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <CustomDropdown
                value={severityFilter}
                onChange={setSeverityFilter}
                options={[
                  { label: t("allSeverities", language), value: 'all' },
                  { label: t("criticalOnly", language), value: 'critical' },
                  { label: t("mediumOnly", language), value: 'medium' }
                ]}
                icon={Filter}
              />

              <CustomDropdown
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { label: t("newestFirst", language), value: 'newest' },
                  { label: t("sortBySeverity", language), value: 'severity' }
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
                  {searchQuery || severityFilter !== "all" ? (language === "ar" ? "لم يتم العثور على نتائج مطابقة." : "No matches found.") : t("noFindings", language)}
                </span>
              </div>
            )}
            {processedFindings.map((f) => (
              <FindingCard key={f.originalIndex} finding={f} index={f.originalIndex} language={language} />
            ))}
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="flex flex-1 flex-col overflow-hidden animate-fade-in">
          {/* History Controls */}
          <div className="flex items-center justify-between border-b border-border-subtle bg-bg-panel/30 px-5 py-3 gap-4">
            <div className="relative flex-1 group">
              <Search className={`absolute ${language === "ar" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-text-ghost group-focus-within:text-accent-text transition-colors duration-200`} size={14} />
              <input
                ref={historySearchRef}
                type="text"
                placeholder={t("searchPlaceholder", language)}
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className={`w-full rounded-lg border border-border-subtle bg-bg-input py-1.5 ${language === "ar" ? "pr-9 pl-4 text-right" : "pl-9 pr-4"} text-[13px] text-text-primary placeholder-text-ghost focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40 transition-all duration-300 shadow-sm`}
              />
            </div>
            <div className="flex items-center gap-2">
              <CustomDropdown
                value={historySortBy}
                onChange={setHistorySortBy}
                options={[
                  { label: t("newestFirst", language), value: "newest" },
                  { label: t("oldestFirst", language), value: "oldest" },
                  { label: t("mostTargets", language), value: "targets" },
                  { label: t("mostFindings", language), value: "findings" },
                ]}
                icon={ArrowUpDown}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4 space-y-3">
            {processedHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted py-20">
                {historySearchQuery ? (
                  <>
                    <Search size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
                    <span className="text-sm font-medium">{t("noHistoryMatch", language)}</span>
                  </>
                ) : (
                  <>
                    <Clock size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
                    <span className="text-sm font-medium">{t("noHistoryYet", language)}</span>
                    <span className="text-xs text-text-ghost mt-1">{t("historyDesc", language)}</span>
                  </>
                )}
              </div>
            ) : (
              processedHistory.map((entry) => {
                const date = new Date(entry.date);
                const dateStr = date.toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", { month: "short", day: "numeric", year: "numeric" });
                const timeStr = date.toLocaleTimeString(language === "ar" ? "ar-EG" : "en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

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
                        <span className="font-mono text-xs text-text-muted" dir="ltr">{entry.elapsed}</span>
                        {/* Feature 13: Click to re-scan this target */}
                        {onLoadFromHistory && entry.target !== "—" && (
                          <button
                            onClick={() => onLoadFromHistory(entry.target)}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-md bg-accent/15 border border-accent/20 px-2 py-1 text-[10px] font-bold text-accent-text hover:bg-accent/25 transition-all duration-200"
                            title={t("rescan", language)}
                          >
                            <ExternalLink size={10} strokeWidth={2.5} />
                            {t("rescan", language)}
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-text-primary truncate mb-3 font-mono text-start" dir="ltr">{entry.target}</p>

                    <div className="grid grid-cols-5 gap-2">
                      <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                        <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">{t("targets", language)}</p>
                        <p className="font-mono text-sm font-bold text-text-primary">{entry.targetsCount}</p>
                      </div>
                      <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                        <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">{t("urls", language)}</p>
                        <p className="font-mono text-sm font-bold text-text-primary">{entry.urlsScanned}</p>
                      </div>
                      <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                        <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">{t("critical", language)}</p>
                        <p className={`font-mono text-sm font-bold ${entry.criticalCount > 0 ? "text-status-critical" : "text-text-primary"}`}>{entry.criticalCount}</p>
                      </div>
                      <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                        <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">{t("medium", language)}</p>
                        <p className={`font-mono text-sm font-bold ${entry.mediumCount > 0 ? "text-status-warning" : "text-text-primary"}`}>{entry.mediumCount}</p>
                      </div>
                      <div className="rounded-lg bg-bg-root px-3 py-2 text-center">
                        <p className="text-[10px] text-text-ghost uppercase tracking-wider mb-0.5">{t("safe", language)}</p>
                        <p className={`font-mono text-sm font-bold ${entry.safeCount > 0 ? "text-status-success" : "text-text-primary"}`}>{entry.safeCount}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
