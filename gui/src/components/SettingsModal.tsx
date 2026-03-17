import React, { useEffect, useRef, useState } from "react";
import { SectionLabel, TextInput, SliderWithInput, Toggle, ConfirmationModal } from "./primitives";
import {
    X, Sliders, KeyRound, RotateCcw, Radar,
    Move, ZoomIn, ExternalLink, Volume2, LayoutTemplate
} from "lucide-react";
import { t } from "../utils/i18n";
import { playSound } from "../utils/audio";


/* ── Persisted settings shape ─────────────────────────────────── */
export interface AppSettings {
    defaultThreads: number;
    defaultTimeout: number;
    defaultRateLimit: number;
    defaultOutputPath: string;
    globalWebhookUrl: string;
    defaultCrawlerDepth: number;
    defaultCrawlerTimeout: number;
    defaultCrawlerMaxUrls: number;
    autoOpenReport: boolean;
    reduceMotion: boolean;
    uiScale: number;
    language: "en" | "ar";
    soundEnabled: boolean;
    soundVolume: number;
    soundOnStart: boolean;
    soundOnComplete: boolean;
    soundOnFinding: boolean;
    soundOnClear: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
    defaultThreads: 50,
    defaultTimeout: 5,
    defaultRateLimit: 100,
    defaultOutputPath: "scan_results.json",
    globalWebhookUrl: "",
    defaultCrawlerDepth: 3,
    defaultCrawlerTimeout: 60,
    defaultCrawlerMaxUrls: 50,
    autoOpenReport: true,
    reduceMotion: false,
    uiScale: 100,
    language: "en",         // 🔒 Locked to English
    soundEnabled: false,
    soundVolume: 75,
    soundOnStart: false,
    soundOnComplete: false,
    soundOnFinding: true,
    soundOnClear: false,
};

const STORAGE_KEY = "arkenar_settings";

export function loadSettings(): AppSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_SETTINGS };
            const merged = { ...DEFAULT_SETTINGS, ...parsed };
            
            // ☢️ إجبار التطبيق على الهوية الأساسية
            merged.language = "en";
            
            if (typeof merged.globalWebhookUrl !== "string") merged.globalWebhookUrl = DEFAULT_SETTINGS.globalWebhookUrl;
            if (typeof merged.defaultOutputPath !== "string") merged.defaultOutputPath = DEFAULT_SETTINGS.defaultOutputPath;
            if (typeof merged.defaultThreads !== "number") merged.defaultThreads = DEFAULT_SETTINGS.defaultThreads;
            if (typeof merged.defaultTimeout !== "number") merged.defaultTimeout = DEFAULT_SETTINGS.defaultTimeout;
            if (typeof merged.defaultRateLimit !== "number") merged.defaultRateLimit = DEFAULT_SETTINGS.defaultRateLimit;
            if (typeof merged.defaultCrawlerDepth !== "number") merged.defaultCrawlerDepth = DEFAULT_SETTINGS.defaultCrawlerDepth;
            if (typeof merged.defaultCrawlerTimeout !== "number") merged.defaultCrawlerTimeout = DEFAULT_SETTINGS.defaultCrawlerTimeout;
            if (typeof merged.defaultCrawlerMaxUrls !== "number") merged.defaultCrawlerMaxUrls = DEFAULT_SETTINGS.defaultCrawlerMaxUrls;
            if (typeof merged.autoOpenReport !== "boolean") merged.autoOpenReport = DEFAULT_SETTINGS.autoOpenReport;
            if (typeof merged.uiScale !== "number") merged.uiScale = DEFAULT_SETTINGS.uiScale;
            if (typeof merged.reduceMotion !== "boolean") merged.reduceMotion = DEFAULT_SETTINGS.reduceMotion;
            if (typeof merged.soundEnabled !== "boolean") merged.soundEnabled = DEFAULT_SETTINGS.soundEnabled;
            if (typeof merged.soundVolume !== "number") merged.soundVolume = DEFAULT_SETTINGS.soundVolume;
            if (typeof merged.soundOnStart !== "boolean") merged.soundOnStart = DEFAULT_SETTINGS.soundOnStart;
            if (typeof merged.soundOnComplete !== "boolean") merged.soundOnComplete = DEFAULT_SETTINGS.soundOnComplete;
            if (typeof merged.soundOnFinding !== "boolean") merged.soundOnFinding = DEFAULT_SETTINGS.soundOnFinding;
            if (typeof merged.soundOnClear !== "boolean") merged.soundOnClear = DEFAULT_SETTINGS.soundOnClear;
            
            return merged;
        }
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: AppSettings) {
    const safeSettings = { ...s, language: "en" };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSettings)); } catch { /* ignore */ }
}


