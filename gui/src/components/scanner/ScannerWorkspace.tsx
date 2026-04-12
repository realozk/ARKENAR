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


const tabBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: "6px 12px 0",
  borderBottom: "1px solid #2a2a2a",
  background: "#141414",
  flexShrink: 0,
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "monospace",
    cursor: "pointer",
    border: "none",
    borderBottom: active ? "2px solid #ff6b35" : "2px solid transparent",
    background: "transparent",
    color: active ? "#e0e0e0" : "#666666",
    transition: "color 0.15s",
    marginBottom: -1,
  };
}

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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "#111111", overflow: "hidden" }}>
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

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <ScannerConfig config={config} onUpdate={onUpdate} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <div style={tabBarStyle}>
            <button
              style={tabStyle(activeTab === "terminal")}
              onClick={() => setActiveTab("terminal")}
            >
              Terminal
              {logs.length > 0 && (
                <span style={{ fontSize: 10, background: "rgba(255,107,53,0.2)", color: "#ff6b35", padding: "0 5px", borderRadius: 8, fontFamily: "monospace" }}>
                  {logs.length}
                </span>
              )}
            </button>
            <button
              style={tabStyle(activeTab === "findings")}
              onClick={() => setActiveTab("findings")}
            >
              Findings
              {findings.length > 0 && (
                <span style={{ fontSize: 10, background: "rgba(255,68,68,0.2)", color: "#ff4444", padding: "0 5px", borderRadius: 8, fontFamily: "monospace" }}>
                  {findings.length}
                </span>
              )}
            </button>
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {activeTab === "terminal" && <ScannerTerminal logs={logs} />}
            {activeTab === "findings" && <ScannerFindings findings={findings} onSendToStudio={onSendToStudio} />}
          </div>
        </div>
      </div>
    </div>
  );
}
