import { Crosshair, Globe, Shield, Eye, Network, Timer } from "lucide-react";
import type { ScanStatsEvent, ScanStatus } from "../types";

function StatCard({ label, value, icon: Icon, accent }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent?: "default" | "critical" | "warning" | "success";
}) {
  const valueClass: Record<string, string> = {
    default: "text-text-primary",
    critical: "text-status-critical",
    warning: "text-status-warning",
    success: "text-status-success",
  };

  return (
    <div className="stat-card rounded-xl border border-border-subtle bg-bg-card p-5 transition-all duration-200 hover:bg-bg-hover hover:border-border-hover group">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-text-muted group-hover:text-text-secondary transition-colors duration-200" strokeWidth={2.5} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      </div>
      <span className={`stat-value font-mono text-2xl font-bold tracking-tight ${valueClass[accent ?? "default"]}`}>
        {value}
      </span>
    </div>
  );
}

interface ScanProgressBarProps {
  progress: number;   // 0–100
  status: ScanStatus;
}

function ScanProgressBar({ progress, status }: ScanProgressBarProps) {
  if (status === "idle") return null;

  const isRunning = status === "running";
  const isFinished = status === "finished";
  const isError = status === "error";

  const trackColor = isError ? "bg-status-critical/10" : "bg-bg-card";
  const fillColor = isError
    ? "bg-status-critical"
    : isFinished
      ? "bg-status-success"
      : "bg-accent";

  return (
    <div className="flex items-center gap-3 w-full mt-1.5 opacity-95">
      {/* Wrapper without overflow-hidden so the internal box-shadow can spread */}
      <div className={`relative h-3.5 flex-1 rounded-full ${trackColor} transition-all duration-500`}>
        {/* Filled portion with overflow-hidden to clip the shimmer */}
        <div
          className={`progress-bar-fill absolute top-0 bottom-0 left-0 rounded-full transition-all duration-700 ease-out flex items-center justify-end overflow-hidden ${fillColor} ${isFinished ? "progress-bar-done" : ""} ${isRunning ? "progress-bar-running progress-bar-shimmer-bg" : ""}`}
          style={{ width: `${progress}%` }}
        >
          {progress >= 8 && (
            <span className="pr-1.5 font-mono text-[10px] font-black text-bg-root drop-shadow-sm z-10 leading-none mt-px tracking-tight">
              {Math.round(progress)}%
            </span>
          )}
        </div>
      </div>

      {/* Outside text if not wide enough to fit inside cleanly */}
      {progress < 8 && (
        <span className={`w-8 shrink-0 text-left font-mono text-[11px] font-bold ${isError ? 'text-status-critical' : isFinished ? 'text-status-success' : 'text-accent-text'} leading-none mt-px drop-shadow-sm`}>
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
}

export function TopStats({ stats, scanStatus, scanProgress }: {
  stats: ScanStatsEvent;
  scanStatus: ScanStatus;
  scanProgress: number;
}) {
  return (
    <div className="shrink-0 p-6 pb-4 space-y-3">
      <div className="grid grid-cols-6 gap-3">
        <StatCard label="Targets" value={stats.targets} icon={Crosshair} />
        <StatCard label="URLs" value={stats.urls} icon={Globe} />
        <StatCard label="Critical" value={stats.critical} icon={Shield} accent={stats.critical > 0 ? "critical" : "default"} />
        <StatCard label="Medium" value={stats.medium} icon={Eye} accent={stats.medium > 0 ? "warning" : "default"} />
        <StatCard label="Safe" value={stats.safe} icon={Network} accent={stats.safe > 0 ? "success" : "default"} />
        <StatCard label="Elapsed" value={stats.elapsed} icon={Timer} />
      </div>

      <ScanProgressBar progress={scanProgress} status={scanStatus} />
    </div>
  );
}
