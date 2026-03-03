import { Crosshair, Globe, Shield, Eye, Network, Timer } from "lucide-react";
import type { ScanStatsEvent } from "../types";

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
    <div className="rounded-xl border border-border-subtle bg-bg-card p-5 transition-all duration-200 hover:bg-bg-hover hover:border-border-hover group">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-text-muted group-hover:text-text-secondary transition-colors duration-200" strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</span>
      </div>
      <span className={`stat-value font-mono text-3xl font-bold tracking-tight ${valueClass[accent ?? "default"]}`}>
        {value}
      </span>
    </div>
  );
}

export function TopStats({ stats }: { stats: ScanStatsEvent }) {
  return (
    <div className="shrink-0 p-6 pb-4">
      <div className="grid grid-cols-6 gap-3">
        <StatCard label="Targets" value={stats.targets} icon={Crosshair} />
        <StatCard label="URLs" value={stats.urls} icon={Globe} />
        <StatCard label="Critical" value={stats.critical} icon={Shield} accent={stats.critical > 0 ? "critical" : "default"} />
        <StatCard label="Medium" value={stats.medium} icon={Eye} accent={stats.medium > 0 ? "warning" : "default"} />
        <StatCard label="Safe" value={stats.safe} icon={Network} accent={stats.safe > 0 ? "success" : "default"} />
        <StatCard label="Elapsed" value={stats.elapsed} icon={Timer} />
      </div>
    </div>
  );
}
