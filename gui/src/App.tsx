import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Crosshair,
  FileText,
  Layers,
  Radar,
  Shield,
  Telescope,
  Eye,
  FlaskConical,
  Globe,
  Network,
  Timer,
  Zap,
  ChevronDown,
  X,
  Square,
  Play,
  Settings2,
  Copy,
  Check,
  AlertTriangle,
  Bug,
} from "lucide-react";

// ─── Types ───────
interface ScanConfig {
  target: string;
  listFile: string;
  mode: "simple" | "advanced";
  threads: number;
  timeout: number;
  rateLimit: number;
  output: string;
  proxy: string;
  headers: string;
  tags: string;
  payloads: string;
  verbose: boolean;
  scope: boolean;
  dryRun: boolean;
  enableCrawler: boolean;
  enableNuclei: boolean;
  crawlerDepth: number;
  crawlerMaxUrls: number;
  crawlerTimeout: number;
}

type LogLevel = "info" | "success" | "error" | "warn" | "phase";

interface LogEntry {
  time: string;
  level: LogLevel;
  message: string;
}

interface ScanStatsEvent {
  targets: number;
  urls: number;
  critical: number;
  medium: number;
  safe: number;
  elapsed: string;
}

interface ScanLogEvent {
  level: string;
  message: string;
}

interface ScanFindingEvent {
  url: string;
  vuln_type: string;
  payload: string;
  status_code: number;
  timing_ms: number;
  server: string | null;
  curl_cmd: string;
}

type ScanStatus = "idle" | "running" | "finished" | "error";

const DEFAULT_CONFIG: ScanConfig = {
  target: "",
  listFile: "",
  mode: "simple",
  threads: 50,
  timeout: 5,
  rateLimit: 100,
  output: "scan_results.json",
  proxy: "",
  headers: "",
  tags: "",
  payloads: "",
  verbose: false,
  scope: false,
  dryRun: false,
  enableCrawler: true,
  enableNuclei: true,
  crawlerDepth: 3,
  crawlerMaxUrls: 50,
  crawlerTimeout: 60,
};

// ─── Primitives ──

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle-track ${checked ? "active" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

function StatusDot({ status }: { status: ScanStatus }) {
  const colors: Record<ScanStatus, string> = {
    idle: "bg-status-idle",
    running: "bg-status-info animate-pulse",
    finished: "bg-status-success",
    error: "bg-status-critical",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
}

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <Icon size={14} className="text-accent-text neon-label" strokeWidth={2.5} />
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted neon-label">
        {children}
      </span>
    </div>
  );
}

function TextInput({
  value, onChange, placeholder, mono,
}: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`
        w-full rounded-lg border border-border-subtle bg-bg-input px-3.5 py-2.5 text-sm text-text-primary
        placeholder:text-text-ghost
        focus:border-border-focus focus:outline-none
        transition-all duration-200
        ${mono ? "font-mono text-[13px]" : ""}
      `}
    />
  );
}

function NumberInput({ value, onChange, min, max }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      className="
        w-full rounded-lg border border-border-subtle bg-bg-input px-3.5 py-2.5 text-[13px] font-mono text-text-primary
        focus:border-border-focus focus:outline-none
        transition-all duration-200
        [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
      "
    />
  );
}

