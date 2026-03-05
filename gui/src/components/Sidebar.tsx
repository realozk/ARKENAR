import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Crosshair, FileText, Layers, Radar, Telescope, Zap, RotateCcw, Plus, X, ListOrdered, FolderSearch,
} from "lucide-react";
import type { ScanConfig } from "../types";
import { SectionLabel, TextInput, ToggleRow, SliderWithInput } from "./primitives";



interface SidebarProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  onReset: () => void;
  scanQueue?: string[];
  onAddToQueue?: (targets: string[]) => void;
  onRemoveFromQueue?: (index: number) => void;
}

export function Sidebar({ config, onUpdate, onReset, scanQueue = [], onAddToQueue, onRemoveFromQueue }: SidebarProps) {
  const [queueInput, setQueueInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleBrowseList = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Select Target List File"
      });
      if (selected && typeof selected === "string") {
        onUpdate("listFile", selected);
        onUpdate("target", "");
      } else if (selected && Array.isArray(selected) && selected.length > 0) {
        onUpdate("listFile", selected[0]);
        onUpdate("target", "");
      }
    } catch (err) {
      console.error("Failed to open dialog", err);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // In Tauri, drops provide the full path in the augmented File object
      const path = (file as any).path || file.name;
      onUpdate("listFile", path);
      onUpdate("target", "");
    }
  }, [onUpdate]);

  const handleAddToQueue = () => {
    const targets = queueInput
      .split("\n")
      .map(t => t.trim())
      .filter(t => t.startsWith("http://") || t.startsWith("https://"));
    if (targets.length > 0 && onAddToQueue) {
      onAddToQueue(targets);
      setQueueInput("");
    }
  };

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel overflow-y-auto">
      <div className="px-5 pt-6 pb-5 space-y-6 flex-1">

        <div>
          <SectionLabel icon={Crosshair}>Target</SectionLabel>
          <TextInput value={config.target} onChange={(v) => onUpdate("target", v)} placeholder="https://example.com" mono />
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`transition-all duration-300 rounded-xl p-3 -mx-3 ${isDragging ? "bg-accent/10 border border-accent border-dashed scale-[1.02]" : "border border-transparent"}`}
        >
          <SectionLabel icon={FileText}>Target List</SectionLabel>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput value={config.listFile} onChange={(v) => onUpdate("listFile", v)} placeholder="Drop file or browse..." mono />
            </div>
            <button
              onClick={handleBrowseList}
              title="Browse for a target list file"
              className="flex shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-card px-3 text-text-secondary hover:text-accent-text hover:bg-bg-hover hover:-translate-y-0.5 transition-all duration-200 active:scale-95"
            >
              <FolderSearch size={16} strokeWidth={2.5} />
            </button>
          </div>
          <p className="mt-2 text-xs text-text-ghost leading-snug">Drag & drop a file, or click browse. Overrides single target.</p>
        </div>

        <div>
          <SectionLabel icon={Layers}>Scan Mode</SectionLabel>
          <div className="relative flex rounded-lg overflow-hidden bg-bg-input p-1">
            <div
              className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md bg-accent transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{
                transform: config.mode === "simple" ? "translateX(0)" : "translateX(100%)",
              }}
            />
            {(["simple", "advanced"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onUpdate("mode", m)}
                className={`relative z-10 flex-1 py-1.5 text-sm font-medium capitalize transition-colors duration-300 ${config.mode === m ? "text-bg-root" : "text-text-muted hover:text-text-secondary"
                  }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className={`grid transition-all duration-300 ease-in-out ${config.mode === "advanced" ? "grid-rows-[1fr] mt-4 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden space-y-3.5 pl-0.5">
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
          </div>
        </div>

        <div>
          <SectionLabel icon={Radar}>Integrations</SectionLabel>
          <ToggleRow label="Katana Crawler" desc="Discover URLs via crawling" checked={config.enableCrawler} onChange={(v) => onUpdate("enableCrawler", v)} />
          <ToggleRow label="Nuclei Scanner" desc="Template-based detection" checked={config.enableNuclei} onChange={(v) => onUpdate("enableNuclei", v)} />
        </div>

        <div>
          <SectionLabel icon={Telescope}>Options</SectionLabel>
          <ToggleRow label="Same-domain Scope" desc="Limit crawling to target" checked={config.scope} onChange={(v) => onUpdate("scope", v)} />
          <ToggleRow label="Verbose" checked={config.verbose} onChange={(v) => onUpdate("verbose", v)} />
          <ToggleRow label="Dry Run" desc="Simulate only" checked={config.dryRun} onChange={(v) => onUpdate("dryRun", v)} />
        </div>

        <div className="space-y-4">
          <SectionLabel icon={Zap}>Performance</SectionLabel>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-muted mb-2">Threads</p>
              <SliderWithInput value={config.threads} onChange={(v) => onUpdate("threads", v)} min={1} max={200} />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-2">Timeout (s)</p>
              <SliderWithInput value={config.timeout} onChange={(v) => onUpdate("timeout", v)} min={1} max={60} />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-2">Rate Limit (req/s)</p>
              <SliderWithInput value={config.rateLimit} onChange={(v) => onUpdate("rateLimit", v)} min={1} max={1000} />
            </div>
          </div>
        </div>

        <div className={`grid transition-all duration-300 ease-in-out ${config.enableCrawler ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden space-y-4">
            <SectionLabel icon={Radar}>Crawler</SectionLabel>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-muted mb-2">Depth</p>
                <SliderWithInput value={config.crawlerDepth} onChange={(v) => onUpdate("crawlerDepth", v)} min={1} max={10} />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-2">Timeout (s)</p>
                <SliderWithInput value={config.crawlerTimeout} onChange={(v) => onUpdate("crawlerTimeout", v)} min={10} max={300} />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-2">Max URLs</p>
                <SliderWithInput value={config.crawlerMaxUrls} onChange={(v) => onUpdate("crawlerMaxUrls", v)} min={5} max={500} />
              </div>
            </div>
          </div>
        </div>

        {/* Feature 18: Scan Queue */}
        <div>
          <SectionLabel icon={ListOrdered}>Scan Queue</SectionLabel>
          <div className="space-y-2">
            <textarea
              value={queueInput}
              onChange={(e) => setQueueInput(e.target.value)}
              placeholder={"https://target1.com\nhttps://target2.com"}
              className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-border-focus transition-all duration-200 placeholder:text-text-ghost/50 resize-none h-16"
            />
            <button
              onClick={handleAddToQueue}
              disabled={!queueInput.trim()}
              className={`flex items-center gap-1.5 w-full justify-center rounded-lg py-2 text-xs font-semibold transition-all duration-200 ${queueInput.trim() ? "bg-accent/15 text-accent-text border border-accent/20 hover:bg-accent/25" : "bg-bg-input text-text-ghost cursor-not-allowed border border-transparent"}`}
            >
              <Plus size={14} strokeWidth={2.5} />
              Add to Queue
            </button>
            {scanQueue.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-[10px] text-text-ghost uppercase tracking-wider">Queued ({scanQueue.length})</p>
                {scanQueue.map((target, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-bg-input px-3 py-1.5 group">
                    <span className="text-xs font-mono text-text-secondary truncate flex-1">{target}</span>
                    <button
                      onClick={() => onRemoveFromQueue?.(i)}
                      className="opacity-0 group-hover:opacity-100 text-text-ghost hover:text-status-critical transition-all duration-200"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
      <button
        onClick={onReset}
        className="flex items-center justify-center gap-2 w-full py-3.5 text-xs font-medium text-text-ghost hover:text-text-primary hover:bg-bg-hover transition-all duration-200 border-t border-border-subtle group"
      >
        <RotateCcw size={14} className="transition-transform duration-500 group-hover:-rotate-180" />
        Reset Configuration
      </button>
    </aside>
  );
}
