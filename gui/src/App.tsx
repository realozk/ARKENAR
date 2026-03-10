import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, Settings, PanelLeftClose, PanelLeft, Info, Minus, Square } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { ScanConfig, LogLevel, LogEntry, ScanStatsEvent, ScanLogEvent, ScanFindingEvent, ScanStatus, ScanHistoryEntry } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { StatusDot, ConfirmationModal, Logo } from "./components/primitives";
import { Sidebar } from "./components/Sidebar";
import { TopStats } from "./components/TopStats";
import { TerminalView } from "./components/TerminalView";
import { SettingsModal, loadSettings, applyAccentColor, type AppSettings } from "./components/SettingsModal";
import { InfoModal } from "./components/InfoModal";
import { Starfield, Aurora } from "./components/VisualEffects";
import { t } from "./utils/i18n";
import { playSound } from "./utils/audio";

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

  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    const s = loadSettings();
    return s;
  });
  const appSettingsRef = useRef(appSettings);
  useEffect(() => { appSettingsRef.current = appSettings; }, [appSettings]);

  const [config, setConfig] = useState<ScanConfig>(() => {
    const s = loadSettings();
    return {
      ...DEFAULT_CONFIG,
      threads: s.defaultThreads,
      timeout: s.defaultTimeout,
      rateLimit: s.defaultRateLimit,
      crawlerDepth: s.defaultCrawlerDepth,
      crawlerTimeout: s.defaultCrawlerTimeout,
      crawlerMaxUrls: s.defaultCrawlerMaxUrls,
    };
  });
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<ScanStatsEvent>({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [findings, setFindings] = useState<ScanFindingEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"terminal" | "findings" | "history">("terminal");
  const [scanProgress, setScanProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scanQueue, setScanQueue] = useState<string[]>([]);
  const [isHoldingSpace, setIsHoldingSpace] = useState(false);
  const [isHoldingStop, setIsHoldingStop] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [holdTimeRemaining, setHoldTimeRemaining] = useState(2.0);
  const [rps, setRps] = useState(0);
  const spaceTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const finishedTimerRef = useRef<number | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      return stored ? validateHistory(JSON.parse(stored)) : [];
    } catch { return []; }
  });

  // Buffers for batching updates
  const logBuffer = useRef<LogEntry[]>([]);
  const findingBuffer = useRef<ScanFindingEvent[]>([]);
  const rpsCountRef = useRef(0); // raw event count per flush window
  const configRef = useRef(config);
  configRef.current = config;
  const scanQueueRef = useRef(scanQueue);
  scanQueueRef.current = scanQueue;

  useEffect(() => {
    applyAccentColor(appSettings.accentColor);
    document.documentElement.setAttribute("data-theme", appSettings.theme);
    document.documentElement.style.setProperty("--ui-scale", (appSettings.uiScale / 100).toString());
    document.documentElement.lang = appSettings.language;
    document.documentElement.dir = appSettings.language === "ar" ? "rtl" : "ltr";

    if (appSettings.reduceMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }
  }, [appSettings.accentColor, appSettings.theme, appSettings.uiScale, appSettings.reduceMotion, appSettings.language]);


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
        playSound("complete", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnComplete, appSettingsRef.current.soundVolume);

        // Auto-reset to idle after 10 seconds
        if (finishedTimerRef.current) clearTimeout(finishedTimerRef.current);
        finishedTimerRef.current = window.setTimeout(() => {
          setScanStatus("idle");
          finishedTimerRef.current = null;
        }, 10_000);

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
          const queueTimer = setTimeout(() => {
            setScanStatus("running");
            setScanProgress(0);
            setStats({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
            setLogs([]);
            setFindings([]);
            setActiveTab("terminal");
            invoke("start_scan", { config: { ...configRef.current, target: nextTarget, listFile: "" } }).catch(() => {
              // Restore the remaining queue items so they aren't silently dropped.
              setScanQueue(rest);
              setScanStatus("error");
            });
          }, 500);
          // Store cleanup on the finishedTimerRef so it can be cancelled if needed
          if (finishedTimerRef.current) clearTimeout(finishedTimerRef.current);
          finishedTimerRef.current = queueTimer;
        }
      }),
      listen<ScanFindingEvent>("scan-finding", (event) => {
        findingBuffer.current.push(event.payload);
        rpsCountRef.current += 1; // Count events for RPS
        setActiveTab("findings");
        setScanProgress((p) => Math.min(p + 1, 90));
        playSound("finding", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnFinding, appSettingsRef.current.soundVolume);
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
    const FLUSH_MS = 150;
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
      // Compute live RPS from event count in this flush window
      const count = rpsCountRef.current;
      rpsCountRef.current = 0;
      setRps(Math.round(count / (FLUSH_MS / 1000)));
    }, FLUSH_MS);

    return () => clearInterval(interval);
  }, []);

  const update = useCallback(<K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleStartScan = useCallback(async () => {
    if (!config.target && !config.listFile) return;
    // Clear any pending finished→idle timer if user starts a new scan immediately
    if (finishedTimerRef.current) { clearTimeout(finishedTimerRef.current); finishedTimerRef.current = null; }
    setScanStatus("running");
    setScanProgress(0);
    setErrorMsg(null);
    setStats({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
    setLogs([]);
    setFindings([]);
    setActiveTab("terminal");
    playSound("start", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnStart, appSettingsRef.current.soundVolume);
    try {
      const finalConfig = {
        ...config,
        webhookUrl: appSettingsRef.current.globalWebhookUrl || undefined
      };
      await invoke("start_scan", { config: finalConfig });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
      addLog("error", `Scan failed: ${msg}`);
      setErrorMsg(msg);
      setScanStatus("error");
    }
  }, [config, addLog]);

  const handleStopScan = useCallback(async () => {
    try {
      setScanStatus("stopping");
      await invoke("stop_scan");
      addLog("warn", "Stop signal sent. Aborting scan...");
      setScanQueue([]); // Clear queue on manual stop
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Unknown error";
      addLog("error", `Failed to stop: ${msg}`);
      setScanStatus("running"); // Revert if failed
    }
  }, [addLog]);

  // Confirmation handles
  const handleClearHistory = useCallback(() => {
    setScanHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    playSound("clear", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnClear, appSettingsRef.current.soundVolume);
  }, []);

  const handleClear = useCallback(() => {
    if (activeTab === "terminal") setLogs([]);
    else if (activeTab === "findings") setFindings([]);
    else if (activeTab === "history") handleClearHistory();

    if (activeTab !== "history") {
      playSound("clear", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnClear, appSettingsRef.current.soundVolume);
    }
  }, [activeTab, handleClearHistory]);

  const requestClear = useCallback(() => {
    // Only show modal if there's actually something to clear
    if (activeTab === "terminal" && logs.length === 0) return;
    if (activeTab === "findings" && findings.length === 0) return;
    if (activeTab === "history" && scanHistory.length === 0) return;

    setShowClearConfirm(true);
  }, [activeTab, logs.length, findings.length, scanHistory.length]);

  // --- Integrated Keyboard Shortcuts & Modern Actions ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showSettings) return; // Don't trigger shortcuts if settings modal is open

      const key = e.key.toLowerCase();

      // Basic Tab Switching (T, F, H)
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        if (key === 't') { setActiveTab("terminal"); return; }
        if (key === 'f') { setActiveTab("findings"); return; }
        if (key === 'h') { setActiveTab("history"); return; }
        if (key === 'c') {
          requestClear();
          return;
        }
      }

      // Space Long Press (2s) for Start/Stop
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault(); // Prevent scrolling

        if (scanStatus === "stopping") return;

        const isRunning = scanStatus === "running";

        if (isRunning) {
          setIsHoldingStop(true);
        } else {
          setIsHoldingSpace(true);
        }

        // Stop hold: 1 second. Start hold: 2 seconds (prevents accidental launches).
        const holdDuration = isRunning ? 1000 : 2000;
        setHoldTimeRemaining(holdDuration / 1000);

        if (spaceTimerRef.current) clearTimeout(spaceTimerRef.current);
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);

        holdIntervalRef.current = window.setInterval(() => {
          setHoldTimeRemaining(prev => Math.max(0, prev - 0.1));
        }, 100);

        spaceTimerRef.current = window.setTimeout(() => {
          if (isRunning) {
            handleStopScan();
            setIsHoldingStop(false);
          } else {
            handleStartScan();
            setIsHoldingSpace(false);
          }
          if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        }, holdDuration);
        return;
      }

      // Ctrl Combinations
      if (e.ctrlKey) {
        if (e.key === "t") {
          e.preventDefault();
          setSidebarCollapsed(false);
          setTimeout(() => document.getElementById("target-input")?.focus(), 100);
          return;
        }
        if (e.key === "Enter" && scanStatus !== "running") { e.preventDefault(); handleStartScan(); }
        if (e.key === "l") { e.preventDefault(); handleClear(); }
        if (e.key === "1") { e.preventDefault(); setActiveTab("terminal"); }
        if (e.key === "2") { e.preventDefault(); setActiveTab("findings"); }
        if (e.key === "3") { e.preventDefault(); setActiveTab("history"); }
        if (e.key === "b") { e.preventDefault(); setSidebarCollapsed(p => !p); }
        if (e.key === ",") { e.preventDefault(); setShowSettings(true); }
      }

      // Escape → Stop scan
      if (e.key === "Escape" && scanStatus === "running") { handleStopScan(); }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsHoldingSpace(false);
        setIsHoldingStop(false);
        setHoldTimeRemaining(2.0);
        if (spaceTimerRef.current) {
          clearTimeout(spaceTimerRef.current);
          spaceTimerRef.current = null;
        }
        if (holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [scanStatus, handleStartScan, handleClear, handleStopScan, activeTab, showSettings]);

  const handleResetConfig = useCallback(() => {
    setConfig({
      ...DEFAULT_CONFIG,
      threads: appSettings.defaultThreads,
      timeout: appSettings.defaultTimeout,
      rateLimit: appSettings.defaultRateLimit,
      crawlerDepth: appSettings.defaultCrawlerDepth,
      crawlerTimeout: appSettings.defaultCrawlerTimeout,
      crawlerMaxUrls: appSettings.defaultCrawlerMaxUrls,
    });
  }, [appSettings]);


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
    <div className="flex h-screen flex-col bg-bg-root overflow-hidden">
      {appSettings.enableStars && <Starfield isScanning={scanStatus === "running"} theme={appSettings.theme} />}
      {appSettings.enableStars && <Aurora />}

      <header data-tauri-drag-region className="relative flex h-16 shrink-0 items-center justify-between border-b border-border-subtle px-8 bg-bg-panel/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarCollapsed(p => !p)}
            title={sidebarCollapsed ? "Show sidebar (Ctrl+B)" : "Hide sidebar (Ctrl+B)"}
            className="flex items-center rounded-xl p-2.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:scale-110 active:scale-95 border border-transparent hover:border-border-subtle"
          >
            {sidebarCollapsed ? <PanelLeft size={22} strokeWidth={2} /> : <PanelLeftClose size={22} strokeWidth={2} />}
          </button>
          <button
            onClick={() => setShowInfo(true)}
            title="Info"
            className="flex items-center gap-2 rounded-xl py-2.5 px-3.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:scale-110 active:scale-95 border border-transparent hover:border-border-subtle"
          >
            <Info size={22} strokeWidth={2} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title={appSettings.language === "ar" ? "الإعدادات (Ctrl+,)" : "Settings (Ctrl+,)"}
            className="flex items-center gap-2 rounded-xl py-2.5 px-4 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:scale-110 active:scale-95 border border-transparent hover:border-border-subtle"
          >
            <Settings size={22} strokeWidth={2} />
            <span className="text-base font-semibold">{t("settings", appSettings.language)}</span>
          </button>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          <Logo size="sm" className="opacity-100 scale-[1.35]" />
        </div>
        <div className="flex items-center gap-5">
          {scanQueue.length > 0 && (
            <span className="rounded-full bg-accent-dim px-3 py-1 text-xs font-bold text-accent-text font-mono border border-accent/20">
              {t("queue", appSettings.language)}: {scanQueue.length}
            </span>
          )}
          <div className="flex items-center gap-2">
            <StatusDot status={scanStatus} className="h-3 w-3" />
            <span
              key={scanStatus}
              className="text-sm font-semibold text-text-secondary capitalize tracking-tight animate-fade-slide-in"
            >
              {t(scanStatus === "error" ? "scanError" : scanStatus, appSettings.language)}
            </span>
          </div>
          {scanStatus === "running" || scanStatus === "stopping" ? (
            <button
              onClick={handleStopScan}
              disabled={scanStatus === "stopping"}
              className={`relative overflow-hidden flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${scanStatus === "stopping"
                ? "bg-status-warning text-black cursor-not-allowed opacity-80 shadow-[0_0_14px_rgba(234,179,8,0.30)]"
                : `bg-status-critical text-white hover:brightness-110 btn-glow shadow-[0_0_20px_rgba(244,63,94,0.4)] ${isHoldingStop ? "animate-pulse scale-110" : ""}`
                }`}
            >
              {scanStatus === "stopping" ? (
                <div className="flex items-center gap-2">
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" className="shrink-0">
                    <rect x="0" y="0" width="4" height="14" rx="1" />
                    <rect x="8" y="0" width="4" height="14" rx="1" />
                  </svg>
                  {t("stopping", appSettings.language)}
                </div>
              ) : (
                <>
                  {isHoldingStop && (
                    <div
                      className="absolute inset-x-0 bottom-0 h-1.5 bg-white/40 transition-all duration-100 ease-linear"
                      style={{ width: `${((2 - holdTimeRemaining) / 2) * 100}%` }}
                    />
                  )}
                  <div className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                  {t("stopScan", appSettings.language)}
                  {isHoldingStop && <span className="ml-1 opacity-70">({holdTimeRemaining.toFixed(1)}s)</span>}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleStartScan}
              disabled={!config.target && !config.listFile}
              className={`start-scan-btn relative overflow-hidden flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${config.target || config.listFile
                ? `btn-glow ${isHoldingSpace ? "scale-110" : "hover:brightness-110"}`
                : "bg-bg-card text-text-ghost cursor-not-allowed border border-border-subtle/50"
                }`}
              style={config.target || config.listFile ? {
                backgroundColor: "#10b981",
                color: appSettings.theme === "light" ? "#ffffff" : "#052e1c",
                boxShadow: isHoldingSpace
                  ? "0 0 20px rgba(16,185,129,0.5), 0 0 40px rgba(16,185,129,0.2)"
                  : "0 0 14px rgba(16,185,129,0.25)",
              } : undefined}
            >
              {isHoldingSpace && (
                <div
                  className="absolute inset-x-0 bottom-0 h-1.5 bg-white/40 transition-all duration-100 ease-linear"
                  style={{ width: `${((2 - holdTimeRemaining) / 2) * 100}%` }}
                />
              )}
              <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" className="drop-shadow-sm"><polygon points="2,1 9,5 2,9" /></svg>
              {isHoldingSpace ? `${t("ready", appSettings.language)} (${holdTimeRemaining.toFixed(1)}s)` : t("startScan", appSettings.language)}
            </button>
          )}
          {/* Window Controls */}
          <div className="flex items-center ml-3 border-l border-border-subtle pl-3 gap-0.5">
            <button
              onClick={() => getCurrentWindow().minimize()}
              title="Minimize"
              className="flex items-center justify-center w-[46px] h-[32px] text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all duration-200 active:scale-90"
            >
              <Minus size={20} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => getCurrentWindow().toggleMaximize()}
              title="Maximize / Restore"
              className="flex items-center justify-center w-[46px] h-[32px] text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all duration-200 active:scale-90"
            >
              <Square size={16} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => getCurrentWindow().close()}
              title="Close"
              className="flex items-center justify-center w-[46px] h-[32px] text-text-muted hover:bg-red-600 hover:text-white transition-all duration-200 active:scale-90"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>
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
            language={appSettings.language}
          />
        </div>
        <main className="flex flex-1 flex-col overflow-hidden">
          <TopStats
            stats={stats}
            scanStatus={scanStatus}
            scanProgress={scanProgress}
            rps={rps}
            language={appSettings.language}
          />
          <TerminalView
            logs={logs}
            findings={findings}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRequestClear={requestClear}
            scanHistory={scanHistory}
            onLoadFromHistory={handleLoadFromHistory}
            language={appSettings.language}
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

      {showInfo && (
        <InfoModal onClose={() => setShowInfo(false)} language={appSettings.language} />
      )}

      <ConfirmationModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClear}
        title={
          activeTab === "terminal" ? t("clearTerminalTitle", appSettings.language) :
            activeTab === "findings" ? t("clearFindingsTitle", appSettings.language) : t("clearHistoryTitle", appSettings.language)
        }
        message={
          activeTab === "terminal" ? t("clearTerminalMsg", appSettings.language) :
            activeTab === "findings" ? t("clearFindingsMsg", appSettings.language) : t("clearHistoryMsg", appSettings.language)
        }
        confirmText={t("yesUnderstand", appSettings.language)}
        cancelText={t("noDoNotClear", appSettings.language)}
      />
    </div>
  );
}

export default App;
