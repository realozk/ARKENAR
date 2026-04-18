import { useState } from "react";
import { Plus, RotateCcw, ClipboardPaste, GitCompare } from "lucide-react";
import { createPortal } from "react-dom";
import type { StudioHistoryItem } from "./useStudio";

export function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return "text-status-success shadow-[0_0_8px_rgba(var(--color-status-success),0.3)]";
  if (status >= 300 && status < 400) return "text-status-warning shadow-[0_0_8px_rgba(var(--color-status-warning),0.3)]";
  if (status >= 400 && status < 500) return "text-status-critical shadow-[0_0_8px_rgba(var(--color-status-critical),0.3)]";
  return "text-status-critical shadow-[0_0_8px_rgba(var(--color-status-critical),0.3)]";
}

interface StudioHistorySidebarProps {
  studioHistory: StudioHistoryItem[];
  selectedStudioHistoryId: string | null;
  onSelectStudioHistoryItem: (id: string | null) => void;
  onNewStudioRequest: () => void;
  onCompareWithHistory?: (body: string) => void;
}

export default function StudioHistorySidebar({
  studioHistory,
  selectedStudioHistoryId,
  onSelectStudioHistoryItem,
  onNewStudioRequest,
  onCompareWithHistory,
}: StudioHistorySidebarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string; } | null>(null);

  const formatUrlPath = (url: string) => {
    try {
      const u = new URL(url);
      return u.pathname + u.search;
    } catch {
      return url;
    }
  };

  const getMethodClasses = (method: string) => {
    switch (method) {
      case "GET": return "bg-status-success20 text-status-success";
      case "POST": return "bg-status-warning20 text-status-warning";
      case "PUT":
      case "PATCH": return "bg-[var(--color-status-info,#5b9cf6)]/20 text-[var(--color-status-info,#5b9cf6)]";
      case "DELETE": return "bg-status-critical20 text-status-critical";
      default: return "bg-bg-hover text-text-muted";
    }
  };

  return (
    <aside className="hidden min-[900px]:flex flex-col w-[clamp(180px,18vw,240px)] shrink-0 border-r border-border-subtle bg-bg-panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-ghost">History</span>
        <button
          onClick={onNewStudioRequest}
          className="p-1 rounded bg-accent10 text-accent-text hover:bg-accent20 transition-colors"
          title="New Request"
        >
          <Plus size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {studioHistory.length === 0 ? (
          <div className="px-4 py-3 text-xs text-text-muted">No history yet.</div>
        ) : (
          studioHistory.map((item) => {
            const isActive = selectedStudioHistoryId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectStudioHistoryItem(item.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id });
                }}
                className={`w-full flex flex-col gap-[3px] py-3 pr-4 border-b border-border-subtle text-left transition-all duration-150 hover:bg-bg-hover ${
                  isActive ? "bg-accent10 border-l-2 border-l-accent pl-[calc(1rem-2px)]" : "pl-4"
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className={`font-mono text-[9px] font-black px-[6px] py-[1px] rounded tracking-[0.05em] ${getMethodClasses(item.request.method)}`}>
                    {item.request.method}
                  </span>
                  <span className="font-mono text-[9px] text-text-ghost">
                    {new Date(item.createdAt).toLocaleTimeString([], { hourCycle: "h23" })}
                  </span>
                </div>
                
                <div className="w-full font-mono text-xs text-text-muted truncate mt-1" title={item.request.url}>
                  {formatUrlPath(item.request.url) || "/"}
                </div>
                
                <div className="flex items-center justify-between w-full mt-1">
                  <span className={`font-mono text-[9px] font-bold ${item.error ? "text-status-critical" : item.response ? getStatusClass(item.response.status) : "text-text-muted"}`}>
                    {item.error ? "ERR" : item.response ? item.response.status : "—"}
                  </span>
                  
                  {item.response && (
                    <span className="font-mono text-[9px] text-text-ghost">
                      {item.response.timing_ms}ms • {new Blob([item.response.body || ""]).size}B
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[9999] min-w-[180px] rounded-md border border-border-subtle bg-bg-panel shadow-2xl animate-fade-slide-in overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-bold text-accent hover:bg-bg-hover hover:text-accent-text transition-colors"
              onClick={() => {
                const item = studioHistory.find(h => h.id === contextMenu.itemId);
                if (item?.response?.body) {
                  onCompareWithHistory?.(item.response.body);
                }
                setContextMenu(null);
              }}
            >
              <GitCompare size={14} />
              Compare with current
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-bold text-text-primary hover:bg-bg-hover transition-colors"
              onClick={() => {
                onSelectStudioHistoryItem(contextMenu.itemId);
                setContextMenu(null);
              }}
            >
              <RotateCcw size={14} />
              Reload Request
            </button>

            <div className="h-px bg-border-subtle w-full" />

            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-semibold text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              onClick={() => {
                const item = studioHistory.find(h => h.id === contextMenu.itemId);
                if (item) navigator.clipboard.writeText(item.request.url);
                setContextMenu(null);
              }}
            >
              <ClipboardPaste size={13} />
              Copy URL
            </button>
          </div>
        </>,
        document.body 
      )}
    </aside>
  );
}
