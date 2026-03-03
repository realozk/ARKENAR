import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Crosshair, FileText, Layers, Radar, Telescope, Zap,
  Settings2, ChevronDown, Square, Play, Send,
} from "lucide-react";
import type { ScanConfig, ScanStatus } from "../types";
import { SectionLabel, TextInput, NumberInput, ToggleRow } from "./primitives";

function WebhookInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | "err">("idle");

  const handleTest = useCallback(async () => {
    if (!value.trim()) return;
    setTestState("sending");
    try {
      await invoke("test_webhook", { url: value.trim() });
      setTestState("ok");
    } catch {
      setTestState("err");
    } finally {
      setTimeout(() => setTestState("idle"), 2500);
    }
  }, [value]);

  const btnLabel = { idle: "Test", sending: "Sending…", ok: "Sent ✓", err: "Failed ✗" }[testState];
  const btnClass = {
    idle: "bg-bg-input border-border-subtle text-text-muted hover:text-accent-text hover:border-border-focus",
    sending: "bg-bg-input border-border-subtle text-text-ghost cursor-wait",
    ok: "bg-status-success/10 border-status-success/30 text-status-success",
    err: "bg-status-critical/10 border-status-critical/30 text-status-critical",
  }[testState];

  return (
    <div className="flex gap-2 items-center">
      <div className="flex-1">
        <TextInput value={value} onChange={onChange} placeholder="https://discord.com/api/webhooks/..." mono />
      </div>
      <button
        onClick={handleTest}
        disabled={!value.trim() || testState === "sending"}
        title="Send a test message to this webhook"
        className={`shrink-0 flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-[12px] font-semibold transition-all duration-200 ${btnClass} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Send size={12} strokeWidth={2.5} />
        {btnLabel}
      </button>
    </div>
  );
}

interface SidebarProps {
  config: ScanConfig;
  scanStatus: ScanStatus;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  onStartScan: () => void;
  onStopScan: () => void;
}

export function Sidebar({ config, scanStatus, onUpdate, onStartScan, onStopScan }: SidebarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const canStart = (config.target.trim() !== "" || config.listFile.trim() !== "") && scanStatus !== "running";

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel overflow-y-auto">
      <div className="px-5 pt-6 pb-5 space-y-6 flex-1">

        <div>
          <SectionLabel icon={Crosshair}>Target</SectionLabel>
          <TextInput value={config.target} onChange={(v) => onUpdate("target", v)} placeholder="https://example.com" mono />
        </div>

        <div>
          <SectionLabel icon={FileText}>Target List</SectionLabel>
          <TextInput value={config.listFile} onChange={(v) => onUpdate("listFile", v)} placeholder="targets.txt" mono />
          <p className="mt-2 text-xs text-text-ghost leading-snug">One URL per line. Overrides single target.</p>
        </div>

        <div>
          <SectionLabel icon={Layers}>Scan Mode</SectionLabel>
          <div className="flex rounded-lg overflow-hidden bg-bg-input">
            {(["simple", "advanced"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onUpdate("mode", m)}
                className={`flex-1 py-2.5 text-sm font-medium capitalize transition-all duration-200 ${config.mode === m
                  ? "bg-accent text-bg-root"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel icon={Radar}>Integrations</SectionLabel>
          <ToggleRow label="Katana Crawler" desc="Discover URLs via crawling" checked={config.enableCrawler} onChange={(v) => onUpdate("enableCrawler", v)} />
          <ToggleRow label="Nuclei Scanner" desc="Template-based detection" checked={config.enableNuclei} onChange={(v) => onUpdate("enableNuclei", v)} />
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-1.5">Webhook URL</p>
            <WebhookInput value={config.webhookUrl ?? ""} onChange={(v) => onUpdate("webhookUrl", v)} />
          </div>
        </div>

        <div>
          <SectionLabel icon={Telescope}>Options</SectionLabel>
          <ToggleRow label="Same-domain Scope" desc="Limit crawling to target" checked={config.scope} onChange={(v) => onUpdate("scope", v)} />
          <ToggleRow label="Verbose" checked={config.verbose} onChange={(v) => onUpdate("verbose", v)} />
          <ToggleRow label="Dry Run" desc="Simulate only" checked={config.dryRun} onChange={(v) => onUpdate("dryRun", v)} />
        </div>

        <div>
          <SectionLabel icon={Zap}>Performance</SectionLabel>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <p className="text-xs text-text-muted mb-1.5">Threads</p>
              <NumberInput value={config.threads} onChange={(v) => onUpdate("threads", v)} min={1} max={200} />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">Timeout</p>
              <NumberInput value={config.timeout} onChange={(v) => onUpdate("timeout", v)} min={1} max={60} />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">Rate Limit</p>
              <NumberInput value={config.rateLimit} onChange={(v) => onUpdate("rateLimit", v)} min={1} max={1000} />
            </div>
          </div>
        </div>

        {config.enableCrawler && (
          <div className="animate-fade-slide-in">
            <SectionLabel icon={Radar}>Crawler</SectionLabel>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <p className="text-xs text-text-muted mb-1.5">Depth</p>
                <NumberInput value={config.crawlerDepth} onChange={(v) => onUpdate("crawlerDepth", v)} min={1} max={10} />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">Timeout</p>
                <NumberInput value={config.crawlerTimeout} onChange={(v) => onUpdate("crawlerTimeout", v)} min={10} max={300} />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">Max URLs</p>
                <NumberInput value={config.crawlerMaxUrls} onChange={(v) => onUpdate("crawlerMaxUrls", v)} min={5} max={500} />
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between py-2.5 px-3 rounded-lg text-xs font-medium text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-all duration-200"
        >
          <div className="flex items-center gap-2.5">
            <Settings2 size={14} strokeWidth={2} />
            <span>Advanced</span>
          </div>
          <ChevronDown size={13} className={`transition-transform duration-300 ${showAdvanced ? "rotate-180" : ""}`} />
        </button>

        {showAdvanced && (
          <div className="space-y-3.5 pl-0.5 animate-fade-slide-in">
            <div>
              <p className="text-xs text-text-muted mb-1.5">Proxy</p>
              <TextInput value={config.proxy} onChange={(v) => onUpdate("proxy", v)} placeholder="http://127.0.0.1:8080" mono />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">Custom Headers</p>
              <TextInput value={config.headers} onChange={(v) => onUpdate("headers", v)} placeholder="Authorization: Bearer ..." mono />
              <p className="mt-1.5 text-xs text-text-ghost">Semicolon-separated.</p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">Nuclei Tags</p>
              <TextInput value={config.tags} onChange={(v) => onUpdate("tags", v)} placeholder="cve,jira,panel" mono />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">Payloads File</p>
              <TextInput value={config.payloads} onChange={(v) => onUpdate("payloads", v)} placeholder="payloads/custom.txt" mono />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">Output File</p>
              <TextInput value={config.output} onChange={(v) => onUpdate("output", v)} placeholder="scan_results.json" mono />
            </div>
          </div>
        )}
      </div>

      <div className="p-5 border-t border-border-subtle">
        {scanStatus === "running" ? (
          <button
            onClick={onStopScan}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-status-critical/10 border-2 border-status-critical/20 py-3.5 text-sm font-medium text-status-critical btn-danger-ghost animate-scan-pulse cursor-pointer"
          >
            <Square size={13} strokeWidth={2.5} />
            Stop Scan
          </button>
        ) : (
          <button
            onClick={onStartScan}
            disabled={!canStart}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[13px] font-semibold transition-all duration-200 ${canStart
              ? "bg-accent text-bg-root hover:shadow-accent-btn hover:brightness-110 cursor-pointer"
              : "bg-bg-card text-text-ghost cursor-not-allowed"
            }`}
          >
            <Play size={13} strokeWidth={2.5} />
            Start Scan
          </button>
        )}
      </div>
    </aside>
  );
}
