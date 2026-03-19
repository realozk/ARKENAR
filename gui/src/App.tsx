import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, Settings, PanelLeftClose, PanelLeft, Info, Minus, Square } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import { ToastContainer, type Toast, type ToastType } from "./components/Toast";
import { CommandPalette } from "./components/CommandPalette";
import type { ScanConfig, LogLevel, LogEntry, ScanStatsEvent, ScanLogEvent, ScanFindingEvent, ScanStatus, ScanHistoryEntry } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { StatusDot, ConfirmationModal } from "./components/primitives";
import { Sidebar } from "./components/Sidebar";
import { TopStats } from "./components/TopStats";
import { TerminalView } from "./components/TerminalView";
import { type StudioRequest, type StudioHistoryItem } from "./components/StudioPanel";
import { SettingsModal, loadSettings, type AppSettings } from "./components/SettingsModal";
import { InfoModal } from "./components/InfoModal";
import { t } from "./utils/i18n";
import { playSound } from "./utils/audio";
import { checkForAppUpdates } from './lib/updateChecker';
import { ChangelogModal } from './components/ChangelogModal';
import { Terminal, Blocks, Radar } from "lucide-react";

const LOG_CAP = 2_000;
const HISTORY_KEY = "arkenar-scan-history";



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



  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings);
  const appSettingsRef = useRef(appSettings);
  useEffect(() => {
    
    
    
    appSettingsRef.current = appSettings; }, [appSettings]);

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
  const compareWithHistoryRef = useRef<((body: string) => void) | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<any | null>(null);    
  const CURRENT_VERSION = "1.1.2"; 
  useEffect(() => {
    checkForAppUpdates().then((update) => {
      if (update) {
        setAvailableUpdate(update);
        setShowChangelog(true);
      } else {
        const lastVersion = localStorage.getItem('arkenar-version');
        if (lastVersion !== CURRENT_VERSION) {
          setShowChangelog(true);
        }
      }
    });
  }, []);

  const handleCloseChangelog = () => {
    setShowChangelog(false);
    if (!availableUpdate) {
      localStorage.setItem('arkenar-version', CURRENT_VERSION);
    }
  };

  
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

  const logBuffer = useRef<LogEntry[]>([]);
  const findingBuffer = useRef<ScanFindingEvent[]>([]);
  const rpsCountRef = useRef(0); 
  const configRef = useRef(config);
  configRef.current = config;
  const scanQueueRef = useRef(scanQueue);
  scanQueueRef.current = scanQueue;
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    
    document.documentElement.style.setProperty("--ui-scale", (appSettings.uiScale / 100).toString());
    document.documentElement.lang = appSettings.language;
    document.documentElement.dir = appSettings.language === "ar" ? "rtl" : "ltr";

    if (appSettings.reduceMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }

    getCurrentWindow().show();
  }, [appSettings.uiScale, appSettings.reduceMotion, appSettings.language]);

  const addLog = useCallback((level: LogLevel, message: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logBuffer.current.push({ id: crypto.randomUUID(), time, level, message });
  }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
  const id = crypto.randomUUID();
  setToasts(prev => [...prev.slice(-4), { id, type, message }]);
}, []);

