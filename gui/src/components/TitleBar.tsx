import { getCurrentWindow } from "@tauri-apps/api/window";
import { StatusDot } from "./primitives";
import {
  BasicIcon, StudioIcon, ReconIcon,
  SidebarIcon, InfoIcon, CogIcon,
  MinimizeIcon, MaximizeIcon, CloseIcon, BoltIcon,
} from "./icons";
import { t } from "../utils/i18n";
import type { ScanStatus, ScanConfig } from "../types";

// Mirror the exact ActiveTab union from App so we don't import across the boundary.
type ActiveTab = "terminal" | "findings" | "history" | "studio" | "recon" | "sitemap";

interface TitleBarProps {
  isMac: boolean | null;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean | ((p: boolean) => boolean)) => void;
  scanStatus: ScanStatus;
  scanQueue: string[];
  config: Pick<ScanConfig, "target" | "listFile">;
  handleStartScan: () => void;
  handleStopScan: () => void;
  isHoldingSpace: boolean;
  isHoldingStop: boolean;
  holdTimeRemaining: number;
  onOpenSettings: () => void;
  onOpenInfo: () => void;
}

// Which "section" tab is active
type Section = "basic" | "studio" | "recon";

function activeSection(tab: ActiveTab): Section {
  if (tab === "studio") return "studio";
  if (tab === "recon") return "recon";
  return "basic";
}

function setSection(section: Section, setActiveTab: (t: ActiveTab) => void) {
  if (section === "studio") setActiveTab("studio");
  else if (section === "recon") setActiveTab("recon");
  else setActiveTab("terminal");
}

const TABS: { key: Section; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: "basic",  label: "BASIC",  Icon: BasicIcon  },
  { key: "studio", label: "STUDIO", Icon: StudioIcon },
  { key: "recon",  label: "RECON",  Icon: ReconIcon  },
];

