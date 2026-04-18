import { useState, useCallback, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
// TASK 5: Removed oversized lucide-react section icons (Crosshair, FileText, Layers, Radar, Telescope, Zap)
// Section labels now use plain muted mono text matching Studio pattern — no icons needed.
import { ListOrdered, FolderSearch, BookmarkPlus, Bookmark, ClipboardPaste, RotateCcw } from "lucide-react";
import { CloseIcon, PlusIcon } from './icons';
import { log } from '../utils/logger';

import type { ScanConfig } from "../types";
import { SectionLabel, TextInput, ToggleRow, NumberInput } from "./primitives";
import { t } from "../utils/i18n";
import type { StudioHistoryItem } from "./StudioPanel";



interface SidebarProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  onReset: () => void;
  scanQueue?: string[];
  onAddToQueue?: (targets: string[]) => void;
  onRemoveFromQueue?: (index: number) => void;
  isStudioMode?: boolean;
  studioHistory?: StudioHistoryItem[];
  selectedStudioHistoryId?: string | null;
  onSelectStudioHistoryItem?: (id: string | null) => void;
  onNewStudioRequest?: () => void;
  onCompareWithHistory?: (body: string) => void;
}

const TEMPLATES_KEY = "arkenar-templates";
const URL_REGEX = /^https?:\/\/(\w[\w-]*(\.[\\w-]+)+)(:\d+)?(\/.*)?$/;

interface ScanTemplate { id: string; name: string; config: Partial<ScanConfig>; }

function loadTemplates(): ScanTemplate[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "[]"); } catch { return []; }
}
function saveTemplates(tpls: ScanTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(tpls));
}

/* ── Studio-style plain section divider label ──────────────────────────── */
// TASK 5: Replaces SectionLabel (with icon) for the sidebar.
// No icon, muted color, thin uppercase mono — matches Studio's section labels exactly.
function PlainSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-0 pt-4 pb-2">
      <span
        className="font-mono uppercase block"
        style={{
          fontSize: 'var(--fs-label)',
          letterSpacing: 'var(--tr-label)',
          color: 'var(--color-text-muted)',
        }}
      >
        {children}
      </span>
    </div>
  );
}

