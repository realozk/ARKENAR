import { useRef, useEffect, useState, useCallback } from "react";
import { Copy, Check, Clock, ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import type { LogEntry } from "../../types";

const LEVEL_COLORS: Record<string, string> = {
  info: "#aaaaaa",
  success: "#4caf50",
  error: "#ff4444",
  warn: "#ff9800",
  phase: "#ff6b35",
};

const S: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#0d0d0d",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderBottom: "1px solid #2a2a2a",
    flexShrink: 0,
    background: "#111111",
  },
  logArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 12px",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 1.6,
  },
  logLine: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "1px 0",
    borderRadius: 2,
    transition: "background 0.1s",
  },
  logTime: {
    color: "#444444",
    fontSize: 11,
    flexShrink: 0,
    userSelect: "none" as const,
    lineHeight: "inherit",
  },
  logLevel: {
    fontWeight: 700,
    fontSize: 10,
    flexShrink: 0,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    lineHeight: "inherit",
    minWidth: 58,
  },
  logMsg: {
    flex: 1,
    color: "#e0e0e0",
    wordBreak: "break-word" as const,
    lineHeight: "inherit",
  },
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#333333",
    fontFamily: "monospace",
    fontSize: 12,
  },
};

const pillStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  padding: "2px 8px",
  borderRadius: 10,
  border: active ? "1px solid rgba(255,107,53,0.5)" : "1px solid #2a2a2a",
  background: active ? "rgba(255,107,53,0.15)" : "#1a1a1a",
  color: active ? "#ff6b35" : "#666666",
  cursor: "pointer",
});

const iconBtnStyle = (active?: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 5,
  background: active ? "rgba(255,107,53,0.15)" : "#1a1a1a",
  border: active ? "1px solid rgba(255,107,53,0.5)" : "1px solid #2a2a2a",
  borderRadius: 4,
  padding: "3px 8px",
  fontSize: 10,
  color: active ? "#ff6b35" : "#aaaaaa",
  cursor: "pointer",
  fontFamily: "monospace",
  textTransform: "uppercase",
  letterSpacing: 1,
});

const LEVELS = ["all", "info", "success", "warn", "error", "phase"] as const;
type LevelFilter = (typeof LEVELS)[number];

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
    <div style={S.root}>
      <div style={S.toolbar}>
        {LEVELS.map((lvl) => (
          <button key={lvl} style={pillStyle(levelFilter === lvl)} onClick={() => setLevelFilter(lvl)}>
            {lvl === "all" ? `All (${logs.length})` : lvl}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={iconBtnStyle(showTimestamps)} onClick={() => setShowTimestamps((v) => !v)} title="Toggle timestamps">
          <Clock size={11} />
        </button>
        <button style={iconBtnStyle(autoScroll)} onClick={() => setAutoScroll((v) => !v)} title="Toggle auto-scroll">
          {autoScroll ? <ArrowDownToLine size={11} /> : <ArrowUpToLine size={11} />}
        </button>
        <button
          style={{ ...iconBtnStyle(), opacity: logs.length === 0 ? 0.4 : 1 }}
          onClick={handleCopy}
          disabled={logs.length === 0}
          title="Copy all logs"
        >
          {copied ? <Check size={11} color="#4caf50" /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={S.empty}>
          {logs.length === 0 ? "Awaiting scan…" : "No matching log entries."}
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          style={{ ...S.logArea, scrollbarWidth: "thin", scrollbarColor: "#333 #0d0d0d" } as React.CSSProperties}
        >
          {filtered.map((log) => (
            <div key={log.id} style={S.logLine}>
              {showTimestamps && <span style={S.logTime}>{log.time}</span>}
              <span style={{ ...S.logLevel, color: LEVEL_COLORS[log.level] ?? "#aaaaaa" }}>
                [{log.level === "error" ? "CRIT" : log.level.toUpperCase()}]
              </span>
              <span style={S.logMsg}>{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