const removeToast = useCallback((id: string) => {
  setToasts(prev => prev.filter(t => t.id !== id));
}, []);


  const unlistenRef = useRef<(() => void)[]>([]);
  
  useEffect(() => {

    
    
    setTimeout(() => {
      invoke('show_main_window');
    }, 150);
    
    unlistenRef.current.forEach(fn => fn());
    unlistenRef.current = [];

    const setup = Promise.all([
      listen<ScanLogEvent>("scan-log", (event) => {
        const { level, message } = event.payload;
        const validLevel = (["info", "success", "error", "warn", "phase"].includes(level) ? level : "info") as LogLevel;
        const now = new Date();
        const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

        logBuffer.current.push({ id: crypto.randomUUID(), time, level: validLevel, message });

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

    let cancelled = false;

    setup.then((fns) => {
      if (cancelled) {
        fns.forEach(fn => fn());
      } else {
        unlistenRef.current = fns;
      }
    });

    return () => {
      cancelled = true;
      const fns = unlistenRef.current;
      unlistenRef.current = [];
      fns.forEach(fn => fn());
    };
  }, [addToast]);

  useEffect(() => {
    const FLUSH_MS = 150;
    const interval = setInterval(() => {
      if (logBuffer.current.length > 0) {
        const batch = [...logBuffer.current];
        logBuffer.current = [];
        setLogs((prev) => {
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
      const count = rpsCountRef.current;
      rpsCountRef.current = 0;
      setRps(Math.round(count / (FLUSH_MS / 1000)));
    }, FLUSH_MS);

    return () => clearInterval(interval);
  }, []);

  const update = useCallback(<K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

 


 const handleQuickRescan = useCallback(async (target: string) => {
  setConfig(prev => ({ ...prev, target, listFile: "" }));
  setScanStatus("running");
  setScanProgress(0);
  setLogs([]);
  setFindings([]);
  setActiveTab("terminal");
  setStats({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
  try {
    await invoke("start_scan", { config: { ...configRef.current, target, listFile: "", webhookUrl: appSettingsRef.current.globalWebhookUrl || undefined } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    addLog("error", `Scan failed: ${msg}`);
    setScanStatus("error");
    addToast("error", `Scan failed: ${msg}`);
  }
}, [addLog, addToast]);

  const handleStartScan = useCallback(async () => {
    if (!config.target && !config.listFile) return;
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
  }, [addLog, addToast]);

  const handleClearHistory = useCallback(() => {
    setScanHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    playSound("clear", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnClear, appSettingsRef.current.soundVolume);
  }, []);

  const handleClear = useCallback(() => {
    if (activeTab === "terminal") {
      setLogs([]);
      playSound("clear", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnClear, appSettingsRef.current.soundVolume);
    } else if (activeTab === "findings") {
      setFindings([]);
      playSound("clear", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnClear, appSettingsRef.current.soundVolume);
    } else if (activeTab === "history") {
      handleClearHistory();
    }
  }, [activeTab, handleClearHistory]);

  const requestClear = useCallback(() => {
    if (activeTab === "terminal" && logs.length === 0) return;
    if (activeTab === "findings" && findings.length === 0) return;
    if (activeTab === "history" && scanHistory.length === 0) return;
    if (activeTab === "studio") return;

    setShowClearConfirm(true);
  }, [activeTab, logs.length, findings.length, scanHistory.length]);

  // --- Integrated Keyboard Shortcuts ---
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

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault(); // Prevent scrolling

        if (scanStatus === "stopping") return;

        const isRunning = scanStatus === "running";

        if (isRunning) {
          setIsHoldingStop(true);
        } else {
          setIsHoldingSpace(true);
        }

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
      // Clear hold timers so they don't fire after unmount / effect re-run
      if (spaceTimerRef.current) { clearTimeout(spaceTimerRef.current); spaceTimerRef.current = null; }
      if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
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


  const handleLoadFromHistory = useCallback((target: string) => {
    if (target.startsWith("http")) {
      setConfig(prev => ({ ...prev, target, listFile: "" }));
    } else {
      setConfig(prev => ({ ...prev, target: "", listFile: target }));
    }
    setActiveTab("terminal");
  }, []);

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

  const handleSendToBasic = useCallback(
  (studioUrl: string, studioHeaders: string) => {
    setConfig(prev => ({
      ...prev,
      target:  studioUrl.trim(),
      headers: studioHeaders.trim(),
      // Clear the list-file so the pasted URL takes precedence
      listFile: '',
    }));
    setActiveTab('terminal');
    addToast('info', 'Data synchronized to Basic Scanner');
  },
  [addToast],
);

  return (
    <div className="flex h-screen flex-col bg-bg-root overflow-hidden rounded-xl">
     

      <div className="relative z-0 flex flex-1 flex-col min-h-0">
    <header data-tauri-drag-region className="relative flex h-[64px] shrink-0 items-center justify-between border-b border-border-subtle/40 px-6 bg-transparent select-none z-10">
        
        {/* Left: App Controls */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarCollapsed(p => !p)}
              className="flex items-center justify-center h-8 w-8 rounded-lg text-text-ghost hover:text-text-primary hover:bg-bg-panel/60 border border-transparent hover:border-border-subtle transition-all duration-300 active:scale-95"
            >
              {sidebarCollapsed ? <PanelLeft size={18} strokeWidth={2.5} /> : <PanelLeftClose size={18} strokeWidth={2.5} />}
            </button>
            <button
              onClick={() => setShowInfo(true)}
              className="flex items-center justify-center h-8 w-8 rounded-lg text-text-ghost hover:text-text-primary hover:bg-bg-panel/60 border border-transparent hover:border-border-subtle transition-all duration-300 active:scale-95"
            >
              <Info size={18} strokeWidth={2.5} />
            </button>
            {/* Settings button */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center h-8 w-8 rounded-lg text-text-ghost hover:text-text-primary hover:bg-bg-panel/60 border border-transparent hover:border-border-subtle transition-all duration-300 active:scale-95"
            >
              <Settings size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="h-5 w-[1px] bg-border-subtle/50 mx-1" />
          <h1 className="text-[13px] font-black uppercase tracking-[0.2em] text-accent drop-shadow-sm">
            Arkenar
          </h1>
        </div>

        {/* Center: Workspace Switcher */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative flex items-center p-1.5 bg-black/20 rounded-xl border border-border-subtle/30 backdrop-blur-md shadow-inner">
            
            <div 
              className="absolute top-1.5 bottom-1.5 w-[130px] bg-bg-panel border border-border-subtle/50 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out"
              style={{ transform: activeTab !== 'studio' ? 'translateX(0)' : 'translateX(130px)' }}
            />

            <button
              onClick={() => { if (activeTab === 'studio') setActiveTab('terminal'); }}
              className={`relative z-10 flex items-center justify-center gap-2 w-[130px] py-2 text-xs font-bold uppercase tracking-widest transition-colors duration-300 ${
                activeTab !== 'studio' ? 'text-text-primary' : 'text-text-ghost hover:text-text-secondary'
              }`}
            >
              <Terminal size={16} className={activeTab !== 'studio' ? 'text-accent' : 'opacity-50'} />
              <span>Basic</span>
            </button>

            <button
              onClick={() => setActiveTab('studio')}
              className={`relative z-10 flex items-center justify-center gap-2 w-[130px] py-2 text-xs font-bold uppercase tracking-widest transition-colors duration-300 ${
                activeTab === 'studio' ? 'text-text-primary' : 'text-text-ghost hover:text-text-secondary'
              }`}
            >
              <Blocks size={16} className={activeTab === 'studio' ? 'text-status-warning' : 'opacity-50'} />
              <span>Studio</span>
            </button>

            <button
              disabled
              title="Coming in v1.2..."
              className="relative z-10 flex items-center justify-center gap-2 w-[130px] py-2 text-xs font-bold uppercase tracking-widest text-text-ghost/30 cursor-not-allowed"
            >
              <Radar size={16} />
              <span>Recon</span>
            </button>

          </div>
        </div>

        {/* Right: Window Controls */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Status & Queue */}
          <div className="flex items-center gap-4 border-r border-border-subtle/40 pr-4">
            {scanQueue.length > 0 && (
              <span className="rounded-md bg-bg-panel border border-border-subtle px-2 py-1 text-[10px] font-black uppercase tracking-wider text-text-secondary">
                {t("queue", appSettings.language)}: {scanQueue.length}
              </span>
            )}
            <div className="flex items-center gap-2">
              <StatusDot status={scanStatus} className="h-2 w-2" />
              <span
                key={scanStatus}
                className="text-[11px] font-bold uppercase tracking-widest text-text-secondary animate-fade-slide-in"
              >
                {t(scanStatus === "error" ? "scanError" : scanStatus, appSettings.language)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          {scanStatus === "running" || scanStatus === "stopping" ? (
            <button
              onClick={handleStopScan}
              disabled={scanStatus === "stopping"}
              className={`relative overflow-hidden flex items-center gap-2 rounded-lg px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] transition-all duration-300 active:scale-95 ${
                scanStatus === "stopping"
                  ? "bg-status-warning text-black cursor-not-allowed opacity-80 shadow-[0_0_14px_rgba(234,179,8,0.30)]"
                  : `bg-status-critical text-white hover:brightness-110 shadow-[0_0_15px_rgba(244,63,94,0.3)] ${isHoldingStop ? "animate-pulse scale-105" : ""}`
              }`}
            >
              {scanStatus === "stopping" ? (
                <div className="flex items-center gap-2 ">
                  <svg width="10" height="12" viewBox="0 0 12 14" fill="currentColor" className="shrink-0">
                    <rect x="0" y="0" width="4" height="14" rx="1" />
                    <rect x="8" y="0" width="4" height="14" rx="1" />
                  </svg>
                  {t("stopping", appSettings.language)}
                </div>
              ) : (
                <>
                  {isHoldingStop && (
                    <div
                      className="absolute inset-x-0 bottom-0 h-1 bg-white/40 transition-all duration-100 ease-linear"
                      style={{ width: `${((1 - holdTimeRemaining) / 1) * 100}%` }}
                    />
                  )}
                  <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  {t("stopScan", appSettings.language)}
                  {isHoldingStop && <span className="ml-1 opacity-70">({holdTimeRemaining.toFixed(1)}s)</span>}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleStartScan}
              disabled={!config.target && !config.listFile}
              className={`start-scan-btn relative overflow-hidden flex items-center gap-2 rounded-lg px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] transition-all duration-300 active:scale-95 ${
                config.target || config.listFile
                  ? `text-white ${isHoldingSpace ? "scale-105" : "hover:brightness-110"}`
                  : "bg-bg-panel text-text-ghost cursor-not-allowed border border-border-subtle/50"
              }`}
              style={config.target || config.listFile ? {
                backgroundColor: "#10b981",
                boxShadow: isHoldingSpace
                  ? "0 0 20px rgba(16,185,129,0.4)"
                  : "0 0 12px rgba(16,185,129,0.2)",
              } : undefined}
            >
              {isHoldingSpace && (
                <div
                  className="absolute inset-x-0 bottom-0 h-1 bg-white/40 transition-all duration-100 ease-linear"
                  style={{ width: `${((2 - holdTimeRemaining) / 2) * 100}%` }}
                />
              )}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="drop-shadow-sm"><polygon points="2,1 9,5 2,9" /></svg>
              {isHoldingSpace ? `${t("ready", appSettings.language)} (${holdTimeRemaining.toFixed(1)}s)` : t("startScan", appSettings.language)}
            </button>
          )}

        {/* Window Controls */}
          <div className="flex items-center h-full ml-2">
            {navigator.userAgent.toLowerCase().includes('mac') ? (
              <div className="flex items-center gap-2 px-3 group">
                <button onClick={() => getCurrentWindow().close()} className="w-[13px] h-[13px] rounded-full bg-[#ff5f56] border border-black/10 flex items-center justify-center hover:brightness-110">
                  <X size={8} className="opacity-0 group-hover:opacity-100 text-[#990000]" strokeWidth={4} />
                </button>
                <button onClick={() => getCurrentWindow().minimize()} className="w-[13px] h-[13px] rounded-full bg-[#ffbd2e] border border-black/10 flex items-center justify-center hover:brightness-110">
                  <Minus size={8} className="opacity-0 group-hover:opacity-100 text-[#995700]" strokeWidth={4} />
                </button>
                <button onClick={() => getCurrentWindow().toggleMaximize()} className="w-[13px] h-[13px] rounded-full bg-[#27c93f] border border-black/10 flex items-center justify-center hover:brightness-110">
                  <Square size={6} className="opacity-0 group-hover:opacity-100 text-[#006500]" strokeWidth={4} />
                </button>
              </div>
            ) : (
              <div className="flex items-center">
                <button onClick={() => getCurrentWindow().minimize()} title="Minimize" className="flex items-center justify-center w-[46px] h-[36px] text-text-ghost hover:text-text-primary hover:bg-bg-panel/80 transition-colors">
                  <Minus size={18} strokeWidth={2} />
                </button>
                <button onClick={() => getCurrentWindow().toggleMaximize()} title="Maximize / Restore" className="flex items-center justify-center w-[46px] h-[36px] text-text-ghost hover:text-text-primary hover:bg-bg-panel/80 transition-colors">
                  <Square size={14} strokeWidth={2} />
                </button>
                <button onClick={() => getCurrentWindow().close()} title="Close" className="flex items-center justify-center w-[46px] h-[36px] text-text-ghost hover:bg-[#e81123] hover:text-white transition-colors">
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
            )}
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
               onCompareWithHistory={(body) => {compareWithHistoryRef.current?.(body); setActiveTab("studio");}}

            />
          </div>
        </div>
      
        <main className="flex flex-1 flex-col overflow-hidden min-w-0 bg-transparent">
         
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
            onSendToBasic={handleSendToBasic}
            onCompareWithHistoryRef={compareWithHistoryRef}
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
        <InfoModal 
          onClose={() => setShowInfo(false)} 
          language={appSettings.language} 
          
        />
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
      <ChangelogModal 
        isOpen={showChangelog} 
        onClose={handleCloseChangelog} 
        availableUpdate={availableUpdate} 
      />
    </div>
  );
}

export default App;
