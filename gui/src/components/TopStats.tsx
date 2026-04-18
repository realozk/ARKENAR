import { Crosshair, Globe, Shield, Eye, Network, Timer, Activity, Zap, CheckCircle, Cpu } from "lucide-react";
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
  const W = 56, H = 20;
  const max = Math.max(...values, 1);
  const allZero = values.every(v => v === 0);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - (v / max) * (H - 2) - 1}`)
    .join(" ");
  return (
    <svg width={W} height={H} className="mt-1.5 block mx-auto">
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

// Replace StatCard component
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
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-card border border-border-subtle hover:border-border-hover transition-all duration-200 group min-w-0">
      <Icon
        size={15}
        strokeWidth={2}
        style={{ color, opacity: 0.7 }}
        className="shrink-0"
      />
      <div className="flex flex-col min-w-0">
        <span className="text-9px font-bold uppercase tracking-widest text-text-ghost mb-0.5 truncate">
          {label}
        </span>
        <span
          className="font-mono text-sm font-bold leading-none tabular-nums"
          style={{ color }}
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
  { label: "Crawl",    Icon: Globe },
  { label: "Nuclei",   Icon: Zap },
  { label: "Engine",   Icon: Cpu },
  { label: "Complete", Icon: CheckCircle },
];

function getPhaseIndex(progress: number): number {
  if (progress >= 75) return 2;
  if (progress >= 50) return 1;
  if (progress >= 20) return 0;
  return 0;
}

function PhaseTimeline({ progress, scanning }: { progress: number; scanning: boolean }) {
  const activePhase = scanning ? getPhaseIndex(progress) : -1;

  return (
    <div className={`flex items-center justify-center py-3 transition-opacity duration-500 ${scanning ? "opacity-100" : "opacity-25"}`}>
      {PHASES.map((phase, idx) => {
        const isActive = idx === activePhase;
        const isDone = idx < activePhase;

        return (
          <div key={phase.label} className="flex items-center">
            <div className="flex flex-col items-center gap-2">
              <div className={`flex items-center justify-center w-11 h-11 rounded-full border-2 transition-all duration-500 ${
                isActive  ? "border-accent bg-accent/15 shadow-[0_0_14px_var(--color-accent-dim)] scale-110"
                : isDone  ? "border-status-success bg-status-success/10"
                          : "border-border-subtle bg-bg-card"
              }`}>
                {isDone
                  ? <CheckCircle size={20} className="text-status-success" strokeWidth={2} />
                  : <phase.Icon size={20} className={isActive ? "text-accent-text" : "text-text-ghost"} strokeWidth={2} />
                }
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors duration-500 ${
                isActive ? "text-accent-text" : isDone ? "text-status-success" : "text-text-ghost"
              }`}>{phase.label}</span>
            </div>
            {idx < PHASES.length - 1 && (
              <div className={`h-px w-24 mb-5 mx-3 transition-colors duration-700 ${isDone ? "bg-status-success" : isActive ? "bg-accent/40" : "bg-border-subtle"}`} />
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
      <div className="px-6 pt-5 pb-3 space-y-3">
        <div className="grid grid-cols-7 gap-3">
          <StatCard label={t("targets")} value={stats.targets} icon={Crosshair} animate />
          <StatCard label={t("urls")} value={stats.urls} icon={Globe} animate />
          <StatCard label={t("critical")} value={stats.critical} icon={Shield} accent={stats.critical > 0 ? "critical" : "default"} animate />
          <StatCard label={t("medium")} value={stats.medium} icon={Eye} accent={stats.medium > 0 ? "warning" : "default"} animate />
          <StatCard label={t("safe")} value={stats.safe} icon={Network} accent={stats.safe > 0 ? "success" : "default"} animate />
          <StatCard label={t("elapsed")} value={stats.elapsed} icon={Timer} />
          <StatCard
            label="req/s"
            value={scanStatus === "running" ? rps : "—"}
            icon={Activity}
            accent={rpsAccent}
          >
            <Sparkline values={rpsHistory} />
          </StatCard>
        </div>
      </div>
      <PhaseTimeline progress={scanProgress} scanning={isScanning} />
    </div>
  );
}
