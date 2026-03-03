import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Shield, X } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";

import type { ScanConfig, LogLevel, LogEntry, ScanStatsEvent, ScanLogEvent, ScanFindingEvent, ScanStatus } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { StatusDot } from "./components/primitives";
import { Sidebar } from "./components/Sidebar";
import { TopStats } from "./components/TopStats";
import { TerminalView } from "./components/TerminalView";



function App() {
  const [config, setConfig] = useState<ScanConfig>(DEFAULT_CONFIG);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<ScanStatsEvent>({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [findings, setFindings] = useState<ScanFindingEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"terminal" | "findings">("terminal");

  const addLog = useCallback((level: LogLevel, message: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { time, level, message }]);
  }, []);

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    listen<ScanLogEvent>("scan-log", (event) => {
      const { level, message } = event.payload;
      const validLevel = (["info", "success", "error", "warn", "phase"].includes(level) ? level : "info") as LogLevel;
      const now = new Date();
      const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLogs((prev) => [...prev, { time, level: validLevel, message }]);
    }).then((fn) => unlisteners.push(fn));

    listen<ScanStatsEvent>("scan-complete", (event) => {
      setStats(event.payload);
      setScanStatus("finished");
    }).then((fn) => unlisteners.push(fn));

    listen<ScanFindingEvent>("scan-finding", (event) => {
      setFindings((prev) => [...prev, event.payload]);
      setActiveTab("findings");
    }).then((fn) => unlisteners.push(fn));

    return () => { unlisteners.forEach((fn) => fn()); };
  }, []);

  const update = useCallback(<K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleStartScan = useCallback(async () => {
    if (!config.target && !config.listFile) return;
    setScanStatus("running");
    setErrorMsg(null);
    setStats({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
    setLogs([]);
    setFindings([]);
    setActiveTab("terminal");
    try {
      await invoke("start_scan", { config });
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Unknown error";
      addLog("error", `Scan failed: ${msg}`);
      setErrorMsg(msg);
      setScanStatus("error");
    }
  }, [config, addLog]);

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
        request: {
          findings,
          config,
          elapsed: stats.elapsed,
          output_path: outputPath
        }
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

  return (
    <div className="flex h-screen flex-col bg-bg-root">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex items-center gap-3">
          <Shield size={16} className="text-accent-text" strokeWidth={2.5} />
          <span className="text-sm font-semibold tracking-tight text-text-primary">Arkenar</span>
          <span className="rounded-md bg-accent-dim px-2 py-0.5 font-mono text-[11px] font-medium text-accent-text">
            v1.0.0 (beta)
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <StatusDot status={scanStatus} />
          <span className="text-xs font-medium text-text-secondary capitalize">{scanStatus}</span>
        </div>
      </header>

      {errorMsg && (
        <div className="flex items-center justify-between bg-status-critical/8 border-b border-status-critical/15 px-6 py-2.5">
          <span className="text-sm text-status-critical">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-status-critical/50 hover:text-status-critical transition-colors duration-200">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          config={config}
          scanStatus={scanStatus}
          onUpdate={update}
          onStartScan={handleStartScan}
          onStopScan={handleStopScan}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <TopStats stats={stats} />
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
    </div>
  );
}

export default App;
