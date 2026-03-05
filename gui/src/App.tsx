import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Shield, X, Settings } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";

import type { ScanConfig, LogLevel, LogEntry, ScanStatsEvent, ScanLogEvent, ScanFindingEvent, ScanStatus } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { StatusDot } from "./components/primitives";
import { Sidebar } from "./components/Sidebar";
import { TopStats } from "./components/TopStats";
import { TerminalView } from "./components/TerminalView";
import { SettingsModal, loadSettings, applyAccentColor, type AppSettings } from "./components/SettingsModal";

const LOG_CAP = 2_000;

// Module-level store for active Tauri unlisten functions.
// Lives outside the component so it survives Vite HMR reloads.
let pendingCleanup: (() => void)[] = [];

// Helper to convert hex to RGB for the dim background variant
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : "0, 213, 190"; // fallback to default teal
}

function App() {

  const [config, setConfig] = useState<ScanConfig>(DEFAULT_CONFIG);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<ScanStatsEvent>({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [findings, setFindings] = useState<ScanFindingEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"terminal" | "findings">("terminal");
  const [scanProgress, setScanProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings);

  // Buffers for batching updates
  const logBuffer = useRef<LogEntry[]>([]);
  const findingBuffer = useRef<ScanFindingEvent[]>([]);

  useEffect(() => {
    applyAccentColor(appSettings.accentColor);
    document.documentElement.setAttribute("data-theme", appSettings.theme);
  }, [appSettings.accentColor, appSettings.theme]);

  const addLog = useCallback((level: LogLevel, message: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logBuffer.current.push({ time, level, message });
  }, []);

  // Apply theme color to CSS variables globally
  useEffect(() => {
    const root = document.documentElement;
    const hex = appSettings.accentColor;
    const rgb = hexToRgb(hex);

    root.style.setProperty("--color-accent", hex);
    root.style.setProperty("--color-accent-text", hex);
    root.style.setProperty("--color-accent-hover", hex);
    root.style.setProperty("--color-accent-dim", `rgba(${rgb}, 0.10)`);
  }, [appSettings.accentColor]);

  // Handle Tauri Listeners
  useEffect(() => {
    pendingCleanup.forEach((fn) => fn());
    pendingCleanup = [];

    let active = true;

    const setup = Promise.all([
      listen<ScanLogEvent>("scan-log", (event) => {
        const { level, message } = event.payload;
        const validLevel = (["info", "success", "error", "warn", "phase"].includes(level) ? level : "info") as LogLevel;
        const now = new Date();
        const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

        logBuffer.current.push({ time, level: validLevel, message });

        if (level === "phase") {
          if (message.includes("Scan started")) setScanProgress(5);
          else if (message.includes("Phase 1")) setScanProgress(20);
          else if (message.includes("Phase 2")) setScanProgress(50);
          else if (message.includes("Phase 3")) setScanProgress(75);
          else if (message.includes("Scan Complete")) setScanProgress(100);
        }
      }),
      listen<ScanStatsEvent>("scan-complete", (event) => {
        setStats(event.payload);
        setScanStatus("finished");
        setScanProgress(100);
      }),
      listen<ScanFindingEvent>("scan-finding", (event) => {
        findingBuffer.current.push(event.payload);
        setActiveTab("findings");
        setScanProgress((p) => Math.min(p + 1, 90));
      }),
    ]);

    setup.then((fns) => {
      if (active) {
        pendingCleanup.push(...fns);
      } else {
        fns.forEach((fn) => fn());
      }
    });

    return () => {
      active = false;
    };
  }, []);

  // Flush buffers periodically (150ms)
  useEffect(() => {
    const interval = setInterval(() => {
      if (logBuffer.current.length > 0) {
        const batch = [...logBuffer.current];
        logBuffer.current = [];
        setLogs((prev) => {
          const next = [...prev, ...batch];
          return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
        });
      }
      if (findingBuffer.current.length > 0) {
        const batch = [...findingBuffer.current];
        findingBuffer.current = [];
        setFindings((prev) => [...prev, ...batch]);
      }
    }, 150);

    return () => clearInterval(interval);
  }, []);

  const update = useCallback(<K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleStartScan = useCallback(async () => {
    if (!config.target && !config.listFile) return;
    setScanStatus("running");
    setScanProgress(0);
    setErrorMsg(null);
    setStats({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
    setLogs([]);
    setFindings([]);
    setActiveTab("terminal");
    try {
      const finalConfig = {
        ...config,
        webhookUrl: appSettings.globalWebhookUrl || undefined
      };
      await invoke("start_scan", { config: finalConfig });
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Unknown error";
      addLog("error", `Scan failed: ${msg}`);
      setErrorMsg(msg);
      setScanStatus("error");
    }
  }, [config, appSettings.globalWebhookUrl, addLog]);

  const handleStopScan = useCallback(async () => {
    try {
      await invoke("stop_scan");
      addLog("warn", "Stop signal sent. Aborting scan...");
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Unknown error";
      addLog("error", `Failed to stop: ${msg}`);
    }
  }, [addLog]);

  const handleExportReport = useCallback(async () => {
    try {
      const outputPath = "arkenar_report.html";
      const actualPath = await invoke<string>("generate_report", {
        request: { findings, config, elapsed: stats.elapsed, output_path: outputPath }
      });
      addLog("success", `Report saved to ${actualPath}`);
      await openPath(actualPath);
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Unknown error";
      addLog("error", `Failed to generate report: ${msg}`);
      setErrorMsg(`Failed to generate report: ${msg}`);
    }
  }, [findings, config, stats.elapsed, addLog]);

  const handleClear = useCallback(() => {
    if (activeTab === "terminal") setLogs([]);
    else setFindings([]);
  }, [activeTab]);

  const handleResetConfig = useCallback(() => setConfig(DEFAULT_CONFIG), []);

  return (
    <div className="flex h-screen flex-col bg-bg-root">
      <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="flex items-center gap-2 rounded-lg py-1.5 px-2.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:scale-105 active:scale-95"
          >
            <Settings size={17} strokeWidth={2.5} />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 pointer-events-none">
          <Shield size={18} className="text-accent-text" strokeWidth={3} />
          <span className="text-sm font-semibold tracking-tight text-text-primary">Arkenar</span>
          <span className="rounded-md bg-accent-dim px-2 py-0.5 font-mono text-[11px] font-medium text-accent-text">
            v1.0.0 (beta)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={scanStatus} />
          <span className="text-xs font-medium text-text-secondary capitalize">{scanStatus}</span>
          {scanStatus === "running" ? (
            <button
              onClick={handleStopScan}
              className="flex items-center gap-1.5 rounded-lg bg-status-critical/10 border border-status-critical/20 px-3 py-1.5 text-xs font-semibold text-status-critical btn-danger-ghost animate-scan-pulse cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1" /></svg>
              Stop
            </button>
          ) : (
            <button
              onClick={handleStartScan}
              disabled={!config.target.trim() && !config.listFile.trim()}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 btn-glow ${config.target.trim() || config.listFile.trim()
                ? "bg-accent text-bg-root hover:brightness-110 cursor-pointer btn-glow-primary"
                : "bg-bg-card text-text-ghost cursor-not-allowed"
                }`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9" /></svg>
              Start Scan
            </button>
          )}
        </div>
      </header>

      {errorMsg && (
        <div className="animate-fade-slide-in flex items-center justify-between bg-status-critical/8 border-b border-status-critical/15 px-6 py-2.5">
          <span className="text-sm text-status-critical">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="p-1 text-status-critical/50 hover:text-status-critical transition-all duration-300 hover:scale-110 active:scale-90">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          config={config}
          onUpdate={update}
          onReset={handleResetConfig}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <TopStats stats={stats} scanStatus={scanStatus} scanProgress={scanProgress} />
          <TerminalView
            logs={logs}
            findings={findings}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onClear={handleClear}
            onExportReport={handleExportReport}
          />
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          settings={appSettings}
          onSave={setAppSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