interface ToggleRowProps {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    onTest?: () => void;
    testLabel?: string;
}

function ToggleRow({ label, checked, onChange, onTest, testLabel }: ToggleRowProps) {
    return (
        <div className="flex items-center justify-between py-1.5 group/row">
            <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">{label}</span>
                {onTest && checked && (
                    <button
                        onClick={onTest}
                        className="opacity-0 group-hover/row:opacity-100 px-1.5 py-0.5 rounded bg-accent/10 text-[9px] font-bold text-accent-text hover:bg-accent/20 transition-all duration-200"
                    >
                        {testLabel || "Test"}
                    </button>
                )}
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

/* ── Modal ────────────────────────────────────────────────────── */
interface SettingsModalProps {
    settings: AppSettings;
    onSave: (s: AppSettings) => void;
    onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
    const [draft, setDraft] = useState<AppSettings>({ ...settings, language: "en" });
    const [showConfirm, setShowConfirm] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    const handleFinalCloseRef = useRef<() => void>(() => {});

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleFinalCloseRef.current(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) handleFinalClose();
    };

    const webhookError = draft.globalWebhookUrl.trim() !== "" && !/^https:\/\/.+/.test(draft.globalWebhookUrl.trim())
        ? t("webhookUrlError", draft.language) : null;

    const hasUnsavedChanges = () => {
        return draft.defaultOutputPath !== settings.defaultOutputPath
            || draft.globalWebhookUrl !== settings.globalWebhookUrl
            || draft.defaultCrawlerDepth !== settings.defaultCrawlerDepth
            || draft.defaultCrawlerTimeout !== settings.defaultCrawlerTimeout
            || draft.defaultCrawlerMaxUrls !== settings.defaultCrawlerMaxUrls
            || draft.defaultThreads !== settings.defaultThreads
            || draft.defaultTimeout !== settings.defaultTimeout
            || draft.defaultRateLimit !== settings.defaultRateLimit
            || draft.autoOpenReport !== settings.autoOpenReport
            || draft.soundEnabled !== settings.soundEnabled
            || draft.soundVolume !== settings.soundVolume
            || draft.soundOnStart !== settings.soundOnStart
            || draft.soundOnComplete !== settings.soundOnComplete
            || draft.soundOnFinding !== settings.soundOnFinding
            || draft.soundOnClear !== settings.soundOnClear
            || draft.reduceMotion !== settings.reduceMotion
            || draft.uiScale !== settings.uiScale;
    };

    const handleFinalClose = () => {
        if (hasUnsavedChanges()) {
            setShowConfirm(true);
            return;
        }
        setIsClosing(true);
        setTimeout(onClose, 200);
    };
    handleFinalCloseRef.current = handleFinalClose;

    const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setDraft((prev) => {
            let val = value;
            if (key === "uiScale" && typeof value === "number") {
                val = Math.max(75, Math.min(150, value)) as AppSettings[K];
            }
            const next = { ...prev, [key]: val };

            if (key.startsWith("sound") || key === "uiScale" || key === "reduceMotion") {
                saveSettings(next);
                onSave(next);
            }

            return next;
        });
    };

    const handleSave = () => {
        const finalSettings = { ...draft, language: "en" as const };
        saveSettings(finalSettings);
        onSave(finalSettings);
        setIsClosing(true);
        setTimeout(onClose, 200);
    };

    const handleResetToDefaults = () => setDraft({ ...DEFAULT_SETTINGS });

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className={`settings-overlay ${isClosing ? "animate-fade-out" : ""}`}
        >
            <div className={`settings-panel relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-bg-panel shadow-2xl flex flex-col max-h-[85vh] ${isClosing ? "animate-fade-slide-out" : "animate-fade-slide-in"}`}>
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border-subtle shrink-0 bg-gradient-surface">
                    <div>
                        <h2 className="text-sm font-semibold text-text-primary">{t("settingsTitle", draft.language)}</h2>
                        <p className="text-xs text-text-muted mt-0.5">{t("settingsDesc", draft.language)}</p>
                    </div>
                    <button
                        onClick={handleFinalClose}
                        className="rounded-lg p-2 text-text-ghost hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:rotate-90 hover:scale-110 active:scale-90"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">

                    {/* Scanner & Crawler Defaults - Card Section */}
                    <section>
                        <SectionLabel icon={Sliders}>{t("scannerDefaults", draft.language)}</SectionLabel>
                        <div className="mt-4 p-5 rounded-xl bg-bg-card border border-border-subtle space-y-6 shadow-sm">
                            
                            {/* Scanner Sub-section */}
                            <div>
                                <h4 className="text-xs font-bold text-text-primary mb-4 flex items-center gap-2 uppercase tracking-wider">
                                    <Sliders size={14} className="text-accent"/> Scanner Engine
                                </h4>
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <p className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider">{t("defaultThreads", draft.language)}</p>
                                        <SliderWithInput value={draft.defaultThreads} onChange={(v) => set("defaultThreads", v)} min={1} max={500} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider">{t("defaultTimeout", draft.language)} (s)</p>
                                        <SliderWithInput value={draft.defaultTimeout} onChange={(v) => set("defaultTimeout", v)} min={1} max={120} />
                                    </div>
                                </div>
                                <div className="mt-4 w-1/2 pr-2">
                                    <p className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider">{t("defaultRateLimit", draft.language)} (req/s)</p>
                                    <SliderWithInput value={draft.defaultRateLimit} onChange={(v) => set("defaultRateLimit", v)} min={1} max={5000} />
                                </div>
                            </div>

                            <div className="h-px bg-border-subtle/50 w-full" /> {/* Divider */}

                            {/* Crawler Sub-section */}
                            <div>
                                <h4 className="text-xs font-bold text-text-primary mb-4 flex items-center gap-2 uppercase tracking-wider">
                                    <Radar size={14} className="text-accent"/> Crawler Engine
                                </h4>
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <p className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider">{t("maxDepth", draft.language)}</p>
                                        <SliderWithInput value={draft.defaultCrawlerDepth} onChange={(v) => set("defaultCrawlerDepth", v)} min={1} max={10} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider">{t("maxUrls", draft.language)}</p>
                                        <SliderWithInput value={draft.defaultCrawlerMaxUrls} onChange={(v) => set("defaultCrawlerMaxUrls", v)} min={5} max={500} />
                                    </div>
                                </div>
                            </div>

                        </div>
                    </section>

                    {/* Audio & Notifications */}
                    <section>
                        <SectionLabel icon={Volume2}>{t("audioNotifications", draft.language)}</SectionLabel>
                        <div className="mt-4 rounded-xl border border-border-subtle bg-bg-card p-4 transition-all duration-300 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-accent/10 text-accent-text group-hover:scale-110 transition-transform duration-300">
                                        <Volume2 size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-text-primary">{t("enableSounds", draft.language)}</p>
                                        <p className="text-[11px] text-text-muted">{t("enableSoundsDesc", draft.language)}</p>
                                    </div>
                                </div>
                                <div className="pr-1">
                                    <Toggle checked={draft.soundEnabled} onChange={(v) => set("soundEnabled", v)} />
                                </div>
                            </div>

                            <div className={`grid transition-all duration-300 ease-in-out ${draft.soundEnabled ? "grid-rows-[1fr] mt-4 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                                <div className="overflow-hidden space-y-4">
                                    <div className="pt-3 border-t border-border-subtle/30">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-[11px] font-bold text-text-ghost uppercase tracking-wider">{t("volume", draft.language)}</p>
                                            <span className="text-[11px] font-mono text-accent-text">{draft.soundVolume}%</span>
                                        </div>
                                        <SliderWithInput
                                            value={draft.soundVolume}
                                            onChange={(v) => set("soundVolume", v)}
                                            min={0}
                                            max={100}
                                        />
                                    </div>

                                    <div className="space-y-1 pl-3 border-l-2 border-accent/20" dir="ltr">
                                        <ToggleRow
                                            label={t("soundOnStart", draft.language)}
                                            checked={draft.soundOnStart}
                                            onChange={(v) => set("soundOnStart", v)}
                                            onTest={() => playSound("start", true, draft.soundVolume)}
                                            testLabel={t("testSound", draft.language)}
                                        />
                                        <ToggleRow
                                            label={t("soundOnComplete", draft.language)}
                                            checked={draft.soundOnComplete}
                                            onChange={(v) => set("soundOnComplete", v)}
                                            onTest={() => playSound("complete", true, draft.soundVolume)}
                                            testLabel={t("testSound", draft.language)}
                                        />
                                        <ToggleRow
                                            label={t("soundOnFinding", draft.language)}
                                            checked={draft.soundOnFinding}
                                            onChange={(v) => set("soundOnFinding", v)}
                                            onTest={() => playSound("finding", true, draft.soundVolume)}
                                            testLabel={t("testSound", draft.language)}
                                        />
                                        <ToggleRow
                                            label={t("soundOnClear", draft.language)}
                                            checked={draft.soundOnClear}
                                            onChange={(v) => set("soundOnClear", v)}
                                            onTest={() => playSound("clear", true, draft.soundVolume)}
                                            testLabel={t("testSound", draft.language)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Paths & Integrations - Card Section */}
                    <section>
                        <SectionLabel icon={KeyRound}>Paths & Integrations</SectionLabel>
                        <div className="mt-4 p-5 rounded-xl bg-bg-card border border-border-subtle space-y-5 shadow-sm">
                            <div>
                                <label className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider block">
                                    {t("defaultOutputFile", draft.language)}
                                </label>
                                <TextInput
                                    value={draft.defaultOutputPath}
                                    onChange={(v) => set("defaultOutputPath", v)}
                                    placeholder={t("outputFilePlaceholder", draft.language)}
                                    mono
                                />
                                <p className="mt-1.5 text-[10px] text-text-ghost">{t("defaultOutputFileDesc", draft.language)}</p>
                            </div>
                            
                            <div className="pt-2 border-t border-border-subtle/30">
                                <label className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider block mt-3">
                                    {t("webhookUrl", draft.language)}
                                </label>
                                <TextInput
                                    value={draft.globalWebhookUrl}
                                    onChange={(v) => set("globalWebhookUrl", v)}
                                    placeholder="https://discord.com/api/webhooks/..."
                                    mono
                                />
                                <p className="mt-1.5 text-[10px] text-text-ghost">{t("webhookUrlDesc", draft.language)}</p>
                                {webhookError && <p className="mt-1.5 text-xs text-status-critical">{webhookError}</p>}
                            </div>
                        </div>
                    </section>

                    {/* Interface & Behaviour */}
                    <section>
                        <SectionLabel icon={LayoutTemplate}>Interface & Behaviour</SectionLabel>
                        <div className="space-y-3 mt-4">
                            <div className="p-4 rounded-xl bg-bg-card border border-border-subtle group hover:border-accent/30 transition-all duration-300 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform duration-300">
                                        <ZoomIn size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-text-primary">{t("uiScale", draft.language)}</p>
                                        <p className="text-[11px] text-text-muted">{t("uiScaleDesc", draft.language)}</p>
                                    </div>
                                </div>
                                <div className="px-2 pb-1">
                                    <div className="relative w-[calc(100%-80px-1rem)] h-4 text-[10px] text-text-muted mb-1 font-mono uppercase tracking-tighter" dir="ltr">
                                        <span className="absolute left-0">75%</span>
                                        <span className="absolute left-[33.33%] -translate-x-1/2 whitespace-nowrap">100% ({t("defaultLabel", draft.language)})</span>
                                        <span className="absolute right-0">150%</span>
                                    </div>
                                    <SliderWithInput
                                        value={draft.uiScale}
                                        onChange={(v) => set("uiScale", v)}
                                        min={75}
                                        max={150}
                                        step={5}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-bg-card border border-border-subtle group hover:border-accent/30 transition-all duration-300 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-status-info/10 text-status-info group-hover:scale-110 transition-transform duration-300">
                                        <Move size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-text-primary">{t("reduceMotion", draft.language)}</p>
                                        <p className="text-[11px] text-text-muted">{t("reduceMotionDesc", draft.language)}</p>
                                    </div>
                                </div>
                                <Toggle checked={draft.reduceMotion} onChange={(v) => set("reduceMotion", v)} />
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-bg-card border border-border-subtle group hover:border-accent/30 transition-all duration-300 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-accent/10 text-accent-text group-hover:scale-110 transition-transform duration-300">
                                        <ExternalLink size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-text-primary">{t("autoOpenReport", draft.language)}</p>
                                        <p className="text-[11px] text-text-muted">{t("autoOpenReportDesc", draft.language)}</p>
                                    </div>
                                </div>
                                <Toggle checked={draft.autoOpenReport} onChange={(v) => set("autoOpenReport", v)} />
                            </div>
                        </div>
                    </section>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-subtle bg-bg-card flex items-center justify-between shrink-0">
                    <button
                        onClick={handleResetToDefaults}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-text-ghost hover:text-status-critical transition-all duration-300"
                    >
                        <RotateCcw size={14} />
                        {t("resetDefaults", draft.language)}
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleFinalClose}
                            className="px-5 py-2 text-xs font-bold text-text-secondary hover:text-text-primary transition-all duration-300"
                        >
                            {t("cancel", draft.language)}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!!webhookError}
                            className={`bg-accent text-bg-root px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:brightness-110 btn-glow active:scale-95 transition-all duration-300 ${webhookError ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {t("saveChanges", draft.language)}
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmationModal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={onClose}
                title={t("unsavedTitle", draft.language)}
                message={t("unsavedChangesWarning", draft.language)}
                confirmText={t("discardChanges", draft.language)}
                cancelText={t("keepEditing", draft.language)}
                type="warning"
            />
        </div >
    );
}