import React, { useEffect, useRef, useState } from "react";
import { SectionLabel, TextInput, SliderWithInput, Toggle, ConfirmationModal } from "./primitives";
import {
    X, Palette, FolderOutput, Sliders, KeyRound, RotateCcw, Moon, Sun, Radar,
    Accessibility, Sparkles, Move, ZoomIn, Globe, Check, ExternalLink, Info
} from "lucide-react";
import { t } from "../utils/i18n";


/* ── Persisted settings shape ─────────────────────────────────── */
export interface AppSettings {
    // Appearance
    accentColor: string;
    theme: "dark" | "light" | "cosmic" | "emerald";
    // Scanner defaults
    defaultThreads: number;
    defaultTimeout: number;
    defaultRateLimit: number;
    // Paths
    defaultOutputPath: string;
    // Integrations
    globalWebhookUrl: string;
    // Crawler defaults
    defaultCrawlerDepth: number;
    defaultCrawlerTimeout: number;
    defaultCrawlerMaxUrls: number;
    // Behaviour
    autoOpenReport: boolean;
    showTimestamps: boolean;
    // Accessibility
    enableStars: boolean;
    reduceMotion: boolean;
    uiScale: number;
    language: "en" | "ar";
}

export const DEFAULT_SETTINGS: AppSettings = {
    accentColor: "#EA580C",
    theme: "dark",
    defaultThreads: 50,
    defaultTimeout: 5,
    defaultRateLimit: 100,
    defaultOutputPath: "scan_results.json",
    globalWebhookUrl: "",
    defaultCrawlerDepth: 3,
    defaultCrawlerTimeout: 60,
    defaultCrawlerMaxUrls: 50,
    autoOpenReport: true,
    showTimestamps: true,
    enableStars: true,
    reduceMotion: false,
    uiScale: 100,
    language: "en",
};

const STORAGE_KEY = "arkenar_settings";

