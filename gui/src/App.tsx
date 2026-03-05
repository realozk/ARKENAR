import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Shield, X, Settings, PanelLeftClose, PanelLeft } from "lucide-react";

import type { ScanConfig, LogLevel, LogEntry, ScanStatsEvent, ScanLogEvent, ScanFindingEvent, ScanStatus, ScanHistoryEntry } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { StatusDot } from "./components/primitives";
import { Sidebar } from "./components/Sidebar";
import { TopStats } from "./components/TopStats";
import { TerminalView } from "./components/TerminalView";
import { SettingsModal, loadSettings, applyAccentColor, type AppSettings } from "./components/SettingsModal";

const LOG_CAP = 2_000;
const HISTORY_KEY = "arkenar-scan-history";

// Module-level store for active Tauri unlisten functions.
// Lives outside the component so it survives Vite HMR reloads.
let pendingCleanup: (() => void)[] = [];

/** Validates scan history entries loaded from localStorage. */
function validateHistory(data: unknown): ScanHistoryEntry[] {
  if (!Array.isArray(data)) return [];
  return data.filter((e): e is ScanHistoryEntry =>
    typeof e === "object" && e !== null
    && typeof e.id === "string"
    && typeof e.date === "string"
    && typeof e.target === "string"
  );
}

