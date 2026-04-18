import { useState, useRef } from "react";
import type { ScanConfig, ScanStatus, ScanStatsEvent } from "../../types";
import {
  PlayIcon,
  StopIcon,
  ClipboardIcon,
  DownloadIcon,
} from "../icons";

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

  /* Status dot color via CSS tokens */
  const dotColor =
    scanStatus === "running"
      ? "var(--color-accent)"
      : scanStatus === "finished" || isComplete
      ? "var(--color-status-success)"
      : scanStatus === "error"
      ? "var(--color-status-critical)"
      : "var(--color-border-hover)";

  return (
    <div
      className="shrink-0 flex flex-col border-b border-[color:var(--color-border-subtle)]"
      style={{ background: "var(--color-bg-panel)" }}
    >
      {/* ── Target row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="mono text-[10px] font-bold tracking-[0.18em] uppercase text-[color:var(--color-accent)] shrink-0">
          Target
        </span>

        <input
          ref={inputRef}
          type="text"
          placeholder="https://target.com"
          value={config.target}
          onChange={(e) => {
            onUpdate("target", e.target.value);
            onUpdate("listFile", "");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hasTarget && !isRunning) onStart();
          }}
          className="flex-1 min-w-0 h-7 px-2.5 mono text-[11.5px] rounded-sm
            bg-[color:var(--color-bg-root)] border border-[color:var(--color-border-subtle)]
            text-[color:var(--color-text-primary)] placeholder-[color:var(--color-text-ghost)]
            outline-none focus:border-[color:var(--color-accent)]
            transition-colors duration-150"
        />

        {/* Paste button */}
        <button
          onClick={handlePaste}
          title="Paste from clipboard"
          className="h-7 px-2.5 flex items-center gap-1.5 rounded-sm mono text-[10px]
            tracking-[0.14em] uppercase
            bg-[color:var(--color-bg-root)] border border-[color:var(--color-border-subtle)]
            text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)]
            hover:border-[color:var(--color-border-hover)] transition-colors duration-150"
        >
          <ClipboardIcon size={11} />
          {pasting ? "…" : "Paste"}
        </button>

        {/* Start / Abort */}
        {isRunning || isStopping ? (
          <button
            onClick={onStop}
            disabled={isStopping}
            className="h-7 px-3 flex items-center gap-1.5 rounded-sm mono text-[10px]
              tracking-[0.14em] uppercase font-bold
              border border-[color:var(--color-status-critical)]
              text-[color:var(--color-status-critical)]
              hover:bg-[color:var(--color-status-critical)]/5 transition-colors duration-150"
            style={{ opacity: isStopping ? 0.6 : 1, cursor: isStopping ? "not-allowed" : "pointer" }}
          >
            <StopIcon size={11} />
            {isStopping ? "Stopping…" : "Abort"}
          </button>
        ) : (
          <button
            onClick={onStart}
            disabled={!hasTarget}
            className="h-7 px-3 flex items-center gap-1.5 rounded-sm mono text-[10px]
              tracking-[0.14em] uppercase font-bold text-white
              transition-colors duration-150"
            style={{
              background: "var(--color-accent)",
              opacity: hasTarget ? 1 : 0.4,
              cursor: hasTarget ? "pointer" : "not-allowed",
            }}
          >
            <PlayIcon size={11} />
            Launch
          </button>
        )}
      </div>

      {/* ── Progress bar ───────────────────────────────────────────── */}
      <div
        className="h-0.5 relative overflow-hidden"
        style={{ background: "var(--color-bg-root)" }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-300"
          style={{ width: `${progress}%`, background: "var(--color-accent)" }}
        />
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-0 px-4 py-1.5 border-t border-[color:var(--color-border-subtle)] mono text-[10px]"
      >
        {/* Status with dot */}
        <div className="flex items-center gap-1.5 pr-4 mr-4 border-r border-[color:var(--color-border-subtle)]">
          <span
            className="w-[7px] h-[7px] rounded-full shrink-0"
            style={{ background: dotColor }}
          />
          <span className="tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">Status</span>
          <span className="tracking-[0.06em] text-[color:var(--color-text-primary)] font-semibold">
            {scanStatus.toUpperCase()}
          </span>
        </div>

        {/* Findings */}
        <div className="flex items-center gap-1.5 pr-4 mr-4 border-r border-[color:var(--color-border-subtle)]">
          <span className="tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">Findings</span>
          <span
            className="tracking-[0.06em] font-semibold"
            style={{ color: findings > 0 ? "var(--color-status-critical)" : "var(--color-text-primary)" }}
          >
            {findings}
          </span>
        </div>

        {/* Logs */}
        <div className="flex items-center gap-1.5 pr-4 mr-4 border-r border-[color:var(--color-border-subtle)]">
          <span className="tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">Logs</span>
          <span className="tracking-[0.06em] text-[color:var(--color-text-primary)] font-semibold">{logs}</span>
        </div>

        {/* URLs */}
        <div className="flex items-center gap-1.5 pr-4 mr-4 border-r border-[color:var(--color-border-subtle)]">
          <span className="tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">URLs</span>
          <span className="tracking-[0.06em] text-[color:var(--color-text-primary)] font-semibold">{stats?.urls ?? 0}</span>
        </div>

        {/* Critical */}
        <div className="flex items-center gap-1.5 pr-4 mr-4 border-r border-[color:var(--color-border-subtle)]">
          <span className="tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">Critical</span>
          <span
            className="tracking-[0.06em] font-semibold"
            style={{
              color: (stats?.critical ?? 0) > 0 ? "var(--color-status-critical)" : "var(--color-text-primary)",
            }}
          >
            {stats?.critical ?? 0}
          </span>
        </div>

        {/* Elapsed */}
        <div className="flex items-center gap-1.5">
          <span className="tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">Elapsed</span>
          <span className="tracking-[0.06em] text-[color:var(--color-text-primary)] font-semibold">
            {stats?.elapsed ?? "—"}
          </span>
        </div>

        {/* Export — pushed right */}
        <div className="ml-auto flex gap-1.5">
          {stats && (
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(stats, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "scan-stats.json"; a.click();
                URL.revokeObjectURL(url);
              }}
              className="h-5 px-2 flex items-center gap-1 rounded-sm
                border border-[color:var(--color-border-subtle)]
                text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)]
                hover:border-[color:var(--color-border-hover)] transition-colors duration-150"
            >
              <DownloadIcon size={10} />
              Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
