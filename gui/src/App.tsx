import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, Settings, PanelLeftClose, PanelLeft, Info, Minus, Square } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { ToastContainer, type Toast, type ToastType } from "./components/Toast";
import { CommandPalette } from "./components/CommandPalette";
import type { ScanConfig, LogLevel, LogEntry, ScanStatsEvent, ScanLogEvent, ScanFindingEvent, ScanStatus, ScanHistoryEntry } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { StatusDot, ConfirmationModal, Logo } from "./components/primitives";
import { Sidebar } from "./components/Sidebar";
import { TopStats } from "./components/TopStats";
import { TerminalView } from "./components/TerminalView";
import { type StudioRequest, type StudioHistoryItem } from "./components/StudioPanel";
import { SettingsModal, loadSettings, applyAccentColor, type AppSettings } from "./components/SettingsModal";
import { InfoModal } from "./components/InfoModal";
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
  const [activeTab, setActiveTab] = useState<"terminal" | "findings" | "history" | "studio">("terminal");
  const [initialStudioRequest, setInitialStudioRequest] = useState<Partial<StudioRequest> | null>(null);
  const [studioHistory, setStudioHistory] = useState<StudioHistoryItem[]>([]);
  const [selectedStudioHistoryId, setSelectedStudioHistoryId] = useState<string | null>(null);
  const activeTabRef = useRef<"terminal" | "findings" | "history" | "studio">("terminal");
  const [scanProgress, setScanProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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
    activeTabRef.current = activeTab;
  }, [activeTab]);

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

  const addToast = useCallback((type: ToastType, message: string) => {
  const id = crypto.randomUUID();
  setToasts(prev => [...prev.slice(-4), { id, type, message }]);
}, []);