function ToggleRow({ label, desc, checked, onChange }: {
  label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <span className="text-sm text-text-primary">{label}</span>
        {desc && <p className="text-xs text-text-muted mt-0.5 leading-snug">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: {
  label: string; value: string | number; icon: React.ElementType;
  accent?: "default" | "critical" | "warning" | "success";
}) {
  const valueClass: Record<string, string> = {
    default: "text-text-primary",
    critical: "text-status-critical",
    warning: "text-status-warning",
    success: "text-status-success",
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-card p-5 transition-all duration-200 hover:bg-bg-hover hover:border-border-hover group">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-text-muted group-hover:text-text-secondary transition-colors duration-200" strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {label}
        </span>
      </div>
      <span className={`stat-value font-mono text-3xl font-bold tracking-tight ${valueClass[accent ?? "default"]}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Finding Card 

function FindingCard({ finding, index }: { finding: ScanFindingEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCritical = finding.vuln_type.toLowerCase().includes("sqli") || finding.vuln_type.toLowerCase().includes("sql");
  const severityClass = isCritical ? "text-status-critical bg-status-critical/10" : "text-status-warning bg-status-warning/10";
  const severityLabel = isCritical ? "Critical" : "Medium";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(finding.curl_cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="finding-card rounded-xl border border-border-subtle bg-bg-card cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="font-mono text-xs text-text-ghost select-none w-6 shrink-0">#{index + 1}</span>
        <AlertTriangle size={15} className={isCritical ? "text-status-critical" : "text-status-warning"} strokeWidth={2.5} />
        <span className="text-sm font-semibold text-text-primary truncate flex-1">
          {finding.vuln_type}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${severityClass}`}>
          {severityLabel}
        </span>
        <ChevronDown size={14} className={`text-text-ghost transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {expanded && (
        <div className="px-5 pb-4 pt-0 border-t border-border-subtle space-y-3">
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs pt-3">
            <div>
              <span className="text-text-muted">Target</span>
              <p className="text-text-secondary font-mono text-[13px] truncate mt-0.5">{finding.url}</p>
            </div>
            <div>
              <span className="text-text-muted">Payload</span>
              <p className="text-text-secondary font-mono text-[13px] truncate mt-0.5">{finding.payload || "—"}</p>
            </div>
            <div>
              <span className="text-text-muted">Status</span>
              <p className="text-text-secondary font-mono mt-0.5">{finding.status_code}</p>
            </div>
            <div>
              <span className="text-text-muted">Timing</span>
              <p className="text-text-secondary font-mono mt-0.5">{finding.timing_ms}ms</p>
            </div>
            {finding.server && (
              <div>
                <span className="text-text-muted">Server</span>
                <p className="text-text-secondary font-mono mt-0.5">{finding.server}</p>
              </div>
            )}
          </div>

          <div className="relative">
            <p className="text-xs text-text-muted mb-1.5">Reproduce</p>
            <div className="flex items-start gap-2 rounded-lg bg-bg-root border border-border-subtle p-3">
              <code className="flex-1 text-[13px] font-mono text-text-secondary break-all leading-relaxed select-all">
                {finding.curl_cmd}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md p-1.5 text-text-ghost hover:text-accent-text hover:bg-accent-dim transition-all duration-200"
                title="Copy curl command"
              >
                {copied ? <Check size={14} className="text-status-success" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App ─────────

function App() {
  const [config, setConfig] = useState<ScanConfig>(DEFAULT_CONFIG);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ targets: 0, urls: 0, critical: 0, medium: 0, safe: 0, elapsed: "—" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [findings, setFindings] = useState<ScanFindingEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"terminal" | "findings">("terminal");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((level: LogLevel, message: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { time, level, message }]);
  }, []);

  // ── Tauri event listeners ──────────────────────────────────────
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

  const canStart = (config.target.trim() !== "" || config.listFile.trim() !== "") && scanStatus !== "running";

  return (
    <div className="flex h-screen flex-col bg-bg-root">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex items-center gap-3">
          <Shield size={16} className="text-accent-text" strokeWidth={2.5} />
          <span className="text-sm font-semibold tracking-tight text-text-primary">Arkenar</span>
          <span className="rounded-md bg-accent-dim px-2 py-0.5 font-mono text-[11px] font-medium text-accent-text">
            v1.0.0
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <StatusDot status={scanStatus} />
          <span className="text-xs font-medium text-text-secondary capitalize">{scanStatus}</span>
        </div>
      </header>

      {/* ── Error Banner ──────────────────────────────────────── */}
      {errorMsg && (
        <div className="flex items-center justify-between bg-status-critical/8 border-b border-status-critical/15 px-6 py-2.5">
          <span className="text-sm text-status-critical">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-status-critical/50 hover:text-status-critical transition-colors duration-200">
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Body  */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel overflow-y-auto">
          <div className="px-5 pt-6 pb-5 space-y-6 flex-1">
            {/* Target */}
            <div>
              <SectionLabel icon={Crosshair}>Target</SectionLabel>
              <TextInput value={config.target} onChange={(v) => update("target", v)} placeholder="https://example.com" mono />
            </div>

            {/* Target List */}
            <div>
              <SectionLabel icon={FileText}>Target List</SectionLabel>
              <TextInput value={config.listFile} onChange={(v) => update("listFile", v)} placeholder="targets.txt" mono />
              <p className="mt-2 text-xs text-text-ghost leading-snug">One URL per line. Overrides single target.</p>
            </div>

            {/* Scan Mode */}
            <div>
              <SectionLabel icon={Layers}>Scan Mode</SectionLabel>
              <div className="flex rounded-lg overflow-hidden bg-bg-input">
                {(["simple", "advanced"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => update("mode", m)}
                    className={`flex-1 py-2 text-sm font-medium capitalize transition-all duration-200 ${config.mode === m
                      ? "bg-accent text-bg-root"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                      }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Integrations */}
            <div>
              <SectionLabel icon={Radar}>Integrations</SectionLabel>
              <ToggleRow label="Katana Crawler" desc="Discover URLs via crawling" checked={config.enableCrawler} onChange={(v) => update("enableCrawler", v)} />
              <ToggleRow label="Nuclei Scanner" desc="Template-based detection" checked={config.enableNuclei} onChange={(v) => update("enableNuclei", v)} />
            </div>

            {/* Scan Options */}
            <div>
              <SectionLabel icon={Telescope}>Options</SectionLabel>
              <ToggleRow label="Same-domain Scope" desc="Limit crawling to target" checked={config.scope} onChange={(v) => update("scope", v)} />
              <ToggleRow label="Verbose" checked={config.verbose} onChange={(v) => update("verbose", v)} />
              <ToggleRow label="Dry Run" desc="Simulate only" checked={config.dryRun} onChange={(v) => update("dryRun", v)} />
            </div>

            {/* Performance */}
            <div>
              <SectionLabel icon={Zap}>Performance</SectionLabel>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Threads</p>
                  <NumberInput value={config.threads} onChange={(v) => update("threads", v)} min={1} max={200} />
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Timeout</p>
                  <NumberInput value={config.timeout} onChange={(v) => update("timeout", v)} min={1} max={60} />
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Rate Limit</p>
                  <NumberInput value={config.rateLimit} onChange={(v) => update("rateLimit", v)} min={1} max={1000} />
                </div>
              </div>
            </div>

            {/* Crawler */}
            {config.enableCrawler && (
              <div>
                <SectionLabel icon={Radar}>Crawler</SectionLabel>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <p className="text-xs text-text-muted mb-1.5">Depth</p>
                    <NumberInput value={config.crawlerDepth} onChange={(v) => update("crawlerDepth", v)} min={1} max={10} />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1.5">Timeout</p>
                    <NumberInput value={config.crawlerTimeout} onChange={(v) => update("crawlerTimeout", v)} min={10} max={300} />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1.5">Max URLs</p>
                    <NumberInput value={config.crawlerMaxUrls} onChange={(v) => update("crawlerMaxUrls", v)} min={5} max={500} />
                  </div>
                </div>
              </div>
            )}


            {/* Advanced */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between py-1.5 text-xs font-medium text-text-muted hover:text-text-secondary transition-colors duration-200"
            >
              <div className="flex items-center gap-2.5">
                <Settings2 size={14} strokeWidth={2} />
                <span>Advanced</span>
              </div>
              <ChevronDown size={13} className={`transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`} />
            </button>

            {showAdvanced && (
              <div className="space-y-3.5 pl-0.5">
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Proxy</p>
                  <TextInput value={config.proxy} onChange={(v) => update("proxy", v)} placeholder="http://127.0.0.1:8080" mono />
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Custom Headers</p>
                  <TextInput value={config.headers} onChange={(v) => update("headers", v)} placeholder="Authorization: Bearer ..." mono />
                  <p className="mt-1.5 text-xs text-text-ghost">Semicolon-separated.</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Nuclei Tags</p>
                  <TextInput value={config.tags} onChange={(v) => update("tags", v)} placeholder="cve,jira,panel" mono />
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Payloads File</p>
                  <TextInput value={config.payloads} onChange={(v) => update("payloads", v)} placeholder="payloads/custom.txt" mono />
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Output File</p>
                  <TextInput value={config.output} onChange={(v) => update("output", v)} placeholder="scan_results.json" mono />
                </div>
              </div>
            )}
          </div>

          {/* ── Action Button ─────────────────────────────────── */}
          <div className="p-5 border-t border-border-subtle">
            {scanStatus === "running" ? (
              <button
                onClick={handleStopScan}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-status-critical/10 border border-status-critical/20 py-3 text-sm font-medium text-status-critical hover:bg-status-critical/15 transition-all duration-200 cursor-pointer"
              >
                <Square size={13} strokeWidth={2.5} />
                Stop Scan
              </button>
            ) : (
              <button
                onClick={handleStartScan}
                disabled={!canStart}
                className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-all duration-200 ${canStart
                  ? "bg-accent text-bg-root hover:shadow-accent-btn hover:brightness-110 cursor-pointer"
                  : "bg-bg-card text-text-ghost cursor-not-allowed"
                  }`}
              >
                <Play size={13} strokeWidth={2.5} />
                Start Scan
              </button>
            )}
          </div>
        </aside >

        {/* ── Main Panel ──────────────────────────────────────── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Stats */}
          <div className="shrink-0 p-6 pb-4">
            <div className="grid grid-cols-6 gap-3">
              <StatCard label="Targets" value={stats.targets} icon={Crosshair} />
              <StatCard label="URLs" value={stats.urls} icon={Globe} />
              <StatCard label="Critical" value={stats.critical} icon={Shield} accent={stats.critical > 0 ? "critical" : "default"} />
              <StatCard label="Medium" value={stats.medium} icon={Eye} accent={stats.medium > 0 ? "warning" : "default"} />
              <StatCard label="Safe" value={stats.safe} icon={Network} accent={stats.safe > 0 ? "success" : "default"} />
              <StatCard label="Elapsed" value={stats.elapsed} icon={Timer} />
            </div>
          </div>

          {/* Tab Header */}
          <div className="flex flex-1 flex-col overflow-hidden mx-6 mb-6 rounded-xl border border-border-subtle bg-bg-terminal">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab("terminal")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${activeTab === "terminal"
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-ghost hover:text-text-secondary"
                    }`}
                >
                  <FlaskConical size={13} strokeWidth={2} />
                  Terminal
                </button>
                <button
                  onClick={() => setActiveTab("findings")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${activeTab === "findings"
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-ghost hover:text-text-secondary"
                    }`}
                >
                  <Bug size={13} strokeWidth={2} />
                  Findings
                  {findings.length > 0 && (
                    <span className="ml-1 rounded-full bg-status-critical/20 text-status-critical px-2 py-0.5 text-[11px] font-bold">
                      {findings.length}
                    </span>
                  )}
                </button>
              </div>
              <button
                onClick={() => { if (activeTab === "terminal") setLogs([]); else setFindings([]); }}
                className="text-xs text-text-ghost hover:text-text-secondary transition-colors duration-200"
              >
                Clear
              </button>
            </div>

            {/* Terminal View */}
            {
              activeTab === "terminal" && (
                <div className="flex-1 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-relaxed">
                  {logs.length === 0 && (
                    <span className="text-text-ghost">Awaiting scan configuration...</span>
                  )}
                  {logs.map((log, i) => (
                    <div key={i} className={`terminal-line ${log.level}`}>
                      <span className="text-text-ghost select-none mr-3">{log.time}</span>
                      {log.message}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )
            }

            {/* Findings View */}
            {
              activeTab === "findings" && (
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {findings.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-text-ghost">
                      <Shield size={32} strokeWidth={1.5} className="mb-3 opacity-30" />
                      <span className="text-sm">No findings yet.</span>
                    </div>
                  )}
                  {findings.map((f, i) => (
                    <FindingCard key={i} finding={f} index={i} />
                  ))}
                </div>
              )
            }
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
