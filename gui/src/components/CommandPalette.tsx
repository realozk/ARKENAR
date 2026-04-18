import { useState, useEffect, useRef, useCallback } from "react";
import {
  PlayIcon, StopIcon, TerminalIcon, ScanSearchIcon, HistoryIcon,
  SettingsIcon, TrashIcon, PanelLeftCloseIcon, DownloadIcon, CloseIcon, SearchIcon
} from "./icons";

interface Action {
  id: string;
  label: string;
  icon: React.ElementType;
  section: string;
  shortcut?: string;
  disabled?: boolean;
  onRun: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  onStartScan: () => void;
  onStopScan: () => void;
  onTabChange: (tab: "terminal" | "findings" | "history") => void;
  onOpenSettings: () => void;
  onRequestClear: () => void;     
  onToggleSidebar: () => void;
  onExportFindings: () => void;  
  scanStatus: string;
  hasTarget: boolean;
  hasFindings: boolean;
}

export function CommandPalette({
  onClose, onStartScan, onStopScan, onTabChange,
  onOpenSettings, onRequestClear, onToggleSidebar, onExportFindings,
  scanStatus, hasTarget, hasFindings
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [exiting, setExiting] = useState(false);

  const close = useCallback(() => {
    setExiting(true);
    setTimeout(onClose, 150);
  }, [onClose]);

  const actions: Action[] = [
    {
      id: "start", label: "Start Scan", icon: PlayIcon, section: "SCAN",
      shortcut: "Space", disabled: !hasTarget || scanStatus === "running",
      onRun: () => { onStartScan(); close(); }
    },
    {
      id: "stop", label: "Stop Scan", icon: StopIcon, section: "SCAN",
      shortcut: "Esc", disabled: scanStatus !== "running",
      onRun: () => { onStopScan(); close(); }
    },
    {
      id: "terminal", label: "Go to Terminal", icon: TerminalIcon, section: "NAVIGATE",
      shortcut: "T", onRun: () => { onTabChange("terminal"); close(); }
    },
    {
      id: "findings", label: "Go to Findings", icon: ScanSearchIcon, section: "NAVIGATE",
      shortcut: "F", onRun: () => { onTabChange("findings"); close(); }
    },
    {
      id: "history", label: "Go to History", icon: HistoryIcon, section: "NAVIGATE",
      shortcut: "H", onRun: () => { onTabChange("history"); close(); }
    },
    {
      id: "settings", label: "Open Settings", icon: SettingsIcon, section: "TOOLS",
      shortcut: "Ctrl+,", onRun: () => { onOpenSettings(); close(); }
    },
    {
      id: "clear", label: "Clear Current Tab", icon: TrashIcon, section: "TOOLS",
      shortcut: "C", onRun: () => { onRequestClear(); close(); }
    },
    {
      id: "sidebar", label: "Toggle Sidebar", icon: PanelLeftCloseIcon, section: "TOOLS",
      shortcut: "Ctrl+B", onRun: () => { onToggleSidebar(); close(); }
    },
    {
      id: "export", label: "Export History CSV", icon: DownloadIcon, section: "TOOLS",
      disabled: !hasFindings,
      onRun: () => { onExportFindings(); close(); }
    },
  ];

  const filtered = actions.filter(a =>
    a.label.toLowerCase().includes(query.toLowerCase())
  );

  // Group filtered actions by section
  const sections = Array.from(new Set(filtered.map(a => a.section)));

  // Flat list for keyboard nav
  const flatList = filtered;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const action = flatList[selectedIndex];
        if (action && !action.disabled) action.onRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flatList, selectedIndex, close]);

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh] bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-[600px] overflow-hidden border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-panel)]"
        style={{
          animation: exiting
            ? "paletteOut 0.15s ease-in forwards"
            : "paletteIn 0.15s ease-out forwards",
        }}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-root)]">
          <SearchIcon size={14} className="text-[color:var(--color-text-ghost)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search actions..."
            className="flex-1 bg-transparent text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-ghost)] outline-none font-mono"
            style={{ boxShadow: "none", WebkitAppearance: "none" }}
          />
          <button
            onClick={close}
            className="w-5 h-5 flex items-center justify-center text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-muted)] transition-colors duration-150 shrink-0"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 340 }}>
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs font-mono text-[color:var(--color-text-ghost)]">
              No results for "{query}"
            </div>
          ) : (
            sections.map(section => (
              <div key={section}>
                {/* Section label */}
                <div className="px-4 pt-3 pb-1 text-[9px] font-mono uppercase tracking-[0.22em] text-[color:var(--color-text-ghost)]">
                  {section}
                </div>
                {filtered.filter(a => a.section === section).map(action => {
                  const currentIndex = flatIndex++;
                  const isSelected = currentIndex === selectedIndex;
                  const ActionIcon = action.icon;
                  return (
                    <div
                      key={action.id}
                      data-index={currentIndex}
                      onClick={() => !action.disabled && action.onRun()}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      className={`flex items-center gap-3 px-3 mx-1.5 mb-px transition-colors duration-75 ${
                        action.disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                      } ${
                        isSelected && !action.disabled
                          ? "bg-[color:var(--color-bg-hover)] border-l border-[color:var(--color-accent)]"
                          : "border-l border-transparent"
                      }`}
                      style={{ height: 40 }}
                    >
                      {/* Icon */}
                      <div className={`flex items-center justify-center w-6 h-6 shrink-0 ${
                        isSelected && !action.disabled
                          ? "text-[color:var(--color-accent)]"
                          : "text-[color:var(--color-text-ghost)]"
                      }`}>
                        <ActionIcon size={13} />
                      </div>

                      {/* Label */}
                      <span className={`flex-1 text-xs font-mono ${
                        isSelected && !action.disabled
                          ? "text-[color:var(--color-text-primary)]"
                          : "text-[color:var(--color-text-muted)]"
                      }`}>
                        {action.label}
                      </span>

                      {/* Shortcut hint */}
                      {action.shortcut && (
                        <kbd className={`px-1.5 py-0.5 text-[10px] font-mono border transition-colors duration-150 ${
                          isSelected && !action.disabled
                            ? "border-[color:var(--color-accent)]/40 text-[color:var(--color-accent)]"
                            : "border-[color:var(--color-border-subtle)] text-[color:var(--color-text-ghost)]"
                        }`}>
                          {action.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div className="h-2" />
        </div>

        {/* Footer hint bar */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[color:var(--color-border-subtle)] text-[10px] font-mono text-[color:var(--color-text-ghost)]">
          <span><kbd className="font-mono tracking-tight">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono tracking-tight">↵</kbd> select</span>
          <span><kbd className="font-mono tracking-tight">Esc</kbd> close</span>
        </div>
      </div>

      <style>{`
        @keyframes paletteIn {
          from { opacity: 0; transform: scale(0.97) translateY(-6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes paletteOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to   { opacity: 0; transform: scale(0.97) translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
