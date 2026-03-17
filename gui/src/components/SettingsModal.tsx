import React, { useEffect, useRef, useState } from "react";
import { SectionLabel, TextInput, Toggle, ConfirmationModal } from "./primitives";
import {
    X, Sliders, KeyRound, RotateCcw, Radar,
    ZoomIn, Volume2, LayoutTemplate,
    Cpu, BellRing, Link, Send
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
        <div className="flex items-center justify-between p-4 rounded-xl border border-border-subtle bg-bg-card hover:border-border-hover transition-all duration-200 group/row">
            <div className="flex-1 pr-4">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-text-primary">{label}</span>
                    {onTest && checked && (
                        <button
                            onClick={onTest}
                            className="opacity-0 group-hover/row:opacity-100 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-[10px] font-bold uppercase tracking-wider text-accent-text hover:bg-accent/20 transition-all duration-200"
                        >
                            {testLabel || "Test"}
                        </button>
                    )}
                </div>
                {desc && <p className="text-[11px] text-text-muted mt-1">{desc}</p>}
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

function SettingsNumberInput({ label, value, onChange, min, max, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; suffix?: string; }) {
    return (
        <div className="flex flex-col gap-2">
            {label && <label className="text-[11px] text-text-muted font-bold uppercase tracking-wider">{label}</label>}
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
                    className="w-full bg-bg-root border border-border-subtle rounded-lg pl-3 pr-8 py-2.5 text-sm text-text-primary font-mono focus:border-accent focus:ring-1 focus:ring-accent/50 outline-none transition-all"
                />
                {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted select-none pointer-events-none">{suffix}</span>}
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
            // Use the Rust-side command so SSRF validation (block loopback / RFC-1918 / .local)
            // is enforced — same path as the real scan webhook delivery.
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("test_webhook", { url: currentUrl });
        } catch (err) {
            console.error("Webhook test failed:", err);
        } finally {
            setTimeout(() => setIsTestingWebhook(false), 600);
        }
    };

    const tabs = [
        { id: "engine", label: "Engine Config", icon: Cpu, desc: "Scanner & Crawler limits" },
        { id: "alerts", label: "Alerts & Audio", icon: BellRing, desc: "Webhooks & Sounds" },
        { id: "workspace", label: "Workspace", icon: LayoutTemplate, desc: "UI, Paths & Scaling" }
    ] as const;

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}
        >
            <div className={`relative w-full max-w-4xl h-[75vh] flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-panel shadow-2xl ${isClosing ? "animate-fade-slide-out" : "animate-fade-slide-in"}`}>
                
                {/* Global Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0 bg-gradient-surface">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-accent/10 border border-accent/20 text-accent-text">
                            <Sliders size={18} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-text-primary tracking-wide">Settings</h2>
                            <p className="text-[11px] text-text-muted uppercase tracking-widest mt-0.5">Application Preferences</p>
                        </div>
                    </div>
                    <button
                        onClick={handleFinalClose}
                        className="rounded-lg p-2 text-text-ghost hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:rotate-90 hover:scale-110 active:scale-90"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden min-h-0">
                    
                    {/* Sidebar Navigation */}
                    <div className="w-64 shrink-0 border-r border-border-subtle bg-bg-root/50 p-4 flex flex-col gap-2">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabID)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${
                                        isActive 
                                            ? "bg-accent/10 border border-accent/20 shadow-[0_0_15px_rgba(var(--color-accent),0.05)]" 
                                            : "border border-transparent hover:bg-bg-hover hover:border-border-subtle"
                                    }`}
                                >
                                    <Icon size={18} className={isActive ? "text-accent-text" : "text-text-ghost"} strokeWidth={2} />
                                    <div>
                                        <div className={`text-sm font-bold ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
                                            {tab.label}
                                        </div>
                                        <div className={`text-[10px] mt-0.5 ${isActive ? "text-accent-text/70" : "text-text-muted"}`}>
                                            {tab.desc}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto px-10 py-8 custom-scrollbar bg-bg-panel">
                        
                        {/* ── TAB 1: ENGINE CONFIG ── */}
                        {activeTab === "engine" && (
                            <div className="space-y-8 animate-fade-slide-in">
                                <section>
                                    <SectionLabel icon={Cpu}>Scanner Defaults</SectionLabel>
                                    <div className="mt-4 p-6 rounded-xl border border-border-subtle bg-bg-card shadow-sm flex gap-10">
                                        <SettingsNumberInput label="Threads" value={draft.defaultThreads} onChange={(v) => set("defaultThreads", v)} min={1} max={500} />
                                        <SettingsNumberInput label="Timeout" value={draft.defaultTimeout} onChange={(v) => set("defaultTimeout", v)} min={1} max={120} suffix="s" />
                                        <SettingsNumberInput label="Rate Limit" value={draft.defaultRateLimit} onChange={(v) => set("defaultRateLimit", v)} min={1} max={5000} suffix="req/s" />
                                    </div>
                                </section>

                                <section>
                                    <SectionLabel icon={Radar}>Crawler Defaults</SectionLabel>
                                    <div className="mt-4 p-6 rounded-xl border border-border-subtle bg-bg-card shadow-sm flex gap-10">
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
                                    <SectionLabel icon={Link}>Integrations</SectionLabel>
                                    <div className="mt-4 p-6 rounded-xl border border-border-subtle bg-bg-card shadow-sm">
                                        <label className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider block">
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
                                                className={`flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                                    (!currentUrl || !isWebhookValid) 
                                                        ? 'bg-bg-hover text-text-ghost cursor-not-allowed' 
                                                        : 'bg-accent/10 text-accent-text border border-accent/20 hover:bg-accent/20'
                                                }`}
                                            >
                                                <Send size={14} />
                                                {isTestingWebhook ? "Sending..." : "Test Webhook"}
                                            </button>
                                        </div>
                                        <p className="mt-2 text-xs text-text-ghost">Automatically sends scan alerts to this webhook (supports Discord/Slack/n8n).</p>
                                        {webhookError && <p className="mt-2 text-xs font-semibold text-status-critical bg-status-critical/10 px-3 py-2 rounded-lg border border-status-critical/20 inline-block">{webhookError}</p>}
                                    </div>
                                </section>

                                <section>
                                    <SectionLabel icon={Volume2}>Audio Notifications</SectionLabel>
                                    <div className="mt-4 space-y-3">
                                        <SettingsToggleRow
                                            label="Enable Master Sound"
                                            desc="Play sound effects for important scan events"
                                            checked={draft.soundEnabled}
                                            onChange={(v) => set("soundEnabled", v)}
                                        />

                                        <div className={`transition-all duration-300 overflow-hidden ${draft.soundEnabled ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
                                            <div className="p-6 rounded-xl border border-border-subtle bg-bg-card shadow-sm mt-3 space-y-6">
                                                
                                                <SettingsNumberInput label="Master Volume" value={draft.soundVolume} onChange={(v) => set("soundVolume", v)} min={0} max={100} suffix="%" />

                                                <div className="grid grid-cols-2 gap-3 pt-6 border-t border-border-subtle/50">
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
                                    <SectionLabel icon={KeyRound}>Paths</SectionLabel>
                                    <div className="mt-4 p-6 rounded-xl border border-border-subtle bg-bg-card shadow-sm">
                                        <label className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider block">
                                            Default Output File
                                        </label>
                                        <TextInput
                                            value={draft.defaultOutputPath}
                                            onChange={(v) => set("defaultOutputPath", v)}
                                            placeholder="scan_results.json"
                                            mono
                                        />
                                        <p className="mt-2 text-xs text-text-ghost">Relative to the Arkenar installation directory.</p>
                                    </div>
                                </section>

                                <section>
                                    <SectionLabel icon={LayoutTemplate}>Interface & Behaviour</SectionLabel>
                                    <div className="mt-4 space-y-3">
                                        <div className="p-6 rounded-xl border border-border-subtle bg-bg-card shadow-sm flex justify-between items-center gap-4">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <ZoomIn size={16} className="text-accent-text" />
                                                    <span className="text-sm font-semibold text-text-primary">UI Scale</span>
                                                </div>
                                                <p className="text-[11px] text-text-muted">Adjust the overall size of text and interface elements. Applies on save.</p>
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
                <div className="px-6 py-4 border-t border-border-subtle bg-bg-card flex items-center justify-between shrink-0">
                    <button
                        onClick={handleResetToDefaults}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-text-ghost hover:text-status-critical transition-all duration-300"
                    >
                        <RotateCcw size={14} />
                        Reset All Defaults
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleFinalClose}
                            className="px-5 py-2 text-xs font-bold text-text-secondary hover:text-text-primary transition-all duration-300"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!!webhookError || !hasUnsavedChanges()}
                            className={`bg-accent text-bg-root px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                                (webhookError || !hasUnsavedChanges()) ? 'opacity-50 cursor-not-allowed saturate-50' : 'hover:brightness-110 btn-glow active:scale-95'
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