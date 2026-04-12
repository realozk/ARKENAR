import { useState, useRef } from "react";
import { Play, Square, Download, ClipboardPaste } from "lucide-react";
import type { ScanConfig, ScanStatus, ScanStatsEvent } from "../../types";

const S: Record<string, React.CSSProperties> = {
  root: {
    flexShrink: 0,
    background: "#141414",
    borderBottom: "1px solid #2a2a2a",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  top: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "#ff6b35",
    whiteSpace: "nowrap" as const,
  },
  input: {
    flex: 1,
    background: "#0d0d0d",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: "monospace",
    color: "#e0e0e0",
    outline: "none",
    minWidth: 0,
  },
  btnPrimary: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#ff6b35",
    border: "none",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    color: "#000",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    textTransform: "uppercase" as const,
  },
  btnDanger: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "1px solid #f44336",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    color: "#f44336",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    textTransform: "uppercase" as const,
  },
  btnSecondary: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: "5px 10px",
    fontSize: 11,
    color: "#aaaaaa",
    cursor: "pointer",
    fontFamily: "monospace",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  statRow: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    borderTop: "1px solid #2a2a2a",
    padding: "6px 16px",
  },
  statItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingRight: 20,
    marginRight: 20,
    borderRight: "1px solid #2a2a2a",
  },
  statItemLast: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  statKey: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "#666666",
  },
  statVal: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#e0e0e0",
    fontWeight: 700,
  },
  progressBar: {
    height: 2,
    background: "#1a1a1a",
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  progressFill: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    height: "100%",
    background: "#ff6b35",
    transition: "width 0.3s ease",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
};

interface ScannerTopBarProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  scanStatus: ScanStatus;
  onStart: () => void;
  onStop: () => void;
  progress: number;
  stats: ScanStatsEvent | null;
  isComplete: boolean;
  findings: number;
  logs: number;
}

export default function ScannerTopBar({
  config,
  onUpdate,
  scanStatus,
  onStart,
  onStop,
  progress,
  stats,
  isComplete,
  findings,
  logs,
}: ScannerTopBarProps) {
  const [pasting, setPasting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePaste = async () => {
    try {
      setPasting(true);
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onUpdate("target", text.trim());
        onUpdate("listFile", "");
      }
    } finally {
      setPasting(false);
    }
  };

  const isRunning = scanStatus === "running";
  const isStopping = scanStatus === "stopping";
  const hasTarget = !!(config.target || config.listFile);

  const dotColor =
    scanStatus === "running"
      ? "#ff6b35"
      : scanStatus === "finished" || isComplete
      ? "#4caf50"
      : scanStatus === "error"
      ? "#f44336"
      : "#444444";

  return (
    <div style={S.root}>
      <div style={S.top}>
        <span style={S.label}>Target</span>

        <input
          ref={inputRef}
          style={S.input}
          type="text"
          placeholder="https://target.com"
          value={config.target}
          onChange={(e) => { onUpdate("target", e.target.value); onUpdate("listFile", ""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && hasTarget && !isRunning) onStart(); }}
        />

        <button
          style={S.btnSecondary}
          onClick={handlePaste}
          title="Paste from clipboard"
        >
          <ClipboardPaste size={12} />
          {pasting ? "…" : "Paste"}
        </button>

        {isRunning || isStopping ? (
          <button
            style={{
              ...S.btnDanger,
              opacity: isStopping ? 0.6 : 1,
              cursor: isStopping ? "not-allowed" : "pointer",
            }}
            onClick={onStop}
            disabled={isStopping}
          >
            <Square size={12} />
            {isStopping ? "Stopping…" : "Abort"}
          </button>
        ) : (
          <button
            style={{
              ...S.btnPrimary,
              opacity: hasTarget ? 1 : 0.4,
              cursor: hasTarget ? "pointer" : "not-allowed",
            }}
            onClick={onStart}
            disabled={!hasTarget}
          >
            <Play size={12} />
            Launch
          </button>
        )}
      </div>

      <div style={S.progressBar}>
        <div style={{ ...S.progressFill, width: `${progress}%` }} />
      </div>

      <div style={S.statRow}>
        <div style={S.statItem}>
          <div style={{ ...S.statusDot, background: dotColor }} />
          <span style={S.statKey}>Status</span>
          <span style={S.statVal}>{scanStatus.toUpperCase()}</span>
        </div>
        <div style={S.statItem}>
          <span style={S.statKey}>Findings</span>
          <span style={{ ...S.statVal, color: findings > 0 ? "#ff4444" : "#e0e0e0" }}>{findings}</span>
        </div>
        <div style={S.statItem}>
          <span style={S.statKey}>Logs</span>
          <span style={S.statVal}>{logs}</span>
        </div>
        <div style={S.statItem}>
          <span style={S.statKey}>URLs</span>
          <span style={S.statVal}>{stats?.urls ?? 0}</span>
        </div>
        <div style={S.statItem}>
          <span style={S.statKey}>Critical</span>
          <span style={{ ...S.statVal, color: (stats?.critical ?? 0) > 0 ? "#ff4444" : "#e0e0e0" }}>
            {stats?.critical ?? 0}
          </span>
        </div>
        <div style={S.statItemLast}>
          <span style={S.statKey}>Elapsed</span>
          <span style={S.statVal}>{stats?.elapsed ?? "—"}</span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {stats && (
            <button
              style={S.btnSecondary}
              onClick={() => {
                const blob = new Blob([JSON.stringify(stats, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "scan-stats.json"; a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={11} />
              Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
