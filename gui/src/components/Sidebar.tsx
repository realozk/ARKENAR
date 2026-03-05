import {
  Crosshair, FileText, Layers, Radar, Telescope, Zap, RotateCcw,
} from "lucide-react";
import type { ScanConfig } from "../types";
import { SectionLabel, TextInput, ToggleRow, SliderWithInput } from "./primitives";



interface SidebarProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  onReset: () => void;
}

export function Sidebar({ config, onUpdate, onReset }: SidebarProps) {


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
