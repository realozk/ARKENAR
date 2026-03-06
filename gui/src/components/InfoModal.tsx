import React, { useState, useEffect } from "react";
import { X, Info, Sparkles, Users, Terminal, Palette, Keyboard } from "lucide-react";
import { SectionLabel, Logo } from "./primitives";
import { t } from "../utils/i18n";

interface InfoModalProps {
    onClose: () => void;
    language: "en" | "ar";
}

export const InfoModal: React.FC<InfoModalProps> = ({ onClose, language }) => {
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(onClose, 200);
    };

    // Close on Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}
            onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
            <div className={`relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-bg-panel shadow-2xl ${isClosing ? "animate-fade-slide-out" : "animate-fade-slide-in"}`}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4 bg-gradient-surface">
                    <div className="flex items-center gap-2.5 text-text-primary">
                        <div className="p-1.5 rounded-lg bg-accent/10 text-accent-text">
                            <Info size={18} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-lg font-bold tracking-tight">{t("aboutArkenar", language)}</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="rounded-lg p-2 text-text-ghost hover:bg-bg-hover hover:text-text-primary transition-all duration-300 hover:rotate-90 hover:scale-110 active:scale-90"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Body */}
                <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden px-8 py-8 space-y-10 custom-scrollbar">

                    {/* Branding Section */}
                    <div className="flex flex-col items-center text-center">
                        <div className="relative mb-6 group">
                            <div className="absolute inset-x-[-60px] inset-y-[-30px] bg-accent/10 blur-[60px] rounded-full group-hover:bg-accent/20 transition-all duration-700" />
                            <Logo size="lg" className="relative drop-shadow-[0_0_25px_var(--color-accent-dim)] mx-auto" />
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] font-black tracking-widest text-accent-text border border-accent/20 shadow-[0_0_15px_var(--color-accent-dim)] uppercase">
                                v1.0.0 beta
                            </span>
                        </div>
                        <p className="text-sm font-medium text-text-secondary max-w-[300px] leading-relaxed">
                            {t("aboutDesc", language)}
                        </p>
                    </div>

                    {/* What's New Section */}
                    <section>
                        <div className="flex items-center justify-between">
                            <SectionLabel icon={Sparkles}>{t("whatsNew", language)}</SectionLabel>
                            <span className="text-[10px] font-mono font-bold text-text-ghost uppercase opacity-50">v1.0.0</span>
                        </div>

                        <ul className="space-y-3.5 mt-4 text-sm text-text-secondary">
                            {[
                                t("update1", language),
                                t("update2", language),
                                t("update3", language),
                                t("update4", language)
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-3 group">
                                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent group-hover:scale-125 transition-transform duration-300 shadow-[0_0_8px_rgba(var(--color-accent),0.5)]" />
                                    <span className="group-hover:text-text-primary transition-colors duration-300 leading-tight">
                                        {item}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Shortcuts Section */}
                    <section>
                        <SectionLabel icon={Keyboard}>{t("shortcuts", language)}</SectionLabel>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            {[
                                { key: "T", desc: t("t_terminal", language) },
                                { key: "F", desc: t("t_findings", language) },
                                { key: "H", desc: t("t_history", language) },
                                { key: "C", desc: t("t_clear", language) },
                                { key: "Ctrl+T", desc: t("t_focusTarget", language) },
                                { key: "Ctrl+F", desc: t("t_focusSearch", language) },
                            ].map((s) => (
                                <div key={s.key} className="flex items-center justify-between p-2.5 rounded-lg bg-bg-card border border-border-subtle group hover:border-accent/30 transition-all duration-300">
                                    <span className="text-[11px] text-text-secondary font-medium">{s.desc}</span>
                                    <kbd className="px-1.5 py-0.5 rounded border border-border-subtle bg-bg-root font-mono text-[10px] font-bold text-accent-text group-hover:border-accent/40 shadow-sm transition-all duration-300">
                                        {s.key}
                                    </kbd>
                                </div>
                            ))}
                            <div className="col-span-2 flex items-center justify-between p-3 rounded-lg bg-accent/5 border border-accent/20 group hover:bg-accent/10 transition-all duration-300">
                                <div className="flex items-center gap-2">
                                    <Keyboard size={14} className="text-accent-text animate-pulse" />
                                    <span className="text-[11px] text-accent-text font-bold uppercase tracking-tight">{t("spacebar", language)}</span>
                                </div>
                                <span className="text-[11px] text-text-muted font-medium italic">{t("scanActionDesc", language)}</span>
                            </div>
                        </div>
                    </section>


                    {/* Credits Section */}
                    <section>
                        <SectionLabel icon={Users}>{t("credits", language)}</SectionLabel>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-bg-card border border-border-subtle group hover:border-accent/30 transition-all duration-300">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-accent-text border border-border-subtle group-hover:scale-105 transition-transform duration-300">
                                    <Terminal size={20} />
                                </div>
                                <div>
                                    <p className="text-[10px] text-text-muted uppercase tracking-widest font-black leading-none mb-1">{t("developer", language)}</p>
                                    <p className="text-sm font-bold text-text-primary">realozk</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-bg-card border border-border-subtle group hover:border-accent/30 transition-all duration-300">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center text-amber-500 border border-border-subtle group-hover:scale-105 transition-transform duration-300">
                                    <Palette size={20} />
                                </div>
                                <div>
                                    <p className="text-[10px] text-text-muted uppercase tracking-widest font-black leading-none mb-1">{t("uiEditor", language)}</p>
                                    <p className="text-sm font-bold text-text-primary">Meshy10, realozk</p>
                                </div>

                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-border-subtle px-6 py-4 bg-bg-root/30">
                    <button
                        onClick={handleClose}
                        className="rounded-lg bg-accent px-6 py-2 text-xs font-bold text-bg-root hover:brightness-110 transition-all duration-300 btn-glow shadow-sm"
                    >
                        {t("close", language)}
                    </button>
                </div>
            </div>
        </div>
    );
};