function App() {

  const [config, setConfig] = useState<ScanConfig>(DEFAULT_CONFIG);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<ScanStatsEvent>({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [findings, setFindings] = useState<ScanFindingEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"terminal" | "findings" | "history">("terminal");
  const [scanProgress, setScanProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scanQueue, setScanQueue] = useState<string[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      return stored ? validateHistory(JSON.parse(stored)) : [];
    } catch { return []; }
  });

  // Buffers for batching updates
  const logBuffer = useRef<LogEntry[]>([]);
  const findingBuffer = useRef<ScanFindingEvent[]>([]);
  const configRef = useRef(config);
  configRef.current = config;
  const scanQueueRef = useRef(scanQueue);
  scanQueueRef.current = scanQueue;

  useEffect(() => {
    applyAccentColor(appSettings.accentColor);
    document.documentElement.setAttribute("data-theme", appSettings.theme);
  }, [appSettings.accentColor, appSettings.theme]);

  const addLog = useCallback((level: LogLevel, message: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logBuffer.current.push({ time, level, message });
  }, []);

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

        // Save to scan history
        const entry: ScanHistoryEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          target: configRef.current.target || configRef.current.listFile || "—",
          elapsed: event.payload.elapsed,
          findingsCount: event.payload.critical + event.payload.medium,
          criticalCount: event.payload.critical,
          mediumCount: event.payload.medium,
          safeCount: event.payload.safe,
          urlsScanned: event.payload.urls,
          targetsCount: event.payload.targets,
        };
        setScanHistory(prev => {
          const next = [entry, ...prev].slice(0, 50);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          return next;
        });

        // Process scan queue — if there are queued targets, start next
        const queue = scanQueueRef.current;
        if (queue.length > 0) {
          const [nextTarget, ...rest] = queue;
          setScanQueue(rest);
          // Auto-start next scan after a brief delay
          setTimeout(() => {
            setScanStatus("running");
            setScanProgress(0);
            setStats({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
            setLogs([]);
            setFindings([]);
            setActiveTab("terminal");
            invoke("start_scan", { config: { ...configRef.current, target: nextTarget, listFile: "" } }).catch(() => {
              setScanStatus("error");
            });
          }, 500);
        }
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
      setScanQueue([]); // Clear queue on manual stop
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Unknown error";
      addLog("error", `Failed to stop: ${msg}`);
    }
  }, [addLog]);

  // Fix 9: Confirmation for destructive actions
  const handleClearHistory = useCallback(() => {
    if (!window.confirm("Clear all scan history? This cannot be undone.")) return;
    setScanHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  const handleClear = useCallback(() => {
    if (activeTab === "terminal") setLogs([]);
    else if (activeTab === "findings") setFindings([]);
  }, [activeTab]);

  // Fix 11: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showSettings) return;

      // Ctrl+Enter → Start scan
      if (e.ctrlKey && e.key === "Enter" && scanStatus !== "running") {
        e.preventDefault();
        handleStartScan();
        return;
      }
      // Escape → Stop scan
      if (e.key === "Escape" && scanStatus === "running") {
        e.preventDefault();
        handleStopScan();
        return;
      }
      // Ctrl+L → Clear current tab
      if (e.ctrlKey && e.key === "l") { e.preventDefault(); handleClear(); }
      // Ctrl+1/2/3 → Switch tabs
      if (e.ctrlKey && e.key === "1") { e.preventDefault(); setActiveTab("terminal"); }
      if (e.ctrlKey && e.key === "2") { e.preventDefault(); setActiveTab("findings"); }
      if (e.ctrlKey && e.key === "3") { e.preventDefault(); setActiveTab("history"); }
      // Ctrl+B → Toggle sidebar
      if (e.ctrlKey && e.key === "b") { e.preventDefault(); setSidebarCollapsed(p => !p); }
      // Ctrl+, → Open settings
      if (e.ctrlKey && e.key === ",") { e.preventDefault(); setShowSettings(true); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scanStatus, showSettings, handleStartScan, handleStopScan, handleClear]);

  const handleResetConfig = useCallback(() => setConfig(DEFAULT_CONFIG), []);

  // Feature 13: Click history entry to load its target
  const handleLoadFromHistory = useCallback((target: string) => {
    if (target.startsWith("http")) {
      setConfig(prev => ({ ...prev, target, listFile: "" }));
    } else {
      setConfig(prev => ({ ...prev, target: "", listFile: target }));
    }
    setActiveTab("terminal");
  }, []);

  // Feature 18: Add targets to scan queue
  const handleAddToQueue = useCallback((targets: string[]) => {
    setScanQueue(prev => [...prev, ...targets]);
  }, []);

  const handleRemoveFromQueue = useCallback((index: number) => {
    setScanQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="flex h-screen flex-col bg-bg-root">
      <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarCollapsed(p => !p)}
            title={sidebarCollapsed ? "Show sidebar (Ctrl+B)" : "Hide sidebar (Ctrl+B)"}
            className="flex items-center rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:scale-105 active:scale-95"
          >
            {sidebarCollapsed ? <PanelLeft size={17} strokeWidth={2.5} /> : <PanelLeftClose size={17} strokeWidth={2.5} />}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Settings (Ctrl+,)"
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
          {scanQueue.length > 0 && (
            <span className="rounded-full bg-accent-dim px-2.5 py-0.5 text-[11px] font-bold text-accent-text font-mono">
              Queue: {scanQueue.length}
            </span>
          )}
          <StatusDot status={scanStatus} />
          <span className="text-xs font-medium text-text-secondary capitalize">{scanStatus}</span>
          {scanStatus === "running" ? (
            <button
              onClick={handleStopScan}
              title="Stop Scan (Esc)"
              className="flex items-center gap-1.5 rounded-lg bg-status-critical/10 border border-status-critical/20 px-3 py-1.5 text-xs font-semibold text-status-critical btn-danger-ghost animate-scan-pulse cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1" /></svg>
              Stop
            </button>
          ) : (
            <button
              onClick={handleStartScan}
              disabled={!config.target.trim() && !config.listFile.trim()}
              title="Start Scan (Ctrl+Enter)"
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
        <div className={`shrink-0 h-full transition-all duration-300 ease-in-out overflow-hidden ${sidebarCollapsed ? "w-0" : "w-[320px]"}`}>
          <Sidebar
            config={config}
            onUpdate={update}
            onReset={handleResetConfig}
            scanQueue={scanQueue}
            onAddToQueue={handleAddToQueue}
            onRemoveFromQueue={handleRemoveFromQueue}
          />
        </div>
        <main className="flex flex-1 flex-col overflow-hidden">
          <TopStats stats={stats} scanStatus={scanStatus} scanProgress={scanProgress} />
          <TerminalView
            logs={logs}
            findings={findings}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onClear={handleClear}
            scanHistory={scanHistory}
            onClearHistory={handleClearHistory}
            onLoadFromHistory={handleLoadFromHistory}
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
