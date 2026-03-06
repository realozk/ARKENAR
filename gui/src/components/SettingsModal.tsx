import { useEffect, useRef, useState } from "react";
import {
    X, Palette, FolderOutput, Sliders, KeyRound, RotateCcw, Moon, Sun, Radar,
} from "lucide-react";
import { SectionLabel, TextInput, SliderWithInput } from "./primitives";

/* ── Persisted settings shape ─────────────────────────────────── */
export interface AppSettings {
    // Appearance
    accentColor: string;
    theme: "dark" | "light";
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
}

export const DEFAULT_SETTINGS: AppSettings = {
    accentColor: "#00d5be",
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
            if (merged.theme !== "dark" && merged.theme !== "light") merged.theme = DEFAULT_SETTINGS.theme;
            if (typeof merged.defaultCrawlerDepth !== "number") merged.defaultCrawlerDepth = DEFAULT_SETTINGS.defaultCrawlerDepth;
            if (typeof merged.defaultCrawlerTimeout !== "number") merged.defaultCrawlerTimeout = DEFAULT_SETTINGS.defaultCrawlerTimeout;
            if (typeof merged.defaultCrawlerMaxUrls !== "number") merged.defaultCrawlerMaxUrls = DEFAULT_SETTINGS.defaultCrawlerMaxUrls;
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
    const overlayRef = useRef<HTMLDivElement>(null);

    // Close on Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Close on backdrop click
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) handleClose();
    };

    // Webhook validation
    const webhookError = draft.globalWebhookUrl.trim() !== "" && !/^https:\/\/.+/.test(draft.globalWebhookUrl.trim())
        ? "Webhook URL must start with https://" : null;

    // Check for unsaved non-appearance changes
    const hasUnsavedChanges = () => {
        return draft.defaultOutputPath !== settings.defaultOutputPath
            || draft.globalWebhookUrl !== settings.globalWebhookUrl
            || draft.defaultCrawlerDepth !== settings.defaultCrawlerDepth
            || draft.defaultCrawlerTimeout !== settings.defaultCrawlerTimeout
            || draft.defaultCrawlerMaxUrls !== settings.defaultCrawlerMaxUrls;
    };

    const handleClose = () => {
        if (hasUnsavedChanges()) {
            if (!window.confirm("You have unsaved changes. Discard them?")) return;
        }
        onClose();
    };

    const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setDraft((prev) => {
            const next = { ...prev, [key]: value };

            // Auto-apply appearance changes instantly
            if (key === "accentColor" || key === "theme") {
                saveSettings(next);
                onSave(next); // This pushes the state to App.tsx, triggering the live DOM update
            }

            return next;
        });
    };

    const handleSave = () => {
        saveSettings(draft);
        onSave(draft);
        onClose();
    };

    const handleReset = () => setDraft({ ...DEFAULT_SETTINGS });

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="settings-overlay"
        >
            <div className="settings-panel animate-fade-slide-in">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border-subtle">
                    <div>
                        <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
                        <p className="text-xs text-text-muted mt-0.5">App-wide configuration</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="rounded-lg p-2 text-text-ghost hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:scale-110 active:scale-90"
                    >
                        <X size={17} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

                    {/* Appearance */}
                    <section>
                        <SectionLabel icon={Palette}>Appearance</SectionLabel>

                        <div className="mb-6">
                            <p className="text-xs text-text-muted mb-3">Theme</p>
                            <div className="relative flex w-48 rounded-lg overflow-hidden bg-bg-input p-1">
                                <div
                                    className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md bg-accent transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                                    style={{
                                        transform: draft.theme === "dark" ? "translateX(0)" : "translateX(100%)",
                                    }}
                                />
                                <button
                                    onClick={() => set("theme", "dark")}
                                    className={`relative z-10 flex flex-1 items-center justify-center gap-2 py-1.5 text-xs font-medium transition-colors duration-300 ${draft.theme === "dark" ? "text-bg-root" : "text-text-muted hover:text-text-secondary"}`}
                                >
                                    <Moon size={14} />
                                    Dark
                                </button>
                                <button
                                    onClick={() => set("theme", "light")}
                                    className={`relative z-10 flex flex-1 items-center justify-center gap-2 py-1.5 text-xs font-medium transition-colors duration-300 ${draft.theme === "light" ? "text-bg-root" : "text-text-muted hover:text-text-secondary"}`}
                                >
                                    <Sun size={14} />
                                    Light
                                </button>
                            </div>
                        </div>

                        <p className="text-xs text-text-muted mb-3">Accent colour</p>
                        <div className="flex gap-2.5 flex-wrap">
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
                                    title="Custom colour"
                                />
                                <span className="font-mono text-[11px] text-text-muted">{draft.accentColor}</span>
                            </div>
                        </div>
                    </section>

                    {/* Scanner defaults */}
                    <section>
                        <SectionLabel icon={Sliders}>Scanner Defaults</SectionLabel>
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs text-text-muted mb-2">Default Threads</p>
                                <SliderWithInput value={draft.defaultThreads} onChange={(v) => set("defaultThreads", v)} min={1} max={500} />
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-2">Default Timeout (s)</p>
                                <SliderWithInput value={draft.defaultTimeout} onChange={(v) => set("defaultTimeout", v)} min={1} max={120} />
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-2">Default Rate Limit (req/s)</p>
                                <SliderWithInput value={draft.defaultRateLimit} onChange={(v) => set("defaultRateLimit", v)} min={1} max={5000} />
                            </div>
                        </div>
                    </section>

                    {/* Output paths */}
                    <section>
                        <SectionLabel icon={FolderOutput}>Paths</SectionLabel>
                        <div>
                            <p className="text-xs text-text-muted mb-1.5">Default Output File</p>
                            <TextInput
                                value={draft.defaultOutputPath}
                                onChange={(v) => set("defaultOutputPath", v)}
                                placeholder="scan_results.json"
                                mono
                            />
                            <p className="mt-1.5 text-xs text-text-ghost">Relative to the Arkenar working directory.</p>
                        </div>
                    </section>

                    {/* Integrations / API */}
                    <section>
                        <SectionLabel icon={KeyRound}>Integrations</SectionLabel>
                        <div>
                            <p className="text-xs text-text-muted mb-1.5">Global Webhook URL</p>
                            <TextInput
                                value={draft.globalWebhookUrl}
                                onChange={(v) => set("globalWebhookUrl", v)}
                                placeholder="https://discord.com/api/webhooks/..."
                                mono
                            />
                            <p className="mt-1.5 text-xs text-text-ghost">Pre-fills the webhook field for every new scan.</p>
                            {webhookError && <p className="mt-1.5 text-xs text-status-critical">{webhookError}</p>}
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-text-ghost hover:text-text-secondary hover:bg-bg-hover transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
                    >
                        <RotateCcw size={14} strokeWidth={2.5} />
                        Reset to defaults
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={handleClose}
                            className="rounded-lg border border-border-subtle px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-300 hover:-translate-y-0.5 active:scale-95 shadow-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!!webhookError}
                            className={`rounded-lg px-4 py-2 text-xs font-semibold text-bg-root transition-all duration-300 btn-glow shadow-sm ${webhookError ? 'bg-text-ghost cursor-not-allowed' : 'bg-accent hover:brightness-110'}`}
                        >
                            Save changes
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
}
