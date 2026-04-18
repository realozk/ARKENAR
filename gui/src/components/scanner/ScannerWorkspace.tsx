import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScanConfig, ScanFindingEvent, ScanStatus } from "../../types";
import { useScannerEvents } from "./useScannerEvents";
import ScannerTopBar from "./ScannerTopBar";
import ScannerConfig from "./ScannerConfig";
import ScannerFindings from "./ScannerFindings";
import ScannerTerminal from "./ScannerTerminal";

type PanelTab = "terminal" | "findings";

interface ScannerWorkspaceProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  scanStatus: ScanStatus;
  onScanStatusChange: (s: ScanStatus) => void;
  onSendToStudio: (finding: ScanFindingEvent) => void;
  webhookUrl?: string;
}

/* ── Tab bar button ────────────────────────────────────────────────────── */
function TabBtn({
  active,
  onClick,
  badge,
  badgeCritical,
  children,
}: {
  active: boolean;
  onClick: () => void;
  badge?: number;
  badgeCritical?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3.5 h-8 mono text-[11px] font-bold tracking-[0.14em] uppercase cursor-pointer border-none transition-colors duration-150 border-b-2 ${
        active
          ? "bg-[color:var(--color-accent)]/5 text-[color:var(--color-accent-hover)] border-b-[color:var(--color-accent)]"
          : "bg-transparent text-[color:var(--color-text-ghost)] border-b-transparent"
      }`}
      style={{ marginBottom: -1 }}
    >
      {children}
      {!!badge && badge > 0 && (
        <span
          className={`mono text-[10px] px-1 py-px rounded-sm ${
            badgeCritical
              ? "bg-[color:var(--color-status-critical)]/10 text-[color:var(--color-status-critical)]"
              : "bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent-hover)]"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
export default function ScannerWorkspace({
  config,
  onUpdate,
  scanStatus,
  onScanStatusChange,
  onSendToStudio,
  webhookUrl,
}: ScannerWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("terminal");
  const { logs, findings, progress, stats, isComplete, resetSession } = useScannerEvents();

  const handleStart = useCallback(async () => {
    if (!config.target && !config.listFile) return;
    onScanStatusChange("running");
    resetSession();
    setActiveTab("terminal");
    try {
      await invoke("start_scan", {
        config: { ...config, webhookUrl: webhookUrl || undefined },
      });
    } catch (err: unknown) {
      onScanStatusChange("error");
    }
  }, [config, webhookUrl, onScanStatusChange, resetSession]);

  const handleStop = useCallback(async () => {
    try {
      onScanStatusChange("stopping");
      await invoke("stop_scan");
    } catch {
      onScanStatusChange("idle");
    }
  }, [onScanStatusChange]);

  const effectiveStatus: ScanStatus = isComplete && scanStatus === "running" ? "finished" : scanStatus;

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ background: "var(--color-bg-root)" }}
    >
      {/* Top bar with target + stats */}
      <ScannerTopBar
        config={config}
        onUpdate={onUpdate}
        scanStatus={effectiveStatus}
        onStart={handleStart}
        onStop={handleStop}
        progress={progress}
        stats={stats}
        isComplete={isComplete}
        findings={findings.length}
        logs={logs.length}
      />

      {/* Body: config sidebar + main panel */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        <ScannerConfig config={config} onUpdate={onUpdate} />

        {/* Main panel */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Tab bar */}
          <div
            className="flex items-end px-3 border-b border-[color:var(--color-border-subtle)] shrink-0"
            style={{ background: "var(--color-bg-panel)" }}
          >
            <TabBtn
              active={activeTab === "terminal"}
              onClick={() => setActiveTab("terminal")}
              badge={logs.length}
            >
              Terminal
            </TabBtn>
            <TabBtn
              active={activeTab === "findings"}
              onClick={() => setActiveTab("findings")}
              badge={findings.length}
              badgeCritical
            >
              Findings
            </TabBtn>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === "terminal" && <ScannerTerminal logs={logs} />}
            {activeTab === "findings" && (
              <ScannerFindings findings={findings} onSendToStudio={onSendToStudio} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
