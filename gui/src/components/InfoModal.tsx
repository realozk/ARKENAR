import { useState, useEffect, useCallback, useRef } from "react";
import {
    CloseIcon, InfoIcon, SparklesIcon, UsersIcon, TerminalIcon,
    PaletteIcon, KeyboardIcon, ExternalLinkIcon
} from "./icons";
import { SectionLabel, Logo } from "./primitives";
import { t } from "../utils/i18n";

interface InfoModalProps {
    onClose: () => void;
}

export function InfoModal({ onClose }: InfoModalProps) {
    const [isClosing, setIsClosing] = useState(false);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleClose = useCallback(() => {
        if (closeTimerRef.current) return; // prevent double-close
        setIsClosing(true);
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            onClose();
        }, 200);
    }, [onClose]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        };
    }, []);

    // Close on Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handleClose]);

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}
            onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
            <div className={`relative w-full max-w-xl overflow-hidden border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-panel)] ${isClosing ? "animate-fade-slide-out" : "animate-fade-slide-in"}`}>
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[color:var(--color-border-subtle)] px-5 py-3">
                    <div className="flex items-center gap-2.5">
                        <InfoIcon size={13} className="text-[color:var(--color-accent)]" />
                        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-accent)]">
                            {t("aboutArkenar")}
                        </span>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-6 h-6 flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] transition-colors duration-150"
                    >
                        <CloseIcon size={14} />
                    </button>
                </div>

                {/* Body */}
                <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden px-8 py-8 space-y-10 custom-scrollbar">

                    {/* Branding Section */}
                    <div className="flex flex-col items-center text-center">
                        <div className="relative mb-6 group">
                            <div className="absolute inset-x-[-60px] inset-y-[-30px] bg-[color:var(--color-accent)]/10 blur-[60px] rounded-full group-hover:bg-[color:var(--color-accent)]/20 transition-all duration-700" />
                            <Logo size="lg" className="relative drop-shadow-[0_0_25px_var(--color-accent-dim)] mx-auto" />
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 px-2 py-0.5 font-mono text-[9px] font-black tracking-widest text-[color:var(--color-accent)] uppercase">
                                v1.2.0
                            </span>
                        </div>
                        <p className="text-sm font-medium text-[color:var(--color-text-muted)] max-w-[300px] leading-relaxed">
                            {t("aboutDesc")}
                        </p>
                    </div>

                    {/* What's New Section */}
                    <section>
                        <SectionLabel icon={SparklesIcon}>{t("whatsNew")}</SectionLabel>

                        <ul className="space-y-3.5 mt-4 text-sm text-[color:var(--color-text-muted)] mb-5">
                           {[
                                "Recon Workspace: DNS, WHOIS, port scan, subfinder, JS secrets.",
                                "Live Sitemap inside the Basic Scanner.",
                                "Full Tailwind UI rebuild with thin-stroke icons.",
                                "Fixed safe-count race and surfaced JSONL write errors."
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-3 group">
                                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-accent)] group-hover:scale-125 transition-transform duration-300" />
                                    <span className="group-hover:text-[color:var(--color-text-primary)] transition-colors duration-300 leading-tight text-xs">
                                        {item}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <a
                            href="https://github.com/realozk/ARKENAR/blob/main/CHANGELOG.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full p-2.5 border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-accent)]/40 hover:bg-[color:var(--color-accent)]/5 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-accent)] transition-all duration-300 group"
                        >
                            <span className="text-[10px] font-mono uppercase tracking-[0.18em]">Read Full Patch Notes</span>
                            <ExternalLinkIcon size={12} className="group-hover:scale-110 transition-transform" />
                        </a>
                    </section>

                    {/* Shortcuts Section */}
                    <section>
                        <SectionLabel icon={KeyboardIcon}>{t("shortcuts")}</SectionLabel>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            {[
                                { key: "Ctrl+K", desc: "Command Palette" },
                                { key: "T", desc: t("t_terminal") },
                                { key: "F", desc: t("t_findings") },
                                { key: "H", desc: t("t_history") },
                                { key: "C", desc: t("t_clear") },
                                { key: "Ctrl+T", desc: t("t_focusTarget") },
                                { key: "Ctrl+F", desc: t("t_focusSearch") },
                            ].map((s) => (
                                <div key={s.key} className="flex items-center justify-between p-2.5 border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-accent)]/30 transition-colors duration-200 group">
                                    <span className="text-[11px] text-[color:var(--color-text-muted)]">{s.desc}</span>
                                    <kbd className="px-1.5 py-0.5 border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)] font-mono text-[10px] text-[color:var(--color-accent)] group-hover:border-[color:var(--color-accent)]/40 transition-colors duration-200">
                                        {s.key}
                                    </kbd>
                                </div>
                            ))}
                            <div className="col-span-2 flex items-center justify-between p-3 border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/5 hover:bg-[color:var(--color-accent)]/10 transition-colors duration-200">
                                <div className="flex items-center gap-2">
                                    <KeyboardIcon size={12} className="text-[color:var(--color-accent)] animate-pulse" />
                                    <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[color:var(--color-accent)]">{t("spacebar")}</span>
                                </div>
                                <span className="text-[11px] text-[color:var(--color-text-muted)] italic">{t("scanActionDesc")}</span>
                            </div>
                        </div>
                    </section>

                    {/* Credits Section */}
                    <section>
                        <SectionLabel icon={UsersIcon}>{t("credits")}</SectionLabel>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="flex items-center gap-4 p-4 border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-accent)]/30 transition-colors duration-200 group">
                                <div className="h-9 w-9 border border-[color:var(--color-border-subtle)] flex items-center justify-center text-[color:var(--color-accent)] group-hover:scale-105 transition-transform duration-200">
                                    <TerminalIcon size={16} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[color:var(--color-text-muted)] leading-none mb-1">{t("developer")}</p>
                                    <p className="text-sm font-bold text-[color:var(--color-text-primary)]">realozk</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 p-4 border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-accent)]/30 transition-colors duration-200 group">
                                <div className="h-9 w-9 border border-[color:var(--color-border-subtle)] flex items-center justify-center text-[color:var(--color-text-muted)] group-hover:scale-105 transition-transform duration-200">
                                    <PaletteIcon size={16} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[color:var(--color-text-muted)] leading-none mb-1">{t("uiEditor")}</p>
                                    <p className="text-sm font-bold text-[color:var(--color-text-primary)]">Meshy10, realozk</p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-[color:var(--color-border-subtle)] px-5 py-3">
                    <button
                        onClick={handleClose}
                        className="px-5 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] bg-[color:var(--color-accent)] text-white border border-[color:var(--color-accent)] hover:brightness-110 transition-all duration-150 active:scale-95"
                    >
                        {t("close")}
                    </button>
                </div>
            </div>
        </div>
    );
}