const removeToast = useCallback((id: string) => {
  setToasts(prev => prev.filter(t => t.id !== id));
}, []);


  // Handle Tauri Listeners
  const unlistenRef = useRef<(() => void)[]>([]);
  useEffect(() => {
    // Tear down any previous listeners first
    unlistenRef.current.forEach(fn => fn());
    unlistenRef.current = [];
    pendingCleanup.forEach((fn) => fn());
    pendingCleanup = [];

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
        addToast("success", `Scan complete — ${event.payload.elapsed}`);
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
          const queueTimer = setTimeout(() => {
            setScanStatus("running");
            addToast("info", "Scan started");
            setScanProgress(0);
            setStats({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
            setLogs([]);
            setFindings([]);
            setActiveTab("terminal");
            invoke("start_scan", { config: { ...configRef.current, target: nextTarget, listFile: "" } }).catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
              setScanQueue(rest);
              setScanStatus("error");
              addToast("error", `Scan failed: ${msg}`);
            });
          }, 500);
          if (finishedTimerRef.current) clearTimeout(finishedTimerRef.current);
          finishedTimerRef.current = queueTimer;
        }
      }),
      listen<ScanFindingEvent>("scan-finding", (event) => {
        findingBuffer.current.push(event.payload);
        rpsCountRef.current += 1;
        if (activeTabRef.current !== "studio") {
          setActiveTab("findings");
        }
        setScanProgress((p) => Math.min(p + 1, 90));
        playSound("finding", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnFinding, appSettingsRef.current.soundVolume);
      }),
    ]);

    setup.then((fns) => {
      // Unlisten any that resolved after we already cleaned up
      if (unlistenRef.current.length === 0) {
        unlistenRef.current = fns;
      } else {
        // already cleaned up (effect ran again before promise resolved)
        fns.forEach(fn => fn());
      }
    });

    return () => {
      // Synchronously clear the ref so next effect doesn't double-call,
      // and call any already-resolved unlisteners immediately.
      const fns = unlistenRef.current;
      unlistenRef.current = [];
      fns.forEach(fn => fn());
    };
  }, [addToast]);

  // Flush buffers periodically (150ms)
  useEffect(() => {
    const FLUSH_MS = 150;
    const interval = setInterval(() => {
      if (logBuffer.current.length > 0) {
        const batch = [...logBuffer.current];
        logBuffer.current = [];
        setLogs((prev) => {
          // Deduplicate: skip entries identical to the last seen entry
          let last = prev.length > 0 ? prev[prev.length - 1] : null;
          const deduped: LogEntry[] = [];
          for (const entry of batch) {
            if (!last || last.message !== entry.message || last.level !== entry.level) {
              deduped.push(entry);
              last = entry;
            }
          }
          if (deduped.length === 0) return prev;
          const next = [...prev, ...deduped];
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

 


  // H1: Quick re-scan from history tab
 const handleQuickRescan = useCallback(async (target: string) => {
  setConfig(prev => ({ ...prev, target, listFile: "" }));
  setScanStatus("running");
  setScanProgress(0);
  setLogs([]);
  setFindings([]);
  setActiveTab("terminal");
  setStats({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
  try {
    await invoke("start_scan", { config: { ...configRef.current, target, listFile: "" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    addLog("error", `Scan failed: ${msg}`);
    setScanStatus("error");
    addToast("error", `Scan failed: ${msg}`);
  }
}, [addLog, addToast]);

  // H1: Export findings (for CommandPalette)
  const handleStartScan = useCallback(async () => {
    if (!config.target && !config.listFile) return;
    // Clear any pending finished→idle timer if user starts a new scan immediately
    if (finishedTimerRef.current) { clearTimeout(finishedTimerRef.current); finishedTimerRef.current = null; }
    setScanStatus("running");
    addToast("info", "Scan started");
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
      addToast("error", `Scan failed: ${msg}`);
    }
  }, [config, addLog, addToast]);
  const handleExportCSV = useCallback(() => {
  if (scanHistory.length === 0) return;
  const header = "Date,Target,Elapsed,Critical,Medium,Safe,URLs\n";
  const rows = scanHistory.map(e =>
    `"${e.date}","${e.target}","${e.elapsed}",${e.criticalCount},${e.mediumCount},${e.safeCount},${e.urlsScanned}`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "arkenar-history.csv"; a.click();
  URL.revokeObjectURL(url);
}, [scanHistory]);


  const handleStopScan = useCallback(async () => {
    try {
      setScanStatus("stopping");
      await invoke("stop_scan");
      addToast("warning", "Stopping scan...");
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
    if (activeTab === "studio") return;

    setShowClearConfirm(true);
  }, [activeTab, logs.length, findings.length, scanHistory.length]);

  // --- Integrated Keyboard Shortcuts & Modern Actions ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
       if (e.ctrlKey && e.key === "k") {
    e.preventDefault();
    setShowPalette(p => !p);
    return; 
  }
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showPalette) return;

      const key = e.key.toLowerCase();

      // Basic Tab Switching (T, F, H)
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        if (key === 't') { setActiveTab("terminal"); return; }
        if (key === 'f') { setActiveTab("findings"); return; }
        if (key === 'h') { setActiveTab("history"); return; }
        if (key === 'e') { setActiveTab("studio"); return; }
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
        if (e.key === "k") { e.preventDefault(); setShowPalette(true); return; }
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
        if (e.key === "4") { e.preventDefault(); setActiveTab("studio"); }
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
  }, [scanStatus, handleStartScan, handleClear, handleStopScan, activeTab, showSettings , showPalette]);

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

  const handleSendToStudio = useCallback((finding: ScanFindingEvent) => {
    const payload = finding.payload?.trim() || "";
    const useBody = payload.length > 0 && !finding.url.includes(payload) && !finding.url.includes(encodeURIComponent(payload));

    const initialReq: Partial<StudioRequest> = {
      url: finding.url,
      method: useBody ? "POST" : "GET",
      headers: "",
      body: useBody ? payload : "",
    };

    setInitialStudioRequest(initialReq);
    setActiveTab("studio");
  }, []);

  return (
    <div className="flex h-screen flex-col bg-bg-root overflow-hidden rounded-xl">
     

      <div className="relative z-0 flex flex-1 flex-col min-h-0">
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
        <div
          className="relative shrink-0 h-full transition-all duration-300 ease-in-out"
          style={{ width: sidebarCollapsed ? 0 : 320, overflow: "hidden" }}
        >
          <div className="h-full w-[320px]">
            <Sidebar
              config={config}
              onUpdate={update}
              onReset={handleResetConfig}
              scanQueue={scanQueue}
              onAddToQueue={handleAddToQueue}
              onRemoveFromQueue={handleRemoveFromQueue}
              language={appSettings.language}
              isStudioMode={activeTab === "studio"}
              studioHistory={studioHistory}
              selectedStudioHistoryId={selectedStudioHistoryId}
              onSelectStudioHistoryItem={(id) => { setSelectedStudioHistoryId(id); setActiveTab("studio"); }}
              onNewStudioRequest={() => { setSelectedStudioHistoryId(null); setActiveTab("studio"); }}
            />
          </div>
        </div>
      
        <main className="flex flex-1 flex-col overflow-hidden min-w-0 bg-transparent">
          <div className="flex justify-center pt-3 pb-0 z-10 w-full shrink-0">
            <div className="relative flex items-center rounded-full bg-bg-panel/40 p-1 border border-border-subtle shadow-sm">
              <div 
                className="absolute top-1 bottom-1 w-[120px] rounded-full bg-bg-card border border-border-subtle shadow-sm transition-transform duration-300 ease-in-out"
                style={{ transform: activeTab === 'studio' ? 'translateX(120px)' : 'translateX(0)' }}
              />
              <button
                onClick={() => { if (activeTab === 'studio') setActiveTab('terminal'); }}
                className={`relative z-10 w-[120px] py-1.5 text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${activeTab !== 'studio' ? 'text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
              >
                Basic
              </button>
              <button
                onClick={() => setActiveTab('studio')}
                className={`relative z-10 w-[120px] py-1.5 text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${activeTab === 'studio' ? 'text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
              >
                Studio
              </button>
            </div>
          </div>
          <TopStats
            stats={stats}
            scanStatus={scanStatus}
            scanProgress={scanProgress}
            rps={rps}
            language={appSettings.language}
            activeTab={activeTab}
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
            scanProgress={scanProgress}
            scanStatus={scanStatus}
            onQuickRescan={handleQuickRescan}
            onSendToStudio={handleSendToStudio}
            initialStudioRequest={initialStudioRequest}
            onInitialRequestConsumed={() => setInitialStudioRequest(null)}
            studioHistory={studioHistory}
            setStudioHistory={setStudioHistory}
            selectedStudioHistoryId={selectedStudioHistoryId}
            setSelectedStudioHistoryId={setSelectedStudioHistoryId}
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
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* H1: Command Palette */}
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          scanStatus={scanStatus}
          hasTarget={!!(config.target || config.listFile)}
          hasFindings={findings.length > 0}
          onStartScan={handleStartScan}
          onStopScan={handleStopScan}
          onTabChange={setActiveTab}
          onOpenSettings={() => setShowSettings(true)}
          onRequestClear={requestClear}
          onToggleSidebar={() => setSidebarCollapsed(p => !p)}
          onExportFindings={handleExportCSV}
        />
      )}
      </div>
    </div>
  );
}

export default App;
