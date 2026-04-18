import React, { useEffect, useRef, useState } from "react";
import { SectionLabel, TextInput, Toggle, ConfirmationModal } from "./primitives";
import {
    CloseIcon, CogIcon, RotateCcwIcon, SendIcon,
    CpuIcon, BellIcon, LayoutIcon, RadarIcon,
    LinkIcon, VolumeIcon, ZoomInIcon, KeyIcon
} from "./icons";
import { playSound } from "../utils/audio";
import { invoke } from "@tauri-apps/api/core";

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
    language: "en";
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
    language: "en",
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
            merged.language = "en"; // Locked to English for Core Identity
            
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

/* ── Custom Components for Settings ───────────────────────────── */

function SettingsToggleRow({ label, desc, checked, onChange, onTest, testLabel }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; onTest?: () => void; testLabel?: string; }) {
    return (
        <div className="flex items-center justify-between px-4 py-3 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-panel)] hover:border-[color:var(--color-border-hover)] transition-colors duration-150 group/row">
            <div className="flex-1 pr-4">
                <div className="flex items-center gap-3">
                    <span className="text-xs text-[color:var(--color-text-primary)]">{label}</span>
                    {onTest && checked && (
                        <button
                            onClick={onTest}
                            className="opacity-0 group-hover/row:opacity-100 px-2 py-0.5 border border-[color:var(--color-border-subtle)] text-[10px] font-mono uppercase tracking-[0.12em] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)] transition-all duration-150"
                        >
                            {testLabel || "Test"}
                        </button>
                    )}
                </div>
                {desc && <p className="text-[11px] text-[color:var(--color-text-muted)] mt-0.5 leading-snug">{desc}</p>}
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

function SettingsNumberInput({ label, value, onChange, min, max, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; suffix?: string; }) {
    return (
        <div className="flex flex-col gap-1.5">
            {label && <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">{label}</label>}
            <div className="relative w-32">
                <input
                    type="number"
                    value={value || ""} // Allows the field to be empty while typing
                    onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onChange(isNaN(val) ? 0 : val); // Temporarily allow 0/empty to trigger the save button
                    }}
                    onBlur={(e) => {
                        // Clamp to min/max only when the user finishes typing and clicks away
                        const val = parseInt(e.target.value, 10);
                        let finalVal = isNaN(val) ? min : val;
                        finalVal = Math.max(min, Math.min(max, finalVal));
                        onChange(finalVal);
                    }}
                    className="w-full bg-[color:var(--color-bg-input)] border border-[color:var(--color-border-subtle)] pl-3 pr-8 py-2 text-xs text-[color:var(--color-text-primary)] font-mono focus:border-[color:var(--color-accent)] focus:outline-none transition-colors duration-150"
                />
                {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[color:var(--color-text-muted)] select-none pointer-events-none">{suffix}</span>}
            </div>
        </div>
    );
}

/* ── Modal ────────────────────────────────────────────────────── */
interface SettingsModalProps {
    settings: AppSettings;
    onSave: (s: AppSettings) => void;
    onClose: () => void;
}

type TabID = "engine" | "alerts" | "workspace";

export function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
    const [draft, setDraft] = useState<AppSettings>({ ...settings, language: "en" });
    const [activeTab, setActiveTab] = useState<TabID>("engine");
    const [showConfirm, setShowConfirm] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isTestingWebhook, setIsTestingWebhook] = useState(false);
    const [webhookTestSuccess, setWebhookTestSuccess] = useState(false);
    const [webhookTestError, setWebhookTestError] = useState<string | null>(null);
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

    // Less aggressive validation: only error if it's not empty AND doesn't start with http
    const currentUrl = draft.globalWebhookUrl.trim();
    const isWebhookValid = currentUrl === "" || /^https?:\/\/.+/.test(currentUrl);
    const webhookError = !isWebhookValid ? "Invalid URL: Must start with http:// or https://" : null;

    const hasUnsavedChanges = () => {
        return Object.keys(draft).some(
            (k) => draft[k as keyof AppSettings] !== settings[k as keyof AppSettings]
        );
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
        setDraft((prev) => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        const finalSettings = { ...draft, language: "en" as const };
        // Ensure UI scale is strictly clamped before saving
        finalSettings.uiScale = Math.max(75, Math.min(150, finalSettings.uiScale));
        
        saveSettings(finalSettings);
        onSave(finalSettings);
        setIsClosing(true);
        setTimeout(onClose, 200);
    };

    const handleResetToDefaults = () => setDraft({ ...DEFAULT_SETTINGS });

    const handleTestWebhook = async () => {
        if (!currentUrl || !isWebhookValid) return;
        setIsTestingWebhook(true);
        try {
            await invoke("test_webhook", { url: currentUrl });
            setWebhookTestSuccess(true);
            setTimeout(() => setWebhookTestSuccess(false), 2000);
        } catch (err) {
            setWebhookTestError(`Webhook test failed: ${err}`);
            setTimeout(() => setWebhookTestError(null), 3000);
        } finally {
            setTimeout(() => setIsTestingWebhook(false), 600);
        }
    };

    const tabs = [
        { id: "engine",    label: "Engine Config",   icon: CpuIcon,    desc: "Scanner & Crawler limits" },
        { id: "alerts",    label: "Alerts & Audio",  icon: BellIcon,   desc: "Webhooks & Sounds" },
        { id: "workspace", label: "Workspace",        icon: LayoutIcon, desc: "UI, Paths & Scaling" }
    ] as const;

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}
        >
            <div className={`relative w-full max-w-4xl h-[75vh] flex flex-col overflow-hidden border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-panel)] ${isClosing ? "animate-fade-slide-out" : "animate-fade-slide-in"}`}>
                
                {/* Global Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--color-border-subtle)] shrink-0">
                    <div className="flex items-center gap-2.5">
                        <CogIcon size={14} className="text-[color:var(--color-accent)]" />
                        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-accent)]">Settings</span>
                        <span className="text-[color:var(--color-border-hover)] mx-1 text-[10px]">/</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-muted)]">Application Preferences</span>
                    </div>
                    <button
                        onClick={handleFinalClose}
                        className="w-6 h-6 flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] transition-colors duration-150"
                    >
                        <CloseIcon size={14} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden min-h-0">
                    
                    {/* Sidebar Navigation */}
                    <div className="w-52 shrink-0 border-r border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)] flex flex-col gap-px p-2">
                        {tabs.map((tab) => {
                            const TabIcon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabID)}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 ${
                                        isActive
                                            ? "bg-[color:var(--color-bg-hover)] border-l-2 border-[color:var(--color-accent)] text-[color:var(--color-text-primary)]"
                                            : "border-l-2 border-transparent text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-hover)] hover:text-[color:var(--color-text-primary)]"
                                    }`}
                                >
                                    <TabIcon size={13} className={isActive ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-text-ghost)]"} />
                                    <div>
                                        <div className={`text-[11px] font-mono uppercase tracking-[0.12em] ${isActive ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-muted)]"}`}>
                                            {tab.label}
                                        </div>
                                        <div className="text-[10px] text-[color:var(--color-text-ghost)] mt-0.5 leading-none">{tab.desc}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar bg-[color:var(--color-bg-panel)]">
                        
                        {/* ── TAB 1: ENGINE CONFIG ── */}
                        {activeTab === "engine" && (
                            <div className="space-y-8 animate-fade-slide-in">
                                <section>
                                    <SectionLabel icon={CpuIcon}>Scanner Defaults</SectionLabel>
                                    <div className="mt-3 p-5 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)] flex gap-8">
                                        <SettingsNumberInput label="Threads" value={draft.defaultThreads} onChange={(v) => set("defaultThreads", v)} min={1} max={500} />
                                        <SettingsNumberInput label="Timeout" value={draft.defaultTimeout} onChange={(v) => set("defaultTimeout", v)} min={1} max={120} suffix="s" />
                                        <SettingsNumberInput label="Rate Limit" value={draft.defaultRateLimit} onChange={(v) => set("defaultRateLimit", v)} min={1} max={5000} suffix="req/s" />
                                    </div>
                                </section>

                                <section>
                                    <SectionLabel icon={RadarIcon}>Crawler Defaults</SectionLabel>
                                    <div className="mt-3 p-5 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)] flex gap-8">
                                        <SettingsNumberInput label="Max Depth" value={draft.defaultCrawlerDepth} onChange={(v) => set("defaultCrawlerDepth", v)} min={1} max={10} />
                                        <SettingsNumberInput label="Max URLs" value={draft.defaultCrawlerMaxUrls} onChange={(v) => set("defaultCrawlerMaxUrls", v)} min={5} max={500} />
                                        <SettingsNumberInput label="Timeout" value={draft.defaultCrawlerTimeout} onChange={(v) => set("defaultCrawlerTimeout", v)} min={1} max={300} suffix="s" />
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* ── TAB 2: ALERTS & AUDIO ── */}
                        {activeTab === "alerts" && (
                            <div className="space-y-8 animate-fade-slide-in">
                                <section>
                                    <SectionLabel icon={LinkIcon}>Integrations</SectionLabel>
                                    <div className="mt-3 p-5 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)]">
                                        <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-text-muted)] mb-2 block">
                                            Global Webhook URL
                                        </label>
                                        <div className="flex gap-3 items-start">
                                            <div className="flex-1">
                                                <TextInput
                                                    value={draft.globalWebhookUrl}
                                                    onChange={(v) => set("globalWebhookUrl", v)}
                                                    placeholder="https://discord.com/api/webhooks/..."
                                                    mono
                                                />
                                            </div>
                                            <button
                                                onClick={handleTestWebhook}
                                                disabled={!currentUrl || !isWebhookValid || isTestingWebhook}
                                                className={`flex shrink-0 items-center gap-2 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.15em] border transition-colors duration-150 ${
                                                    (!currentUrl || !isWebhookValid)
                                                        ? "border-[color:var(--color-border-subtle)] text-[color:var(--color-text-ghost)] cursor-not-allowed"
                                                        : "border-[color:var(--color-accent)] text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white"
                                                }`}
                                            >
                                                <SendIcon size={12} />
                                                {isTestingWebhook ? "Sending..." : "Test Webhook"}
                                            </button>
                                        </div>
                                        <p className="mt-2 text-[11px] text-[color:var(--color-text-ghost)]">Automatically sends scan alerts to this webhook (supports Discord/Slack/n8n).</p>
                                        {webhookError && <p className="mt-2 text-xs font-mono text-[color:var(--color-status-critical)] border border-[color:var(--color-status-critical)]/30 px-3 py-1.5 inline-block">{webhookError}</p>}
                                        {webhookTestSuccess && (
                                            <span className="mt-2 text-xs font-mono text-[color:var(--color-status-success)] animate-fade-slide-in block">
                                                ✓ Connected
                                            </span>
                                        )}
                                        {webhookTestError && (
                                            <p className="mt-2 text-xs font-mono text-[color:var(--color-status-critical)] block">
                                                {webhookTestError}
                                            </p>
                                        )}
                                    </div>
                                </section>

                                <section>
                                    <SectionLabel icon={VolumeIcon}>Audio Notifications</SectionLabel>
                                    <div className="mt-3 space-y-px">
                                        <SettingsToggleRow
                                            label="Enable Master Sound"
                                            desc="Play sound effects for important scan events"
                                            checked={draft.soundEnabled}
                                            onChange={(v) => set("soundEnabled", v)}
                                        />

                                        <div className={`transition-all duration-300 overflow-hidden ${draft.soundEnabled ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
                                            <div className="p-5 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)] mt-px space-y-4">
                                                <SettingsNumberInput label="Master Volume" value={draft.soundVolume} onChange={(v) => set("soundVolume", v)} min={0} max={100} suffix="%" />

                                                <div className="grid grid-cols-2 gap-px pt-4 border-t border-[color:var(--color-border-subtle)]">
                                                    <SettingsToggleRow label="Scan Start" checked={draft.soundOnStart} onChange={(v) => set("soundOnStart", v)} onTest={() => playSound("start", true, draft.soundVolume)} />
                                                    <SettingsToggleRow label="Scan Complete" checked={draft.soundOnComplete} onChange={(v) => set("soundOnComplete", v)} onTest={() => playSound("complete", true, draft.soundVolume)} />
                                                    <SettingsToggleRow label="Finding Discovered" checked={draft.soundOnFinding} onChange={(v) => set("soundOnFinding", v)} onTest={() => playSound("finding", true, draft.soundVolume)} />
                                                    <SettingsToggleRow label="List Cleared" checked={draft.soundOnClear} onChange={(v) => set("soundOnClear", v)} onTest={() => playSound("clear", true, draft.soundVolume)} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* ── TAB 3: WORKSPACE ── */}
                        {activeTab === "workspace" && (
                            <div className="space-y-8 animate-fade-slide-in">
                                <section>
                                    <SectionLabel icon={KeyIcon}>Paths</SectionLabel>
                                    <div className="mt-3 p-5 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)]">
                                        <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-text-muted)] mb-2 block">
                                            Default Output File
                                        </label>
                                        <TextInput
                                            value={draft.defaultOutputPath}
                                            onChange={(v) => set("defaultOutputPath", v)}
                                            placeholder="scan_results.json"
                                            mono
                                        />
                                        <p className="mt-2 text-[11px] text-[color:var(--color-text-ghost)]">Relative to the Arkenar installation directory.</p>
                                    </div>
                                </section>

                                <section>
                                    <SectionLabel icon={LayoutIcon}>Interface & Behaviour</SectionLabel>
                                    <div className="mt-3 space-y-px">
                                        <div className="p-5 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)] flex justify-between items-center gap-4">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <ZoomInIcon size={13} className="text-[color:var(--color-accent)]" />
                                                    <span className="text-xs text-[color:var(--color-text-primary)]">UI Scale</span>
                                                </div>
                                                <p className="text-[11px] text-[color:var(--color-text-muted)]">Adjust the overall size of text and interface elements. Applies on save.</p>
                                            </div>
                                            <SettingsNumberInput label="" value={draft.uiScale} onChange={(v) => set("uiScale", v)} min={75} max={150} suffix="%" />
                                        </div>

                                        <SettingsToggleRow
                                            label="Reduce Motion"
                                            desc="Disables smooth transitions, glowing effects, and animations to save GPU resources."
                                            checked={draft.reduceMotion}
                                            onChange={(v) => set("reduceMotion", v)}
                                        />
                                        <SettingsToggleRow
                                            label="Auto-open HTML Report"
                                            desc="Automatically open the scan results in your default web browser once finished."
                                            checked={draft.autoOpenReport}
                                            onChange={(v) => set("autoOpenReport", v)}
                                        />
                                    </div>
                                </section>
                            </div>
                        )}

                    </div>
                </div>

                {/* Global Footer */}
                <div className="px-5 py-3 border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)] flex items-center justify-between shrink-0">
                    <button
                        onClick={handleResetToDefaults}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-status-critical)] transition-colors duration-150"
                    >
                        <RotateCcwIcon size={12} />
                        Reset All Defaults
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleFinalClose}
                            className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-[color:var(--color-text-muted)] border border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-bg-hover)] hover:text-[color:var(--color-text-primary)] transition-colors duration-150"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!!webhookError || !hasUnsavedChanges()}
                            className={`px-5 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] bg-[color:var(--color-accent)] text-white border border-[color:var(--color-accent)] transition-all duration-150 ${
                                (webhookError || !hasUnsavedChanges()) ? "opacity-40 cursor-not-allowed" : "hover:brightness-110 active:scale-95"
                            }`}
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmationModal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={onClose}
                title="Unsaved Changes"
                message="You have unsaved changes in your settings. If you leave now, they will be lost."
                confirmText="Discard Changes"
                cancelText="Keep Editing"
                type="warning"
            />
        </div >
    );
}