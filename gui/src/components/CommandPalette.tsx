import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Play, Square, Terminal, ScanSearch, History,
  Settings, Trash2, PanelLeftClose, Download, X
} from "lucide-react";

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
      id: "start", label: "Start Scan", icon: Play, section: "SCAN",
      shortcut: "Space", disabled: !hasTarget || scanStatus === "running",
      onRun: () => { onStartScan(); close(); }
    },
    {
      id: "stop", label: "Stop Scan", icon: Square, section: "SCAN",
      shortcut: "Esc", disabled: scanStatus !== "running",
      onRun: () => { onStopScan(); close(); }
    },
    {
      id: "terminal", label: "Go to Terminal", icon: Terminal, section: "NAVIGATE",
      shortcut: "T", onRun: () => { onTabChange("terminal"); close(); }
    },
    {
      id: "findings", label: "Go to Findings", icon: ScanSearch, section: "NAVIGATE",
      shortcut: "F", onRun: () => { onTabChange("findings"); close(); }
    },
    {
      id: "history", label: "Go to History", icon: History, section: "NAVIGATE",
      shortcut: "H", onRun: () => { onTabChange("history"); close(); }
    },
    {
      id: "settings", label: "Open Settings", icon: Settings, section: "TOOLS",
      shortcut: "Ctrl+,", onRun: () => { onOpenSettings(); close(); }
    },
    {
      id: "clear", label: "Clear Current Tab", icon: Trash2, section: "TOOLS",
      shortcut: "C", onRun: () => { onRequestClear(); close(); }
    },
    {
      id: "sidebar", label: "Toggle Sidebar", icon: PanelLeftClose, section: "TOOLS",
      shortcut: "Ctrl+B", onRun: () => { onToggleSidebar(); close(); }
    },
    {
      id: "export", label: "Export History CSV", icon: Download, section: "TOOLS",
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
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-[640px] rounded-2xl overflow-hidden"
        style={{
          background: "#1c1c1e",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          animation: exiting
            ? "paletteOut 0.15s ease-in forwards"
            : "paletteIn 0.15s ease-out forwards",
        }}
      >
        {/* Search Input */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]"
          style={{ background: "#242426" }}  // ← slightly lighter than #1c1c1e
        >
        <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search actions..."
            className="flex-1 bg-transparent text-[17px] text-white placeholder-white/25 outline-none font-normal"
            style={{ boxShadow: "none", WebkitAppearance: "none" }}
            />
          <button onClick={close} className="text-white/20 hover:text-white/50 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 360 }}>
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-white/25">
              No results for "{query}"
            </div>
          ) : (
            sections.map(section => (
              <div key={section}>
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                  {section}
                </div>
                {filtered.filter(a => a.section === section).map(action => {
                  const currentIndex = flatIndex++;
                  const isSelected = currentIndex === selectedIndex;
                  const Icon = action.icon;
                  return (
                    <div
                      key={action.id}
                      data-index={currentIndex}
                      onClick={() => !action.disabled && action.onRun()}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      className={`flex items-center gap-3 px-3 mx-2 mb-0.5 rounded-lg cursor-pointer transition-colors duration-75 ${
                        action.disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                      } ${isSelected && !action.disabled ? "bg-white/[0.08]" : ""}`}
                      style={{ height: 44 }}
                    >
                      {/* Icon Box */}
                      <div className={`flex items-center justify-center w-7 h-7 rounded-md ${
                        isSelected && !action.disabled
                          ? "bg-white/10 text-white"
                          : "bg-white/[0.05] text-white/40"
                      }`}>
                        <Icon size={14} />
                      </div>

                      {/* Label */}
                      <span className={`flex-1 text-sm font-medium ${
                        isSelected && !action.disabled ? "text-white" : "text-white/60"
                      }`}>
                        {action.label}
                      </span>

                      {/* Shortcut */}
                      {action.shortcut && (
                        <kbd className="px-2 py-0.5 rounded text-[11px] font-mono text-white/25 bg-white/[0.04] border border-white/[0.06]">
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

        {/* Footer */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-white/[0.05] text-[11px] text-white/20">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>

      <style>{`
        @keyframes paletteIn {
          from { opacity: 0; transform: scale(0.96) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes paletteOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to   { opacity: 0; transform: scale(0.96) translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
