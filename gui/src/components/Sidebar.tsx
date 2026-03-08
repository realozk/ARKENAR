import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Crosshair, FileText, Layers, Radar, Telescope, Zap, RotateCcw, Plus, X, ListOrdered, FolderSearch, ClipboardPaste,
} from "lucide-react";
import type { ScanConfig } from "../types";
import { SectionLabel, TextInput, ToggleRow, NumberInput } from "./primitives";
import { t } from "../utils/i18n";

interface SidebarProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  onReset: () => void;
  scanQueue?: string[];
  onAddToQueue?: (targets: string[]) => void;
  onRemoveFromQueue?: (index: number) => void;
  language: "en" | "ar";
}

export function Sidebar({ config, onUpdate, onReset, scanQueue = [], onAddToQueue, onRemoveFromQueue, language }: SidebarProps) {
  const [queueInput, setQueueInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleBrowseList = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: language === "ar" ? "اختر ملف قائمة الأهداف" : "Select Target List File"
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
      const path = (file as any).path || file.name;
      onUpdate("listFile", path);
      onUpdate("target", "");
    }
  }, [onUpdate]);

  const handleAddToQueue = useCallback(() => {
    const targets = queueInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("http://") || line.startsWith("https://"));
    if (targets.length > 0 && onAddToQueue) {
      onAddToQueue(targets);
      setQueueInput("");
    }
  }, [queueInput, onAddToQueue]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onUpdate("target", text.trim());
        onUpdate("listFile", "");
      }
    } catch (err) {
      console.error("Paste failed", err);
    }
  }, [onUpdate]);

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel overflow-y-auto">
      <div className="px-5 pt-6 pb-5 space-y-6 flex-1">

        {/* Target Section */}
        <div>
          <SectionLabel icon={Crosshair}>{t("target", language)}</SectionLabel>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput id="target-input" value={config.target} onChange={(v) => onUpdate("target", v)} placeholder="https://example.com" mono />
            </div>
            <button
              onClick={handlePaste}
              title={t("paste", language)}
              className="flex shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-card px-3 text-text-secondary hover:text-accent-text hover:bg-bg-hover hover:-translate-y-0.5 transition-all duration-200 active:scale-95"
            >
              <ClipboardPaste size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Target List Section */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`transition-all duration-300 rounded-xl p-3 -mx-3 ${isDragging ? "bg-accent/10 border border-accent border-dashed scale-[1.02]" : "border border-transparent"}`}
        >
          <SectionLabel icon={FileText}>{t("targetList", language)}</SectionLabel>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput value={config.listFile} onChange={(v) => onUpdate("listFile", v)} placeholder={language === "ar" ? "اسحب الملف هنا أو تصفح..." : "Drop file or browse..."} mono />
            </div>
            <button
              onClick={handleBrowseList}
              title={language === "ar" ? "تصفح لاختيار ملف" : "Browse for a target list file"}
              className="flex shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-card px-3 text-text-secondary hover:text-accent-text hover:bg-bg-hover hover:-translate-y-0.5 transition-all duration-200 active:scale-95"
            >
              <FolderSearch size={16} strokeWidth={2.5} />
            </button>
          </div>
          <p className="mt-2 text-xs text-text-ghost leading-snug">
            {language === "ar" ? "اسحب وأفلت الملف، أو انقر فوق تصفح. يتجاوز الهدف الواحد." : "Drag & drop a file, or click browse. Overrides single target."}
          </p>
        </div>

        {/* Scan Mode Section */}
        <div>
          <SectionLabel icon={Layers}>{t("scanMode", language)}</SectionLabel>
          <div className="relative flex rounded-lg overflow-hidden bg-bg-input p-1">
            <div
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-accent transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${language === "ar" ? "right-1" : "left-1"}`}
              style={{
                transform: language === "ar"
                  ? (config.mode === "simple" ? "translateX(0)" : "translateX(-100%)")
                  : (config.mode === "simple" ? "translateX(0)" : "translateX(100%)"),
              }}
            />
            {(["simple", "advanced"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onUpdate("mode", m)}
                className={`relative z-10 flex-1 py-1.5 text-sm font-medium capitalize transition-colors duration-300 ${config.mode === m ? "text-bg-root" : "text-text-muted hover:text-text-secondary"
                  }`}
              >
                {m === "simple" ? (language === "ar" ? "بسيط" : "simple") : (language === "ar" ? "متقدم" : "advanced")}
              </button>
            ))}
          </div>

          <div className={`grid transition-all duration-300 ease-in-out ${config.mode === "advanced" ? "grid-rows-[1fr] mt-4 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden space-y-3.5 pl-0.5">
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("proxy", language)}</p>
                <TextInput value={config.proxy} onChange={(v) => onUpdate("proxy", v)} placeholder={t("proxyPlaceholder", language)} mono />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("customHeaders", language)}</p>
                <TextInput value={config.headers} onChange={(v) => onUpdate("headers", v)} placeholder={t("customHeadersPlaceholder", language)} mono />
                <p className="mt-1.5 text-xs text-text-ghost">{t("customHeadersDesc", language)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("nucleiTags", language)}</p>
                <TextInput value={config.tags} onChange={(v) => onUpdate("tags", v)} placeholder={t("nucleiTagsPlaceholder", language)} mono />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("payloadsFile", language)}</p>
                <TextInput value={config.payloads} onChange={(v) => onUpdate("payloads", v)} placeholder={t("payloadsFilePlaceholder", language)} mono />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("outputFile", language)}</p>
                <TextInput value={config.output} onChange={(v) => onUpdate("output", v)} placeholder={t("outputFilePlaceholder", language)} mono />
              </div>
            </div>
          </div>
        </div>

        {/* Integrations Section */}
        <div>
          <SectionLabel icon={Radar}>{t("integrations", language)}</SectionLabel>
          <ToggleRow label={t("katanaCrawler", language)} desc={t("katanaCrawlerDesc", language)} checked={config.enableCrawler} onChange={(v) => onUpdate("enableCrawler", v)} />
          <ToggleRow label={t("nucleiScanner", language)} desc={t("nucleiScannerDesc", language)} checked={config.enableNuclei} onChange={(v) => onUpdate("enableNuclei", v)} />
        </div>

        {/* Options Section */}
        <div>
          <SectionLabel icon={Telescope}>{t("options", language)}</SectionLabel>
          <ToggleRow label={t("sameDomainScope", language)} desc={t("sameDomainScopeDesc", language)} checked={config.scope} onChange={(v) => onUpdate("scope", v)} />
          <ToggleRow label={t("verbose", language)} checked={config.verbose} onChange={(v) => onUpdate("verbose", v)} />
          <ToggleRow label={t("dryRun", language)} desc={t("dryRunDesc", language)} checked={config.dryRun} onChange={(v) => onUpdate("dryRun", v)} />
        </div>

        {/* Performance Section */}
        <div className="space-y-4">
          <SectionLabel icon={Zap}>{t("performance", language)}</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("threads", language)}</p>
              <NumberInput value={config.threads} onChange={(v: number) => onUpdate("threads", v)} min={1} max={500} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("timeout", language)} (s)</p>
              <NumberInput value={config.timeout} onChange={(v: number) => onUpdate("timeout", v)} min={1} max={60} />
            </div>
            <div className="col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("rateLimit", language)} (req/s)</p>
              <NumberInput value={config.rateLimit} onChange={(v: number) => onUpdate("rateLimit", v)} min={1} max={5000} />
            </div>
          </div>
        </div>

        {/* Crawler Config */}
        <div className={`grid transition-all duration-300 ease-in-out ${config.enableCrawler ? "grid-rows-[1fr] mt-2 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            <div className="pt-4 space-y-4">
              <SectionLabel icon={Radar}>{t("crawler", language)}</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("depth", language)}</p>
                  <NumberInput value={config.crawlerDepth} onChange={(v: number) => onUpdate("crawlerDepth", v)} min={1} max={10} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("timeout", language)} (s)</p>
                  <NumberInput value={config.crawlerTimeout} onChange={(v: number) => onUpdate("crawlerTimeout", v)} min={10} max={300} />
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("maxUrls", language)}</p>
                  <NumberInput value={config.crawlerMaxUrls} onChange={(v: number) => onUpdate("crawlerMaxUrls", v)} min={5} max={1000} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scan Queue Section */}
        <div className="flex-1 flex flex-col min-h-0 pt-4 border-t border-border-subtle/50">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel icon={ListOrdered} className="!mb-0">{t("scanQueue", language)}</SectionLabel>
            <span className="text-[10px] font-bold bg-accent/10 text-accent px-2 py-0.5 rounded-full uppercase tracking-tighter">
              {scanQueue.length} {t("tasks", language)}
            </span>
          </div>

          <div className="space-y-2">
            <textarea
              value={queueInput}
              onChange={(e) => setQueueInput(e.target.value)}
              placeholder={t("scanQueuePlaceholder", language)}
              dir="ltr"
              className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-border-focus transition-all duration-200 placeholder:text-text-ghost/50 resize-none h-16"
            />
            <button
              onClick={handleAddToQueue}
              disabled={!queueInput.trim()}
              className={`flex items-center gap-1.5 w-full justify-center rounded-lg py-2 text-xs font-semibold transition-all duration-200 ${queueInput.trim() ? "bg-accent/15 text-accent-text border border-accent/20 hover:bg-accent/25" : "bg-bg-input text-text-ghost cursor-not-allowed border border-transparent"}`}
            >
              <Plus size={14} strokeWidth={2.5} />
              {t("addToQueue", language)}
            </button>
            {scanQueue.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-[10px] text-text-ghost uppercase tracking-wider">{t("queuedTargets", language)} ({scanQueue.length})</p>
                {scanQueue.map((target, i) => (
                  <div key={i} className={`flex items-center rounded-lg bg-bg-input px-3 py-1.5 group ${language === "ar" ? "flex-row-reverse gap-2" : "gap-2"}`}>
                    <span className="text-xs font-mono text-text-secondary truncate flex-1" dir="ltr">{target}</span>
                    <button
                      onClick={() => onRemoveFromQueue?.(i)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-text-ghost hover:text-status-critical transition-all duration-200"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      <div className="px-5 py-4 border-t border-border-subtle bg-bg-panel shrink-0">
        <button
          onClick={onReset}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-subtle bg-bg-card py-2.5 text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-300 active:scale-95"
        >
          <RotateCcw size={16} strokeWidth={2.5} />
          {t("resetDefaults", language)}
        </button>
      </div>
    </aside>
  );
}
