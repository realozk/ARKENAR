import { useEffect, useState } from "react";
import { TrashIcon } from "./icons";
import type { ScanConfig } from "../types";

// Re-use the same event shape that TopStats exported
export type StudioStatsEvent = {
  status: string;
  time: string;
  reqSize: string;
  resSize: string;
  phase: number;
};

interface StatusStripProps {
  config: Pick<ScanConfig, "target" | "proxy">;
  onClearFindings: () => void;
}

export function StatusStrip({ config, onClearFindings }: StatusStripProps) {
  const [stats, setStats] = useState<StudioStatsEvent>({
    status: "Idle",
    time: "—",
    reqSize: "0 KB",
    resSize: "0 KB",
    phase: 0,
  });

  useEffect(() => {
    const handler = (e: CustomEvent<StudioStatsEvent>) => setStats(e.detail);
    window.addEventListener("studio-stats", handler as EventListener);
    return () => window.removeEventListener("studio-stats", handler as EventListener);
  }, []);

  // Determine status color
  const statusColor =
    stats.status === "Idle"
      ? "var(--color-text-muted)"
      : stats.status.startsWith("2")
        ? "var(--color-status-success)"
        : stats.status.startsWith("4") || stats.status.startsWith("5")
          ? "var(--color-status-critical)"
          : "var(--color-status-warning)";

  const scope = config.target ? (() => {
    try { return new URL(config.target).hostname; } catch { return config.target; }
  })() : "—";

  const proxy = config.proxy || "—";

  const isDraft = stats.phase === 0;

  return (
    <div
      className="h-6 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center justify-between px-3 mono text-[10px] tracking-[0.14em] select-none"
      style={{ background: "var(--color-bg-root-2)" }}
    >
      {/* LEFT: state indicators + stat pills */}
      <div className="flex items-center gap-4">
        {/* DRAFT dot */}
        <span
          className="flex items-center gap-1.5"
          style={{ color: isDraft ? "var(--color-accent)" : "var(--color-text-muted)" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: isDraft ? "var(--color-accent)" : "var(--color-text-muted)" }}
          />
          DRAFT
        </span>

        <span className="text-[color:var(--color-text-muted)]">· UNSAVED</span>
        <span className="text-[color:var(--color-text-muted)]">· UNSENT</span>
        <span className="text-[color:var(--color-text-muted)]">· MUTATED</span>

        <span className="text-[color:var(--color-text-muted)]">
          STATUS{" "}
          <span style={{ color: statusColor }}>{stats.status}</span>
        </span>
        <span className="text-[color:var(--color-text-muted)]">
          TIME{" "}
          <span className="text-[color:var(--color-text-primary)]">{stats.time || "—"}</span>
        </span>
        <span className="text-[color:var(--color-text-muted)]">
          REQ{" "}
          <span className="text-[color:var(--color-text-primary)]">{stats.reqSize}</span>
        </span>
        <span className="text-[color:var(--color-text-muted)]">
          RPS{" "}
          <span className="text-[color:var(--color-text-primary)]">{stats.resSize}</span>
        </span>
      </div>

      {/* RIGHT: scope, proxy, clear */}
      <div className="flex items-center gap-3">
        <span className="text-[color:var(--color-text-muted)]">
          scope{" "}
          <span className="text-[color:var(--color-text-primary)]">{scope}</span>
        </span>
        <span className="text-[color:var(--color-text-muted)]">
          proxy{" "}
          <span className="text-[color:var(--color-text-primary)]">{proxy}</span>
        </span>
        <button
          onClick={onClearFindings}
          className="h-5 px-2 border border-[color:var(--color-border-subtle)] rounded-sm flex items-center gap-1.5 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] transition-colors"
        >
          <TrashIcon size={10} />
          <span>Clear Findings</span>
        </button>
      </div>
    </div>
  );
}
