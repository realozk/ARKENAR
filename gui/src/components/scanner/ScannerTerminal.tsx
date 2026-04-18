import { useRef, useEffect, useState, useCallback } from "react";
import type { LogEntry } from "../../types";
import {
  CopyIcon,
  CheckIcon,
  ClockIcon,
  ArrowDownLineIcon,
  ArrowUpLineIcon,
} from "../icons";

/* ── Level colors via tokens ──────────────────────────────────────────── */
const LEVEL_COLORS: Record<string, string> = {
  info:    "var(--color-text-muted)",
  success: "var(--color-status-success)",
  error:   "var(--color-status-critical)",
  warn:    "var(--color-status-warning)",
  phase:   "var(--color-accent)",
};

/* ── Level type ──────────────────────────────────────────────────────── */
const LEVELS = ["all", "info", "success", "warn", "error", "phase"] as const;
type LevelFilter = (typeof LEVELS)[number];

/* ── Pill ─────────────────────────────────────────────────────────────── */
// TASK 5: Dense flat border chip matching ScannerFindings style
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`font-mono uppercase px-2 h-6 cursor-pointer transition-colors duration-150 border focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2 ${
        active
          ? "border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent-hover)]"
          : "border-[color:var(--color-border-subtle)] bg-transparent text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-hover)]"
      }`}
      style={{ fontSize: 'var(--fs-label)', letterSpacing: 'var(--tr-label)', fontWeight: 700 }}
    >
      {children}
    </button>
  );
}

/* ── Icon button ──────────────────────────────────────────────────────── */
function IconBtn({
  active,
  onClick,
  title,
  disabled,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`h-6 px-2 flex items-center gap-1.5 rounded-sm font-mono uppercase transition-colors duration-150 border focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2 ${
        active
          ? "border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent-hover)]"
          : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)] text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] hover:border-[color:var(--color-border-hover)]"
      }`}
      style={{
        fontSize: 'var(--fs-label)',
        letterSpacing: 'var(--tr-label)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
interface ScannerTerminalProps {
  logs: LogEntry[];
}

export default function ScannerTerminal({ logs }: ScannerTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [copied, setCopied] = useState(false);

  const filtered = levelFilter === "all" ? logs : logs.filter((l) => l.level === levelFilter);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 80;
    setAutoScroll(atBottom);
  }, []);

  const handleCopy = async () => {
    const text = logs.map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--color-bg-root)" }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[color:var(--color-border-subtle)] shrink-0 flex-wrap"
        style={{ background: "var(--color-bg-panel)" }}
      >
        {LEVELS.map((lvl) => (
          <Pill key={lvl} active={levelFilter === lvl} onClick={() => setLevelFilter(lvl)}>
            {lvl === "all" ? `All (${logs.length})` : lvl}
          </Pill>
        ))}

        <div className="flex-1" />

        <IconBtn active={showTimestamps} onClick={() => setShowTimestamps((v) => !v)} title="Toggle timestamps">
          <ClockIcon size={11} />
        </IconBtn>

        <IconBtn active={autoScroll} onClick={() => setAutoScroll((v) => !v)} title="Toggle auto-scroll">
          {autoScroll ? <ArrowDownLineIcon size={11} /> : <ArrowUpLineIcon size={11} />}
        </IconBtn>

        <IconBtn onClick={handleCopy} title="Copy all logs" disabled={logs.length === 0}>
          {copied ? (
            <CheckIcon size={11} className="text-[color:var(--color-status-success)]" />
          ) : (
            <CopyIcon size={11} />
          )}
          {copied ? "Copied" : "Copy"}
        </IconBtn>
      </div>

      {/* Log area */}
      {filtered.length === 0 ? (
        <div
          className="flex-1 flex items-center justify-center font-mono text-[color:var(--color-text-ghost)]"
          style={{ fontSize: 'var(--fs-code)' }}
        >
          {logs.length === 0 ? "Awaiting scan…" : "No matching log entries."}
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-2 font-mono leading-relaxed"
          style={{
            fontSize: 'var(--fs-code)',
            scrollbarWidth: "thin",
            scrollbarColor: "var(--color-border-hover) transparent",
          } as React.CSSProperties}
        >
          {filtered.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 py-px"
            >
              {showTimestamps && (
                <span
                  className="shrink-0 text-[color:var(--color-text-ghost)] select-none leading-[inherit]"
                  style={{ fontSize: 'var(--fs-label)' }}
                >
                  {log.time}
                </span>
              )}
              <span
                className="shrink-0 font-bold uppercase min-w-[58px] leading-[inherit]"
                style={{
                  fontSize: 'var(--fs-label)',
                  letterSpacing: '0.08em',
                  color: LEVEL_COLORS[log.level] ?? "var(--color-text-muted)",
                }}
              >
                [{log.level === "error" ? "CRIT" : log.level.toUpperCase()}]
              </span>
              <span className="flex-1 text-[color:var(--color-text-primary)] break-words leading-[inherit]">
                {log.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