export function Sidebar({ config, onUpdate, onReset, scanQueue = [], onAddToQueue, 
  onRemoveFromQueue }: SidebarProps) {
  const [queueInput, setQueueInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  // S1: templates
  const [templates, setTemplates] = useState<ScanTemplate[]>(loadTemplates);
  const [templateNameInput, setTemplateNameInput] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  // S2: URL validator
  const [urlValid, setUrlValid] = useState<null | boolean>(null);
  const debounceRef = useRef<number | undefined>(undefined);

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
      log.error("Failed to open dialog", err);
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
      log.error("Paste failed", err);
    }
  }, [onUpdate]);

  // S2: validate URL on every keystroke (debounced 300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (!config.target) { setUrlValid(null); return; }
    
    debounceRef.current = window.setTimeout(() => {
      setUrlValid(URL_REGEX.test(config.target));
    }, 300);
    
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config.target]);


  // S1: save current config as template
  const handleSaveTemplate = useCallback(() => {
    if (!templateNameInput.trim()) return;
    const newTpl: ScanTemplate = { id: Date.now().toString(), name: templateNameInput.trim(), config: { ...config } };
    const updated = [...templates, newTpl].slice(-8);
    setTemplates(updated);
    saveTemplates(updated);
    setTemplateNameInput("");
    setSavingTemplate(false);
  }, [templateNameInput, templates, config]);

  const handleDeleteTemplate = useCallback((id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  }, [templates]);

  const handleLoadTemplate = useCallback((tpl: ScanTemplate) => {
    Object.entries(tpl.config).forEach(([k, v]) => onUpdate(k as keyof ScanConfig, v as ScanConfig[keyof ScanConfig]));
  }, [onUpdate]);

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel overflow-y-auto">
      <div className="px-4 pt-4 pb-5 space-y-0 flex-1">

        {/* S1: Templates Section — kept using primitives SectionLabel since it's a utility section */}
        {(templates.length > 0 || savingTemplate) && (
          <div className="mb-0">
            <div className="flex items-center justify-between mb-2">
              <SectionLabel icon={Bookmark} className="!mb-0">Templates</SectionLabel>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {templates.map(tpl => (
                <div key={tpl.id} className="flex items-center gap-1 rounded-lg bg-bg-input border border-border-subtle px-2.5 py-1 group">
                  <button
                    onClick={() => handleLoadTemplate(tpl)}
                    className="text-[11px] font-medium text-text-secondary hover:text-accent-text transition-colors focus-visible:outline-none focus-visible:text-accent-text"
                  >
                    {tpl.name}
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-text-ghost hover:text-status-critical transition-all duration-150 focus-visible:opacity-100 focus-visible:text-status-critical"
                  >
                    <CloseIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TARGET ─────────────────────────────────────────────────── */}
        {/* TASK 5: PlainSectionLabel — no bullseye icon, muted color */}
        <PlainSectionLabel>Target</PlainSectionLabel>
        <div>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <TextInput id="target-input" value={config.target} onChange={(v) => onUpdate("target", v)} placeholder="https://example.com" mono />
            </div>
            {/* S2: URL validator dot */}
            {urlValid !== null && (
              <div className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-300 ${urlValid ? "bg-status-success shadow-[0_0_6px_var(--color-status-success)]" : "bg-status-critical shadow-[0_0_6px_var(--color-status-critical)]"}`} title={urlValid ? "Valid URL" : "Invalid URL"} />
            )}
            <button
              onClick={handlePaste}
              title="Paste"
              className="flex shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-card px-3 text-text-secondary hover:text-accent-text hover:bg-bg-hover hover:-translate-y-0.5 transition-all duration-200 active:scale-95 h-9 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
            >
              <ClipboardPaste size={16} strokeWidth={2.5} />
            </button>
          </div>
          {/* S1: Save as template inline */}
          <div className="mt-2">
            {savingTemplate ? (
              <div className="flex gap-2 items-center">
                <input
                  autoFocus
                  value={templateNameInput}
                  onChange={e => setTemplateNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setSavingTemplate(false); }}
                  placeholder="Template name..."
                  className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-1 text-xs font-mono text-text-primary outline-none focus:border-accent/40 transition-all duration-200"
                />
                <button onClick={handleSaveTemplate} disabled={!templateNameInput.trim()} className="px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/20 text-[11px] font-bold text-accent-text hover:bg-accent/25 transition-all duration-150 disabled:opacity-40 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)]">
                  Save
                </button>
                <button onClick={() => { setSavingTemplate(false); setTemplateNameInput(""); }} className="p-1 text-text-ghost hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:text-text-primary">
                  <CloseIcon size={13} />
                </button>
              </div>
            ) : (
              <button onClick={() => setSavingTemplate(true)} className="flex items-center gap-1 text-[10px] text-text-ghost hover:text-accent-text transition-colors duration-150 focus-visible:outline-none focus-visible:text-accent-text">
                <BookmarkPlus size={11} strokeWidth={2.5} />Save as template
              </button>
            )}
          </div>
        </div>

        {/* ── TARGET LIST ─────────────────────────────────────────────── */}
        {/* TASK 5: PlainSectionLabel — no FileText icon */}
        <PlainSectionLabel>Target List</PlainSectionLabel>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`transition-all duration-300 rounded-sm p-2 -mx-2 ${isDragging ? "bg-accent/10 border border-accent border-dashed scale-[1.02]" : "border border-transparent"}`}
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput value={config.listFile} onChange={(v) => onUpdate("listFile", v)} placeholder="Drop file or browse..." mono />
            </div>
            <button
              onClick={handleBrowseList}
              title="Browse for a target list file"
              className="flex shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-card px-3 text-text-secondary hover:text-accent-text hover:bg-bg-hover hover:-translate-y-0.5 transition-all duration-200 active:scale-95 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
            >
              <FolderSearch size={16} strokeWidth={2.5} />
            </button>
          </div>
          {/* TASK 5: Shorter helper text */}
          <p
            className="mt-1.5 font-mono text-text-ghost leading-snug"
            style={{ fontSize: 'var(--fs-label)' }}
          >
            Drag & drop or browse. Overrides single target.
          </p>
        </div>

        {/* ── SCAN MODE ─────────────────────────────────────────────── */}
        {/* TASK 5: PlainSectionLabel — no Layers icon */}
        <PlainSectionLabel>{t("scanMode")}</PlainSectionLabel>
        <div>
          {/* TASK 5: Studio segmented control pattern — flat border, accent-bg for active */}
          <div
            className="flex overflow-hidden border border-[color:var(--color-border-subtle)]"
            style={{ background: "var(--color-bg-root)" }}
          >
            {(["simple", "advanced"] as const).map((m) => {
              const on = config.mode === m;
              return (
                <button
                  key={m}
                  onClick={() => onUpdate("mode", m)}
                  aria-pressed={on}
                  className="flex-1 py-1.5 font-mono uppercase font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
                  style={{
                    fontSize: 'var(--fs-label)',
                    letterSpacing: 'var(--tr-label)',
                    background: on ? "rgba(249,115,22,0.12)" : "transparent",
                    color: on ? "var(--color-accent-hover)" : "var(--color-text-ghost)",
                    borderBottom: on ? "2px solid var(--color-accent)" : "2px solid transparent",
                  }}
                >
                  {m === "simple" ? "Simple" : "Advanced"}
                </button>
              );
            })}
          </div>

          <div className={`grid transition-all duration-300 ease-in-out ${config.mode === "advanced" ? "grid-rows-[1fr] mt-4 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden space-y-3.5 pl-0.5">
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("proxy")}</p>
                <TextInput value={config.proxy} onChange={(v) => onUpdate("proxy", v)} placeholder={t("proxyPlaceholder")} mono />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("customHeaders")}</p>
                <TextInput value={config.headers} onChange={(v) => onUpdate("headers", v)} placeholder={t("customHeadersPlaceholder")} mono />
                <p className="mt-1.5 text-xs text-text-ghost">{t("customHeadersDesc")}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("nucleiTags")}</p>
                <TextInput value={config.tags} onChange={(v) => onUpdate("tags", v)} placeholder={t("nucleiTagsPlaceholder")} mono />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("payloadsFile")}</p>
                <TextInput value={config.payloads} onChange={(v) => onUpdate("payloads", v)} placeholder={t("payloadsFilePlaceholder")} mono />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">{t("outputFile")}</p>
                <TextInput value={config.output} onChange={(v) => onUpdate("output", v)} placeholder={t("outputFilePlaceholder")} mono />
              </div>
            </div>
          </div>
        </div>

        {/* ── DISCOVERY ─────────────────────────────────────────────── */}
        {/* TASK 5: PlainSectionLabel — no Telescope icon */}
        <PlainSectionLabel>Discovery</PlainSectionLabel>
        <div>
          <ToggleRow label="JS Endpoint Analysis" desc="Crawls discovered .js files for hidden API endpoints" checked={config.enableJsAnalysis} onChange={(v) => onUpdate("enableJsAnalysis", v)} />
          <ToggleRow label="Parameter Fuzzing" desc="Contextual payload selection per query parameter name" checked={config.enableParamFuzz} onChange={(v) => onUpdate("enableParamFuzz", v)} />
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-1.5">Scope Regex</p>
            <TextInput value={config.scopeRegex} onChange={(v) => onUpdate("scopeRegex", v)} placeholder="^https?://target\.com" mono />
            <p className="mt-1.5 text-xs text-text-ghost">Only URLs matching this pattern will be scanned</p>
          </div>
        </div>

        {/* ── INTEGRATIONS ─────────────────────────────────────────── */}
        {/* TASK 5: PlainSectionLabel — no Radar icon */}
        <PlainSectionLabel>{t("integrations")}</PlainSectionLabel>
        <div>
          <ToggleRow label={t("katanaCrawler")} desc={t("katanaCrawlerDesc")} checked={config.enableCrawler} onChange={(v) => onUpdate("enableCrawler", v)} />
          <ToggleRow label={t("nucleiScanner")} desc={t("nucleiScannerDesc")} checked={config.enableNuclei} onChange={(v) => onUpdate("enableNuclei", v)} />
          {config.enableNuclei && (
            <div className="mt-2 pl-8">
              <p className="text-xs text-text-muted mb-1.5">Nuclei Templates Directory</p>
              <TextInput value={config.nucleiTemplatesDir} onChange={(v) => onUpdate("nucleiTemplatesDir", v)} placeholder="~/.arkenar/plugins/nuclei (empty = built-in)" mono />
              <p className="mt-1 text-[10px] text-text-ghost">Custom .yaml templates appended to scan</p>
            </div>
          )}
        </div>

        {/* ── OPTIONS ─────────────────────────────────────────────── */}
        {/* TASK 5: PlainSectionLabel — no Telescope icon */}
        <PlainSectionLabel>{t("options")}</PlainSectionLabel>
        <div>
          <ToggleRow label={t("sameDomainScope")} desc={t("sameDomainScopeDesc")} checked={config.scope} onChange={(v) => onUpdate("scope", v)} />
          <ToggleRow label={t("verbose")} checked={config.verbose} onChange={(v) => onUpdate("verbose", v)} />
          <ToggleRow label={t("dryRun")} desc={t("dryRunDesc")} checked={config.dryRun} onChange={(v) => onUpdate("dryRun", v)} />
        </div>

        {/* ── PERFORMANCE ─────────────────────────────────────────── */}
        {/* TASK 5: PlainSectionLabel — no Zap icon */}
        <PlainSectionLabel>{t("performance")}</PlainSectionLabel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("threads")}</p>
              <NumberInput value={config.threads} onChange={(v: number) => onUpdate("threads", v)} min={1} max={500} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("timeout")} (s)</p>
              <NumberInput value={config.timeout} onChange={(v: number) => onUpdate("timeout", v)} min={1} max={60} />
            </div>
            <div className="col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("rateLimit")} (req/s)</p>
              <NumberInput value={config.rateLimit} onChange={(v: number) => onUpdate("rateLimit", v)} min={1} max={5000} />
            </div>
          </div>
        </div>

        {/* ── ENGINE ─────────────────────────────────────────────── */}
        {/* TASK 5: PlainSectionLabel — no Zap icon */}
        <PlainSectionLabel>Engine</PlainSectionLabel>
        <div>
          <ToggleRow label="Smart Payload Selection" desc="Prioritizes payloads by parameter name" checked={config.enableSmartPayloads} onChange={(v) => onUpdate("enableSmartPayloads", v)} />
        </div>

        {/* Crawler Config — conditionally shown */}
        <div className={`grid transition-all duration-300 ease-in-out ${config.enableCrawler ? "grid-rows-[1fr] mt-2 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            <div className="pt-4 space-y-4">
              {/* TASK 5: PlainSectionLabel for Crawler too */}
              <PlainSectionLabel>{t("crawler")}</PlainSectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("depth")}</p>
                  <NumberInput value={config.crawlerDepth} onChange={(v: number) => onUpdate("crawlerDepth", v)} min={1} max={10} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("timeout")} (s)</p>
                  <NumberInput value={config.crawlerTimeout} onChange={(v: number) => onUpdate("crawlerTimeout", v)} min={10} max={300} />
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-0.5">{t("maxUrls")}</p>
                  <NumberInput value={config.crawlerMaxUrls} onChange={(v: number) => onUpdate("crawlerMaxUrls", v)} min={5} max={1000} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SCAN QUEUE ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 pt-4 border-t border-border-subtle/50 mt-4">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel icon={ListOrdered} className="!mb-0">{t("scanQueue")}</SectionLabel>
            <span
              className="font-mono uppercase"
              style={{
                fontSize: 'var(--fs-label)',
                letterSpacing: 'var(--tr-label)',
                background: 'rgba(249,115,22,0.10)',
                color: 'var(--color-accent)',
                padding: '2px 8px',
              }}
            >
              {scanQueue.length} {t("tasks")}
            </span>
          </div>

          <div className="space-y-2">
            <textarea
              value={queueInput}
              onChange={(e) => setQueueInput(e.target.value)}
              placeholder={t("scanQueuePlaceholder")}
              dir="ltr"
              className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-border-focus transition-all duration-200 placeholder:text-text-ghost/50 resize-none h-16"
            />
            <button
              onClick={handleAddToQueue}
              disabled={!queueInput.trim()}
              className={`flex items-center gap-1.5 w-full justify-center rounded-lg py-2 text-xs font-semibold transition-all duration-200 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2 ${queueInput.trim() ? "bg-accent/15 text-accent-text border border-accent/20 hover:bg-accent/25" : "bg-bg-input text-text-ghost cursor-not-allowed border border-transparent"}`}
            >
              <PlusIcon size={14} />
              {t("addToQueue")}
            </button>
            {scanQueue.length > 0 && (
              <div className="space-y-1 mt-2">
                <p
                  className="font-mono uppercase text-text-ghost"
                  style={{ fontSize: 'var(--fs-label)', letterSpacing: 'var(--tr-label)' }}
                >
                  {t("queuedTargets")} ({scanQueue.length})
                </p>
                {scanQueue.map((target, i) => (
                  <div key={i} className="flex items-center rounded-lg bg-bg-input px-3 py-1.5 group gap-2">
                    <span className="text-xs font-mono text-text-secondary truncate flex-1" dir="ltr">{target}</span>
                    <button
                      onClick={() => onRemoveFromQueue?.(i)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-text-ghost hover:text-status-critical transition-all duration-200 focus-visible:opacity-100 focus-visible:text-status-critical"
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      <div className="px-4 py-4 border-t border-border-subtle bg-bg-panel shrink-0">
        <button
          onClick={onReset}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-subtle bg-bg-card py-2.5 text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-300 active:scale-95 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
        >
          <RotateCcw size={16} strokeWidth={2.5} />
          {t("resetDefaults")}
        </button>
      </div>
    </aside>
  );
}