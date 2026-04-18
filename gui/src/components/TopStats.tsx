import { CpuIcon, GlobeIcon, ShieldIcon, EyeIcon, NetworkIcon, TimerIcon, ActivityIcon, BoltIcon, CheckCircleIcon, TargetIcon } from "./icons";
import { useState, useEffect, useRef, type ElementType } from "react";
import type { ScanStatsEvent, ScanStatus } from "../types";
import { t } from "../utils/i18n";

export type StudioStatsEvent = {
  status: string;
  time: string;
  reqSize: string;
  resSize: string;
  phase: number;
};

/* ─── E3: Animated number counter hook ──────────────────────────── */
function useAnimatedNumber(value: number): number {
  const displayedRef = useRef(value);
  const [displayed, setDisplayed] = useState(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = displayedRef.current;
    if (from === value) return;
    cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / 600, 1);
      const eased = 1 - (1 - t) ** 3;
      const cur = Math.round(from + (value - from) * eased);
      displayedRef.current = cur;
      setDisplayed(cur);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  useEffect(() => { displayedRef.current = displayed; });
  return displayed;
}

/* ─── E1: RPS Sparkline ──────────────────────────────────────────── */
function Sparkline({ values }: { values: number[] }) {
  const W = 48, H = 16;
  const max = Math.max(...values, 1);
  const allZero = values.every(v => v === 0);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - (v / max) * (H - 2) - 1}`)
    .join(" ");
  return (
    <svg width={W} height={H} className="mt-1 block">
      <polyline
        points={allZero ? `0,${H / 2} ${W},${H / 2}` : pts}
        fill="none"
        stroke={allZero ? "rgba(255,255,255,0.10)" : "var(--color-accent)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── StatCard — redesigned to match Studio density ─────────────── */
// TASK 3: Replaced rounded-xl bg-bg-card card with sharp flat 1px border panel
function StatCard({ label, value, icon: Icon, accent, animate, children }: {
  label: string;
  value: string | number;
  icon: ElementType;
  accent?: 'default' | 'critical' | 'warning' | 'success' | 'rps-low' | 'rps-med' | 'rps-high' | 'studio-info';
  animate?: boolean;
  children?: React.ReactNode;
}) {
  const numVal = typeof value === 'number' ? value : 0;
  const animatedNum = useAnimatedNumber(numVal);
  const displayValue = animate && typeof value === 'number' ? animatedNum : value;

  const accentColor: Record<string, string> = {
    default: 'var(--color-text-primary)',
    critical: 'var(--color-status-critical)',
    warning: 'var(--color-status-warning)',
    success: 'var(--color-status-success)',
    'rps-low': 'var(--color-status-success)',
    'rps-med': 'var(--color-status-warning)',
    'rps-high': 'var(--color-status-critical)',
    'studio-info': 'var(--color-accent)',
  };

  const color = accentColor[accent ?? 'default'];

  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-panel)] min-w-0 hover:border-[color:var(--color-border-hover)] transition-colors">
      <Icon
        size={13}
        strokeWidth={1.5}
        style={{ color, opacity: 0.8 }}
        className="shrink-0"
      />
      <div className="flex flex-col min-w-0 leading-none gap-1">
        <span
          className="font-mono uppercase truncate"
          style={{
            fontSize: 'var(--fs-label)',
            letterSpacing: 'var(--tr-label)',
            color: 'var(--color-text-muted)',
          }}
        >
          {label}
        </span>
        <span
          className="font-mono tabular-nums font-semibold stat-value"
          style={{ fontSize: 'var(--fs-value)', color }}
          dir="ltr"
        >
          {displayValue}
        </span>
      </div>
      {children}
    </div>
  );
}


/* ─── E2: Phase Timeline — always visible, no pop ───────────────── */
const PHASES = [
  { label: "Crawl",    Icon: GlobeIcon },
  { label: "Nuclei",   Icon: BoltIcon },
  { label: "Engine",   Icon: CpuIcon },
  { label: "Complete", Icon: CheckCircleIcon },
];

function getPhaseIndex(progress: number): number {
  if (progress >= 75) return 2;
  if (progress >= 50) return 1;
  if (progress >= 20) return 0;
  return 0;
}

// TASK 3: Reduced circle sizes w-11 h-11 → w-9 h-9, icon size 20→14, connecting line w-24→flex-1 max-w-[120px]
function PhaseTimeline({ progress, scanning }: { progress: number; scanning: boolean }) {
  const activePhase = scanning ? getPhaseIndex(progress) : -1;

  return (
    <div className={`flex items-center justify-center py-2 transition-opacity duration-500 ${scanning ? "opacity-100" : "opacity-25"}`}>
      {PHASES.map((phase, idx) => {
        const isActive = idx === activePhase;
        const isDone = idx < activePhase;

        return (
          <div key={phase.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all duration-500 ${
                isActive  ? "border-accent bg-accent/15 shadow-[0_0_10px_var(--color-accent-dim)] scale-110"
                : isDone  ? "border-status-success bg-status-success/10"
                          : "border-border-subtle bg-bg-card"
              }`}>
                {isDone
                  ? <CheckCircleIcon size={14} className="text-status-success" strokeWidth={1.5} />
                  : <phase.Icon size={14} className={isActive ? "text-accent-text" : "text-text-ghost"} strokeWidth={1.5} />
                }
              </div>
              <span
                className={`font-bold uppercase transition-colors duration-500 ${
                  isActive ? "text-accent-text" : isDone ? "text-status-success" : "text-text-ghost"
                }`}
                style={{ fontSize: 'var(--fs-label)' }}
              >
                {phase.label}
              </span>
            </div>
            {idx < PHASES.length - 1 && (
              <div className={`h-px flex-1 max-w-[120px] mb-4 mx-2 transition-colors duration-700 ${isDone ? "bg-status-success" : isActive ? "bg-accent/40" : "bg-border-subtle"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── YouTube-style thin progress bar ───────────────────────────── */
export function ThinProgressBar({ progress, status }: { progress: number; status: ScanStatus }) {
  const [visible, setVisible] = useState(status !== "idle");
  const [opacity, setOpacity] = useState(status !== "idle" ? 1 : 0);
  const prevStatus = useRef(status);

  useEffect(() => {
    if (status === "idle" && prevStatus.current !== "idle") {
      setOpacity(0);
      const t = window.setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(t);
    } else if (status !== "idle") {
      setVisible(true);
      setOpacity(1);
    }
    prevStatus.current = status;
  }, [status]);

  if (!visible) return null;

  const fillColor =
    status === "error"    ? "bg-status-critical" :
    status === "finished" ? "bg-status-success"  :
                            "bg-accent";

  const isRunning = status === "running";

  return (
    <div
      className="w-full h-[3px] bg-transparent overflow-hidden"
      style={{ opacity, transition: "opacity 0.6s ease" }}
    >
      <div
        className={`h-full ${fillColor} transition-all duration-700 ease-out ${isRunning ? "progress-bar-running" : ""}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

/* ─── TopStats ───────────────────────────────────────────────────── */
export function TopStats({ stats, scanStatus, scanProgress, rps = 0, language: _language = "en", activeTab }: {
  stats: ScanStatsEvent;
  scanStatus: ScanStatus;
  scanProgress: number;
  rps?: number;
  language?: string;
  activeTab?: string;
}) {
  // E1: Rolling RPS history buffer
  const [rpsHistory, setRpsHistory] = useState<number[]>(() => Array(20).fill(0));

  useEffect(() => {
    setRpsHistory(prev => [...prev.slice(1), scanStatus === "running" ? rps : 0]);
  }, [rps, scanStatus]);

  const rpsAccent = scanStatus !== "running" ? "default" : rps > 200 ? "rps-high" : rps > 50 ? "rps-med" : "rps-low";
  const isScanning = scanStatus === "running";

  // Studio tab is handled by StatusStrip — TopStats only renders the scanner stats grid.
  if (activeTab === 'studio') return null;

  return (
    <div className="shrink-0 flex flex-col">
      {/* TASK 3: Responsive grid — cards wrap at narrow widths instead of truncating labels */}
      <div
        className="gap-2 px-4 pt-3 pb-2"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
      >
        <StatCard label={t("targets")} value={stats.targets} icon={TargetIcon} animate />
        <StatCard label={t("urls")} value={stats.urls} icon={GlobeIcon} animate />
        <StatCard label={t("critical")} value={stats.critical} icon={ShieldIcon} accent={stats.critical > 0 ? "critical" : "default"} animate />
        <StatCard label={t("medium")} value={stats.medium} icon={EyeIcon} accent={stats.medium > 0 ? "warning" : "default"} animate />
        <StatCard label={t("safe")} value={stats.safe} icon={NetworkIcon} accent={stats.safe > 0 ? "success" : "default"} animate />
        <StatCard label={t("elapsed")} value={stats.elapsed} icon={TimerIcon} />
        <StatCard
          label="req/s"
          value={scanStatus === "running" ? rps : "—"}
          icon={ActivityIcon}
          accent={rpsAccent}
        >
          <Sparkline values={rpsHistory} />
        </StatCard>
      </div>
      <PhaseTimeline progress={scanProgress} scanning={isScanning} />
    </div>
  );
}