export function loadSettings(): AppSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Validate types to guard against corrupted localStorage
            if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_SETTINGS };
            const merged = { ...DEFAULT_SETTINGS, ...parsed };
            // Type-check critical fields
            if (typeof merged.accentColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(merged.accentColor)) merged.accentColor = DEFAULT_SETTINGS.accentColor;
            if (merged.theme !== "dark" && merged.theme !== "light" && merged.theme !== "cosmic" && merged.theme !== "emerald") merged.theme = DEFAULT_SETTINGS.theme;
            if (typeof merged.defaultCrawlerDepth !== "number") merged.defaultCrawlerDepth = DEFAULT_SETTINGS.defaultCrawlerDepth;
            if (typeof merged.defaultCrawlerTimeout !== "number") merged.defaultCrawlerTimeout = DEFAULT_SETTINGS.defaultCrawlerTimeout;
            if (typeof merged.defaultCrawlerMaxUrls !== "number") merged.defaultCrawlerMaxUrls = DEFAULT_SETTINGS.defaultCrawlerMaxUrls;
            if (typeof merged.uiScale !== "number") merged.uiScale = DEFAULT_SETTINGS.uiScale;
            if (typeof merged.enableStars !== "boolean") merged.enableStars = DEFAULT_SETTINGS.enableStars;
            if (typeof merged.reduceMotion !== "boolean") merged.reduceMotion = DEFAULT_SETTINGS.reduceMotion;
            return merged;

        }
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: AppSettings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function applyAccentColor(hex: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const rgb = `${r}, ${g}, ${b}`;

    // Compute a ~10% brighter hover shade by boosting each channel slightly.
    const br = Math.min(255, Math.round(r * 1.12));
    const bg = Math.min(255, Math.round(g * 1.12));
    const bb = Math.min(255, Math.round(b * 1.12));
    const hoverHex = `#${br.toString(16).padStart(2, "0")}${bg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;

    const root = document.documentElement;
    root.style.setProperty("--color-accent", hex);
    root.style.setProperty("--color-accent-text", hex);
    root.style.setProperty("--color-accent-hover", hoverHex);
    root.style.setProperty("--color-accent-dim", `rgba(${rgb}, 0.10)`);
    root.style.setProperty("--color-border-focus", `rgba(${rgb}, 0.40)`);
    root.style.setProperty("--color-status-info", hex);
    root.style.setProperty("--shadow-accent-glow", `0 0 24px rgba(${rgb}, 0.12), 0 0 48px rgba(${rgb}, 0.04)`);
    root.style.setProperty("--shadow-accent-btn", `0 0 20px rgba(${rgb}, 0.20), 0 0 40px rgba(${rgb}, 0.06)`);
}

/* ── Accent presets ───────────────────────────────────────────── */
const ACCENT_PRESETS = [
    { label: "Orange", color: "#EA580C" },
    { label: "Teal", color: "#00d5be" },
    { label: "Violet", color: "#8b5cf6" },
    { label: "Blue", color: "#3b82f6" },
    { label: "Rose", color: "#f43f5e" },
    { label: "Amber", color: "#f59e0b" },
    { label: "Lime", color: "#84cc16" },
];

/* ── Modal ────────────────────────────────────────────────────── */
interface SettingsModalProps {
    settings: AppSettings;
    onSave: (s: AppSettings) => void;
    onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
    const [draft, setDraft] = useState<AppSettings>({ ...settings });
    const [showConfirm, setShowConfirm] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    // Keep a ref so the keydown listener always calls the latest version of
    // handleFinalClose without needing to re-subscribe on every render.
    const handleFinalCloseRef = useRef<() => void>(() => {});

    // Close on Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleFinalCloseRef.current(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []); // only register once — the ref always points to the latest handler

    // Close on backdrop click
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) handleFinalClose();
    };

    // Webhook validation
    const webhookError = draft.globalWebhookUrl.trim() !== "" && !/^https:\/\/.+/.test(draft.globalWebhookUrl.trim())
        ? t("webhookUrlError", draft.language) : null;

    // Check for unsaved non-appearance changes
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
            || draft.showTimestamps !== settings.showTimestamps;
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

    const handleClose = () => {
        handleFinalClose();
    };

    const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setDraft((prev) => {
            let val = value;
            if (key === "uiScale" && typeof value === "number") {
                val = Math.max(75, Math.min(150, value)) as AppSettings[K];
            }
            const next = { ...prev, [key]: val };

            // Auto-apply appearance changes instantly
            if (key === "accentColor" || key === "theme" || key === "uiScale" || key === "language") {
                saveSettings(next);
                onSave(next); // This pushes the state to App.tsx, triggering the live DOM update
            }

            return next;
        });
    };

    const handleSave = () => {
        saveSettings(draft);
        onSave(draft);
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
            <div className={`settings-panel ${isClosing ? "animate-fade-slide-out" : "animate-fade-slide-in"}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border-subtle">
                    <div>
                        <h2 className="text-sm font-semibold text-text-primary">{t("settingsTitle", draft.language)}</h2>
                        <p className="text-xs text-text-muted mt-0.5">{t("settingsDesc", draft.language)}</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="rounded-lg p-2 text-text-ghost hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:rotate-90 hover:scale-110 active:scale-90"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

                    {/* Localization */}
                    <section className="flex flex-col items-center text-center">
                        <SectionLabel icon={Globe}>{t("localization", draft.language)}</SectionLabel>

                        <div className="flex flex-col items-center">
                            <p className="text-xs text-text-muted mb-3">{t("language", draft.language)}</p>
                            <div className="relative flex w-56 rounded-xl bg-bg-input p-1.5 border border-border-subtle shadow-inner" dir="ltr">
                                <div
                                    className="absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/2)] rounded-lg bg-accent transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-md"
                                    style={{
                                        transform: `translateX(calc(${draft.language === "en" ? "0" : "1"} * 100%))`,
                                    }}
                                />
                                <button
                                    onClick={() => set("language", "en")}
                                    className={`relative z-10 flex flex-1 items-center justify-center py-2 text-xs font-bold transition-colors duration-300 ${draft.language === "en" ? "text-bg-root" : "text-text-muted hover:text-text-secondary"}`}
                                >
                                    English
                                </button>
                                <button
                                    onClick={() => set("language", "ar")}
                                    className={`relative z-10 flex flex-1 items-center justify-center py-2 text-xs font-bold transition-colors duration-300 ${draft.language === "ar" ? "text-bg-root" : "text-text-muted hover:text-text-secondary"}`}
                                >
                                    العربية
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Appearance */}
                    <section className="flex flex-col items-center text-center">
                        <SectionLabel icon={Palette}>{t("appearance", draft.language)}</SectionLabel>

                        <div className="mb-6 flex flex-col items-center">
                            <p className="text-xs text-text-muted mb-3">{t("theme", draft.language)}</p>
                            <div className="relative flex w-56 rounded-xl bg-bg-input p-1.5 border border-border-subtle shadow-inner" dir="ltr">
                                <div
                                    className="absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/4)] rounded-lg bg-accent transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-md"
                                    style={{
                                        transform: `translateX(calc(${draft.theme === "dark" ? "0" :
                                            draft.theme === "light" ? "1" :
                                                draft.theme === "cosmic" ? "2" : "3"
                                            } * 100%))`,
                                    }}

                                />
                                <button
                                    onClick={() => set("theme", "dark")}
                                    title={t("themeDark", draft.language)}
                                    className={`relative z-10 flex flex-1 items-center justify-center py-2 transition-colors duration-300 ${draft.theme === "dark" ? "text-bg-root" : "text-text-muted hover:text-text-secondary"}`}
                                >
                                    <Moon size={16} />
                                </button>
                                <button
                                    onClick={() => set("theme", "light")}
                                    title={t("themeLight", draft.language)}
                                    className={`relative z-10 flex flex-1 items-center justify-center py-2 transition-colors duration-300 ${draft.theme === "light" ? "text-bg-root" : "text-text-muted hover:text-text-secondary"}`}
                                >
                                    <Sun size={16} />
                                </button>
                                <button
                                    onClick={() => set("theme", "cosmic")}
                                    title={t("themeCosmic", draft.language)}
                                    className={`relative z-10 flex flex-1 items-center justify-center py-2 transition-colors duration-300 ${draft.theme === "cosmic" ? "text-bg-root" : "text-text-muted hover:text-text-secondary"}`}
                                >
                                    <span className="text-sm">🌌</span>
                                </button>
                                <button
                                    onClick={() => set("theme", "emerald")}
                                    title={t("themeEmerald", draft.language)}
                                    className={`relative z-10 flex flex-1 items-center justify-center py-2 transition-colors duration-300 ${draft.theme === "emerald" ? "text-bg-root" : "text-text-muted hover:text-text-secondary"}`}
                                >
                                    <span className="text-sm">🌿</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col items-center">
                            <p className="text-xs text-text-muted mb-3">{t("accentColorLabel", draft.language)}</p>
                            <div className="flex gap-2.5 flex-wrap justify-center max-w-[280px]">
                                {ACCENT_PRESETS.map((p) => (
                                    <button
                                        key={p.color}
                                        onClick={() => set("accentColor", p.color)}
                                        title={p.label}
                                        className={`settings-color-swatch ${draft.accentColor === p.color ? "settings-color-swatch--active" : ""}`}
                                        style={{ "--swatch": p.color } as React.CSSProperties}
                                    />
                                ))}
                                {/* Custom hex */}
                                <div className="flex items-center gap-1.5 ml-1">
                                    <input
                                        type="color"
                                        value={draft.accentColor}
                                        onChange={(e) => set("accentColor", e.target.value)}
                                        className="settings-color-picker"
                                        title={t("customColor", draft.language)}
                                    />
                                    <span className="font-mono text-[11px] text-text-muted">{draft.accentColor}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Crawler defaults */}
                    <section>
                        <SectionLabel icon={Radar}>{t("crawlerDefaults", draft.language)}</SectionLabel>
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs text-text-muted mb-2">{t("maxDepth", draft.language)}</p>
                                <SliderWithInput value={draft.defaultCrawlerDepth} onChange={(v) => set("defaultCrawlerDepth", v)} min={1} max={10} />
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-2">{t("timeout", draft.language)} (s)</p>
                                <SliderWithInput value={draft.defaultCrawlerTimeout} onChange={(v) => set("defaultCrawlerTimeout", v)} min={10} max={300} />
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-2">{t("maxUrls", draft.language)}</p>
                                <SliderWithInput value={draft.defaultCrawlerMaxUrls} onChange={(v) => set("defaultCrawlerMaxUrls", v)} min={5} max={500} />
                            </div>
                        </div>
                    </section>

                    {/* Scanner defaults */}
                    <section>
                        <SectionLabel icon={Sliders}>{t("scannerDefaults", draft.language)}</SectionLabel>
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs text-text-muted mb-2">{t("defaultThreads", draft.language)}</p>
                                <SliderWithInput value={draft.defaultThreads} onChange={(v) => set("defaultThreads", v)} min={1} max={500} />
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-2">{t("defaultTimeout", draft.language)} (s)</p>
                                <SliderWithInput value={draft.defaultTimeout} onChange={(v) => set("defaultTimeout", v)} min={1} max={120} />
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-2">{t("defaultRateLimit", draft.language)} (req/s)</p>
                                <SliderWithInput value={draft.defaultRateLimit} onChange={(v) => set("defaultRateLimit", v)} min={1} max={5000} />
                            </div>
                        </div>
                    </section>

                    {/* Output paths */}
                    <section>
                        <SectionLabel icon={FolderOutput}>{t("paths", draft.language)}</SectionLabel>
                        <div>
                            <p className="text-xs text-text-muted mb-1.5">{t("defaultOutputFile", draft.language)}</p>
                            <TextInput
                                value={draft.defaultOutputPath}
                                onChange={(v) => set("defaultOutputPath", v)}
                                placeholder={t("outputFilePlaceholder", draft.language)}
                                mono
                            />
                            <p className="mt-1.5 text-xs text-text-ghost">{t("defaultOutputFileDesc", draft.language)}</p>
                        </div>
                    </section>

                    {/* Integrations / API */}
                    <section>
                        <SectionLabel icon={KeyRound}>{t("integrationsTitle", draft.language)}</SectionLabel>
                        <div>
                            <p className="text-xs text-text-muted mb-1.5">{t("webhookUrl", draft.language)}</p>
                            <TextInput
                                value={draft.globalWebhookUrl}
                                onChange={(v) => set("globalWebhookUrl", v)}
                                placeholder="https://discord.com/api/webhooks/..."
                                mono
                            />
                            <p className="mt-1.5 text-xs text-text-ghost">{t("webhookUrlDesc", draft.language)}</p>
                            {webhookError && <p className="mt-1.5 text-xs text-status-critical">{webhookError}</p>}
                        </div>
                    </section>

                    {/* Accessibility */}

                    <section>
                        <SectionLabel icon={Accessibility}>{t("accessibility", draft.language)}</SectionLabel>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 rounded-xl bg-bg-card border border-border-subtle group hover:bg-bg-hover transition-all duration-300">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-accent/10 text-accent-text group-hover:scale-110 transition-transform duration-300">
                                        <Sparkles size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-text-primary">{t("backgroundStars", draft.language)}</p>
                                        <p className="text-[11px] text-text-muted">{t("backgroundStarsDesc", draft.language)}</p>
                                    </div>
                                </div>
                                <Toggle checked={draft.enableStars} onChange={(v) => set("enableStars", v)} />
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-xl bg-bg-card border border-border-subtle group hover:bg-bg-hover transition-all duration-300">
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

                            <div className="p-3 rounded-xl bg-bg-card border border-border-subtle group hover:bg-bg-hover transition-all duration-300">
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
                        </div>
                    </section>

                    {/* Behaviour */}
                    <section>
                        <SectionLabel icon={Info}>{t("behaviour", draft.language)}</SectionLabel>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 rounded-xl bg-bg-card border border-border-subtle group hover:bg-bg-hover transition-all duration-300">
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

                            <div className="flex items-center justify-between p-3 rounded-xl bg-bg-card border border-border-subtle group hover:bg-bg-hover transition-all duration-300">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-status-info/10 text-status-info group-hover:scale-110 transition-transform duration-300">
                                        <Check size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-text-primary">{t("showTimestamps", draft.language)}</p>
                                        <p className="text-[11px] text-text-muted">{t("showTimestampsDesc", draft.language)}</p>
                                    </div>
                                </div>
                                <Toggle checked={draft.showTimestamps} onChange={(v) => set("showTimestamps", v)} />
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-subtle bg-bg-card flex items-center justify-between">
                    <button
                        onClick={handleResetToDefaults}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-text-ghost hover:text-status-critical transition-all duration-300"
                    >
                        <RotateCcw size={14} />
                        {t("resetDefaults", draft.language)}
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleClose}
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