export function TitleBar({
  isMac,
  activeTab,
  setActiveTab,
  sidebarCollapsed: _sidebarCollapsed,
  setSidebarCollapsed,
  scanStatus,
  scanQueue,
  config,
  handleStartScan,
  handleStopScan,
  isHoldingSpace,
  isHoldingStop,
  holdTimeRemaining,
  onOpenSettings,
  onOpenInfo,
}: TitleBarProps) {
  const section = activeSection(activeTab);
  const hasTarget = !!(config.target || config.listFile);
  const isRunning = scanStatus === "running";
  const isStopping = scanStatus === "stopping";

  // ── Icon toolbar (sidebar, info, cog) ─────────────────────────────
  const IconButtons = (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => setSidebarCollapsed(p => !p)}
        aria-label="Toggle sidebar"
        className="w-6 h-6 flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-hover)] rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
      >
        <SidebarIcon size={13} />
      </button>
      <button
        onClick={onOpenInfo}
        aria-label="App info"
        className="w-6 h-6 flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-hover)] rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
      >
        <InfoIcon size={13} />
      </button>
      <button
        onClick={onOpenSettings}
        aria-label="Settings"
        className="w-6 h-6 flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-hover)] rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
      >
        <CogIcon size={13} />
      </button>
    </div>
  );

  // ── macOS traffic light spacer — when titleBarStyle:Overlay is active,
  //    the OS draws the native traffic lights (red/yellow/green) at the
  //    position set by trafficLightPosition in tauri.conf.json (x:14, y:16).
  //    We reserve that space with a spacer so content doesn't collide.
  //    Width 78px = 3 × (~12px button + 7px gap) + left padding left-room.
  const MacSpacer = (
    <div style={{ width: 78, height: '100%', flexShrink: 0 }} aria-hidden="true" />
  );

  // ── Non-Mac window controls (right side) ───────────────────────────
  const WindowControls = (
    <div className="flex items-stretch">
      <button
        onClick={() => getCurrentWindow().minimize()}
        title="Minimize"
        className="w-8 h-7 flex items-center justify-center text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-hover)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
      >
        <MinimizeIcon size={12} />
      </button>
      <button
        onClick={() => getCurrentWindow().toggleMaximize()}
        title="Maximize / Restore"
        className="w-8 h-7 flex items-center justify-center text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-hover)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
      >
        <MaximizeIcon size={10} />
      </button>
      <button
        onClick={() => getCurrentWindow().close()}
        title="Close"
        className="w-8 h-7 flex items-center justify-center text-[color:var(--color-text-muted)] hover:bg-[#e81123] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );

  // ── Status + action button ─────────────────────────────────────────
  const StatusAndAction = (
    <div className="flex items-center gap-2">
      {/* Queue badge */}
      {scanQueue.length > 0 && (
        <span className="rounded-sm border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-panel)] px-2 py-0.5 font-mono uppercase"
              style={{ fontSize: 'var(--fs-chrome)', letterSpacing: 'var(--tr-heavy)', color: 'var(--color-text-secondary)' }}>
          {t("queue")}: {scanQueue.length}
        </span>
      )}

      {/* Status dot + label */}
      <div className="flex items-center gap-1.5 font-mono"
           style={{ fontSize: 'var(--fs-chrome)', letterSpacing: 'var(--tr-chrome)' }}>
        <StatusDot status={scanStatus} className="h-2 w-2" />
        <span
          key={scanStatus}
          className="uppercase text-[color:var(--color-text-muted)] animate-fade-slide-in"
        >
          {t(scanStatus === "error" ? "scanError" : scanStatus)}
        </span>
      </div>

      {/* Scan action button */}
      {isRunning || isStopping ? (
        <button
          onClick={handleStopScan}
          disabled={isStopping}
          className={`relative overflow-hidden h-7 px-3 flex items-center gap-1.5 rounded-sm font-mono uppercase font-semibold text-white transition-all duration-300 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white ${
            isStopping
              ? "bg-[color:var(--color-status-warning)] text-black cursor-not-allowed opacity-80"
              : `bg-[color:var(--color-status-critical)] hover:brightness-110 ${isHoldingStop ? "animate-pulse scale-105" : ""}`
          }`}
          style={{ fontSize: 'var(--fs-chrome)', letterSpacing: 'var(--tr-chrome)' }}
        >
          {isStopping ? (
            <>
              <svg width="8" height="10" viewBox="0 0 12 14" fill="currentColor" className="shrink-0">
                <rect x="0" y="0" width="4" height="14" rx="1" />
                <rect x="8" y="0" width="4" height="14" rx="1" />
              </svg>
              {t("stopping")}
            </>
          ) : (
            <>
              {isHoldingStop && (
                <div
                  className="absolute inset-x-0 bottom-0 h-1 bg-white/40 transition-all duration-100 ease-linear"
                  style={{ width: `${((1 - holdTimeRemaining) / 1) * 100}%` }}
                />
              )}
              <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              {t("stopScan")}
              {isHoldingStop && <span className="ml-1 opacity-70">({holdTimeRemaining.toFixed(1)}s)</span>}
            </>
          )}
        </button>
      ) : (
        <button
          onClick={handleStartScan}
          disabled={!hasTarget}
          title="Execute engine"
          className={`relative overflow-hidden h-7 px-3 flex items-center gap-1.5 rounded-sm font-mono uppercase font-semibold text-white transition-all duration-300 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)] ${
            hasTarget
              ? `${isHoldingSpace ? "scale-105" : "hover:brightness-110"}`
              : "bg-[color:var(--color-bg-panel)] text-[color:var(--color-text-ghost)] cursor-not-allowed border border-[color:var(--color-border-subtle)]"
          }`}
          style={hasTarget ? {
            backgroundColor: "var(--color-accent)",
            // TASK 6: Reduced glow intensity from 0.20 to 0.15
            boxShadow: isHoldingSpace
              ? "0 0 18px rgba(249,115,22,0.45)"
              : "0 0 8px rgba(249,115,22,0.15)",
            fontSize: 'var(--fs-chrome)',
            letterSpacing: 'var(--tr-chrome)',
          } : { fontSize: 'var(--fs-chrome)', letterSpacing: 'var(--tr-chrome)' }}
        >
          {isHoldingSpace && (
            <div
              className="absolute inset-x-0 bottom-0 h-1 bg-white/40 transition-all duration-100 ease-linear"
              style={{ width: `${((2 - holdTimeRemaining) / 2) * 100}%` }}
            />
          )}
          <BoltIcon size={11} />
          {isHoldingSpace
            ? `${t("ready")} (${holdTimeRemaining.toFixed(1)}s)`
            : "EXECUTE ENGINE"}
        </button>
      )}
    </div>
  );

  // ── Segmented tab control (centered) ──────────────────────────────
  const SegmentedControl = (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div
        className="flex items-stretch rounded border border-[color:var(--color-border-subtle)]"
        style={{ background: "var(--color-bg-root)" }}
      >
        {TABS.map(({ key, label, Icon }) => {
          const on = section === key;
          return (
            <button
              key={key}
              onClick={() => setSection(key, setActiveTab)}
              aria-pressed={on}
              className={
                "relative px-4 h-7 flex items-center gap-1.5 font-mono transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)] " +
                (on
                  ? "text-[color:var(--color-accent-hover)]"
                  : "text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)]")
              }
              style={{
                fontSize: 'var(--fs-chrome)',
                letterSpacing: 'var(--tr-chrome)',
                background: on ? "rgba(249,115,22,0.12)" : undefined,
              }}
            >
              <Icon size={12} className={on ? "text-[color:var(--color-accent)]" : ""} />
              <span>{label}</span>
              {/* active underline */}
              {on && (
                <span
                  className="absolute inset-x-2 bottom-0 h-px"
                  style={{ background: "var(--color-accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Loading placeholder (isMac null — before platform detect) ─────
  if (isMac === null) {
    return (
      <div
        data-tauri-drag-region
        className="h-11 shrink-0 border-b border-[color:var(--color-border-subtle)] select-none"
        style={{ background: "var(--color-bg-root-2)" }}
      />
    );
  }

  return (
    <header
      data-tauri-drag-region
      className="relative h-11 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center select-none z-10 chrome"
      style={{ background: "var(--color-bg-root-2)" }}
    >
      {/* LEFT: mac spacer (OS draws traffic lights) OR left padding + icon buttons + wordmark */}
      <div className="flex items-center shrink-0">
        {/*
          TASK 1: On macOS with titleBarStyle:"Overlay", the OS renders the native
          traffic lights (red/yellow/green) at trafficLightPosition (x:14, y:16).
          We DO NOT render our own traffic-light buttons — instead we use a 78px spacer
          that reserves the same horizontal space so content doesn't overlap the OS chrome.
          On non-macOS, we use a small left-padding div and show WindowControls on the right.
        */}
        {isMac ? MacSpacer : <div className="pl-3" />}
        <div className="flex items-center gap-0.5 pl-1 pr-2">
          {IconButtons}
        </div>
        <div className="pr-3">
          <span
            className="font-mono font-bold"
            style={{
              fontSize: 'var(--fs-chrome)',
              letterSpacing: 'var(--tr-heavy)',
              color: "var(--color-accent)",
            }}
          >
            ARKENAR
          </span>
        </div>
      </div>

      {/* CENTER: tab segmented control */}
      {SegmentedControl}

      {/* SPACER */}
      <div className="flex-1" />

      {/* RIGHT: status + action + window controls (non-mac only) */}
      <div className="flex items-center gap-2 pr-2">
        {StatusAndAction}
        {!isMac && WindowControls}
      </div>
    </header>
  );
}
