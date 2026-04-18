import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import { ToastContainer, type Toast, type ToastType } from "./components/Toast";
import { CommandPalette } from "./components/CommandPalette";
import type { ScanConfig, LogLevel, LogEntry, ScanStatsEvent, ScanLogEvent, ScanFindingEvent, ScanStatus, ScanHistoryEntry, ReconHost } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { ConfirmationModal } from "./components/primitives";
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
import { CloseIcon } from './components/icons';
import { TitleBar } from './components/TitleBar';
import { StatusStrip } from './components/StatusStrip';
import { useScanStore } from './store';
import ReconPanel from "./components/ReconPanel";

const LOG_CAP = 2_000;
const HISTORY_KEY = "arkenar-scan-history";
const VALID_TABS = ["terminal", "findings", "history", "studio", "recon", "sitemap"] as const;
type ActiveTab = "terminal" | "findings" | "history" | "studio" | "recon" | "sitemap";

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
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    const mac = navigator.userAgent.toLowerCase().includes('mac os x') ||
                navigator.platform.toLowerCase().includes('mac');
    setIsMac(mac);
  }, []);

  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings);
  const appSettingsRef = useRef(appSettings);
  useEffect(() => { appSettingsRef.current = appSettings; }, [appSettings]);

  // ── Zustand: fast-updating scan state (rps, progress, stats) ─────────────
  const { setRps, setScanProgress, setStats } = useScanStore.getState();
  const scanProgress = useScanStore((s: { scanProgress: number }) => s.scanProgress);
  const stats = useScanStore((s: { stats: import('./types').ScanStatsEvent }) => s.stats);
  const rps = useScanStore((s: { rps: number }) => s.rps);
  // ─────────────────────────────────────────────────────────────────────────

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [findings, setFindings] = useState<ScanFindingEvent[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = localStorage.getItem('arkenar-active-tab');
    return (VALID_TABS as readonly string[]).includes(saved ?? '') ? (saved as ActiveTab) : "terminal";
  });
  const [visitedUrls, setVisitedUrls] = useState<string[]>([]);
  const [initialStudioRequest, setInitialStudioRequest] = useState<Partial<StudioRequest> | null>(null);
  const [studioHistory, setStudioHistory] = useState<StudioHistoryItem[]>([]);
  const [selectedStudioHistoryId, setSelectedStudioHistoryId] = useState<string | null>(null);
  const activeTabRef = useRef<ActiveTab>("terminal");

  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reconHosts, setReconHosts] = useState<Map<string, ReconHost>>(new Map());
  const [isReconRunning, setIsReconRunning] = useState(false);
  const [isReconComplete, setIsReconComplete] = useState(false);
  const compareWithHistoryRef = useRef<((body: string) => void) | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<unknown | null>(null);
  const CURRENT_VERSION = "1.1.0";

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
  // rps is read from Zustand store (useScanStore), not local state
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
  const visitedUrlsRef = useRef(visitedUrls);
  visitedUrlsRef.current = visitedUrls;

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('arkenar-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", (appSettings.uiScale / 100).toString());
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";

    if (appSettings.reduceMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }

    getCurrentWindow().show();
  }, [appSettings.uiScale, appSettings.reduceMotion]);

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

        if (finishedTimerRef.current) clearTimeout(finishedTimerRef.current);
        finishedTimerRef.current = window.setTimeout(() => {
          setScanStatus("idle");
          finishedTimerRef.current = null;
        }, 10_000);

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
            setVisitedUrls([]);
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
      // Batched findings listener — Rust flushes Vec<ScanFindingEvent> every 250ms
      listen<ScanFindingEvent[]>("scan-findings-batch", (event) => {
        const batch = event.payload;
        for (const f of batch) {
          findingBuffer.current.push(f);
          rpsCountRef.current += 1;
        }
        if (activeTabRef.current !== "studio") {
          setActiveTab("findings");
        }
        setScanProgress((p: number) => Math.min(p + batch.length, 90));
        if (batch.length > 0) {
          playSound("finding", appSettingsRef.current.soundEnabled && appSettingsRef.current.soundOnFinding, appSettingsRef.current.soundVolume);
        }
      }),
      listen<{ url: string }>("scan-url-visited", (event) => {
        setVisitedUrls(prev => Array.from(new Set([...prev, event.payload.url])));
      }),
      listen<{ host: string }>("recon-subdomain", (e) => {
        setReconHosts(prev => {
          const m = new Map(prev);
          if (!m.has(e.payload.host)) {
            m.set(e.payload.host, { host: e.payload.host, ports: [], dns: null, jsSecrets: [] });
          }
          return m;
        });
      }),
      listen<{ host: string; ports: number[] }>("recon-ports", (e) => {
        setReconHosts(prev => {
          const m = new Map(prev);
          const h = m.get(e.payload.host);
          if (h) {
            h.ports = [...new Set([...h.ports, ...e.payload.ports])].sort((a, b) => a - b);
            m.set(e.payload.host, h);
          }
          return m;
        });
      }),
      listen<{ host: string; a: string[]; mx: string[]; txt: string[]; cname: string | null; whois: string }>("recon-dns", (e) => {
        setReconHosts(prev => {
          const m = new Map(prev);
          const h = m.get(e.payload.host);
          if (h) {
            h.dns = { a: e.payload.a, mx: e.payload.mx, txt: e.payload.txt, cname: e.payload.cname, whois: e.payload.whois };
            m.set(e.payload.host, h);
          }
          return m;
        });
      }),
      listen<{ url: string; secret_type: string; matched_value: string; line_number: number }>("recon-js-secret", (e) => {
        setReconHosts(prev => {
          let hostName = "";
          try {
            const urlObj = new URL(e.payload.url);
            hostName = urlObj.hostname;
          } catch {
            hostName = e.payload.url.split('/')[0];
          }
          const m = new Map(prev);
          const h = m.get(hostName);
          if (h) {
            h.jsSecrets.push({ url: e.payload.url, secret_type: e.payload.secret_type, matched_value: e.payload.matched_value, line_number: e.payload.line_number });
            m.set(hostName, h);
          }
          return m;
        });
      }),
      listen<{ total_hosts: number; total_ports: number; total_secrets: number }>("recon-complete", () => {
        setIsReconRunning(false);
        setIsReconComplete(true);
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
    setVisitedUrls([]);
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
    setVisitedUrls([]);
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
      setScanQueue([]);
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Unknown error";
      addLog("error", `Failed to stop: ${msg}`);
      setScanStatus("running");
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
    if (activeTab === "recon") return;

    setShowClearConfirm(true);
  }, [activeTab, logs.length, findings.length, scanHistory.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        setShowPalette(p => !p);
        return;
      }
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
        e.preventDefault();

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
      if (spaceTimerRef.current) { clearTimeout(spaceTimerRef.current); spaceTimerRef.current = null; }
      if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
    };
  }, [scanStatus, handleStartScan, handleClear, handleStopScan, activeTab, showSettings, showPalette]);

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

  useEffect(() => {
    if (window.innerWidth < 1400) {
      setSidebarCollapsed(true);
    }
    const handleResize = () => {
      if (window.innerWidth < 1400) setSidebarCollapsed(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLoadFromHistory = useCallback((target: string) => {
    if (target.startsWith("http")) {
      setConfig(prev => ({ ...prev, target, listFile: "" }));
    } else {
      setConfig(prev => ({ ...prev, target: "", listFile: target }));
    }
    setActiveTab("terminal");
  }, []);

  const handleRunRecon = useCallback(async (domain: string) => {
    setIsReconRunning(true);
    setIsReconComplete(false);
    setReconHosts(new Map());
    try {
      await invoke("run_recon", { domain, visitedUrls: visitedUrlsRef.current });
    } catch {
      setIsReconRunning(false);
    }
  }, []);

  const handleStopRecon = useCallback(async () => {
    try {
      await invoke("stop_recon");
    } catch {
    }
    setIsReconRunning(false);
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
        target: studioUrl.trim(),
        headers: studioHeaders.trim(),
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
        {/* ── TitleBar (replaces both isMac branches) ───────────── */}
        <TitleBar
          isMac={isMac}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          scanStatus={scanStatus}
          scanQueue={scanQueue}
          config={config}
          handleStartScan={handleStartScan}
          handleStopScan={handleStopScan}
          isHoldingSpace={isHoldingSpace}
          isHoldingStop={isHoldingStop}
          holdTimeRemaining={holdTimeRemaining}
          onOpenSettings={() => setShowSettings(true)}
          onOpenInfo={() => setShowInfo(true)}
        />

        {/* ── StatusStrip — only visible in Studio mode ─────────── */}
        {activeTab === 'studio' && (
          <StatusStrip
            config={config}
            onClearFindings={requestClear}
          />
        )}


        {errorMsg && (
          <div className="animate-fade-slide-in flex items-center justify-between bg-status-critical/8 border-b border-status-critical/15 px-6 py-2.5">
            <span className="text-sm text-status-critical">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="p-1 text-status-critical/50 hover:text-status-critical transition-all duration-300 hover:scale-110 active:scale-90">
              <CloseIcon size={15} />
            </button>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div
            className="relative shrink-0 h-full transition-all duration-300 ease-in-out"
            style={{
              width: (activeTab === 'recon' || activeTab === 'studio') ? 0 : sidebarCollapsed ? 0 : 320,
              overflow: "hidden",
              display: (activeTab === 'recon' || activeTab === 'studio') ? 'none' : undefined,
            }}
          >
            <div className="h-full w-[320px]">
              <Sidebar
                config={config}
                onUpdate={update}
                onReset={handleResetConfig}
                scanQueue={scanQueue}
                onAddToQueue={handleAddToQueue}
                onRemoveFromQueue={handleRemoveFromQueue}

                isStudioMode={activeTab === "studio"}
                studioHistory={studioHistory}
                selectedStudioHistoryId={selectedStudioHistoryId}
                onSelectStudioHistoryItem={(id) => { setSelectedStudioHistoryId(id); setActiveTab("studio"); }}
                onNewStudioRequest={() => { setSelectedStudioHistoryId(null); setActiveTab("studio"); }}
                onCompareWithHistory={(body) => { compareWithHistoryRef.current?.(body); setActiveTab("studio"); }}
              />
            </div>
          </div>

          <main className="flex flex-1 flex-col overflow-hidden min-w-0 bg-transparent">
            <div
              className="flex flex-col flex-1 overflow-hidden min-h-0"
              style={{ display: activeTab === 'recon' ? 'none' : 'flex' }}
            >
              <TopStats
                stats={stats}
                scanStatus={scanStatus}
                scanProgress={scanProgress}
                rps={rps}

                activeTab={activeTab}
              />
              <TerminalView
                logs={logs}
                findings={findings}
                visitedUrls={visitedUrls}
                activeTab={activeTab as "terminal" | "findings" | "history" | "studio" | "sitemap"}
                onTabChange={(t) => setActiveTab(t)}
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
            </div>

            <div
              className="flex flex-1 min-h-0 overflow-hidden"
              style={{ display: activeTab === 'recon' ? 'flex' : 'none' }}
            >
              <ReconPanel
                hosts={reconHosts}
                isRunning={isReconRunning}
                isComplete={isReconComplete}
                onRun={handleRunRecon}
                onStop={handleStopRecon}
                onAddToQueue={handleAddToQueue}
                onSendToStudio={(host) => {
                  setConfig(prev => ({ ...prev, target: host }));
                  setActiveTab('terminal');
                }}

              />
            </div>
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

          />
        )}
        <ConfirmationModal
          isOpen={showClearConfirm}
          onClose={() => setShowClearConfirm(false)}
          onConfirm={handleClear}
          title={
            activeTab === "terminal" ? t("clearTerminalTitle") :
              activeTab === "findings" ? t("clearFindingsTitle") : t("clearHistoryTitle")
          }
          message={
            activeTab === "terminal" ? t("clearTerminalMsg") :
              activeTab === "findings" ? t("clearFindingsMsg") : t("clearHistoryMsg")
          }
          confirmText={t("yesUnderstand")}
          cancelText={t("noDoNotClear")}
        />
        <ToastContainer toasts={toasts} onRemove={removeToast} />

        {showPalette && (
          <CommandPalette
            onClose={() => setShowPalette(false)}
            scanStatus={scanStatus}
            hasTarget={!!(config.target || config.listFile)}
            hasFindings={findings.length > 0}
            onStartScan={handleStartScan}
            onStopScan={handleStopScan}
            onTabChange={(t) => setActiveTab(t)}
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
