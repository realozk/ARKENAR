import { useState } from "react";
import { PlusIcon, RotateCcwIcon, GitCompareIcon, SearchIcon, ClipboardIcon } from "../icons";
import { createPortal } from "react-dom";
import type { StudioHistoryItem } from "./useStudio";

export function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return "text-[color:var(--color-status-success)]";
  if (status >= 300 && status < 400) return "text-[color:var(--color-status-warning)]";
  if (status >= 400 && status < 500) return "text-[color:var(--color-status-critical)]";
  return "text-[color:var(--color-status-critical)]";
}

function getMethodColor(method: string): string {
  switch (method) {
    case "GET":    return "#22c55e";
    case "POST":   return "var(--color-accent)";
    case "PUT":    return "#3b82f6";
    case "PATCH":  return "#a855f7";
    case "DELETE": return "#ef4444";
    default:       return "var(--color-text-muted)";
  }
}

function getStatusDotColor(status: number): string {
  if (status >= 200 && status < 300) return "var(--color-status-success)";
  if (status >= 300 && status < 400) return "#3b82f6";
  if (status >= 400 && status < 500) return "var(--color-status-warning)";
  return "var(--color-status-critical)";
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

  return (
    <aside
      className="hidden min-[900px]:flex flex-col w-[clamp(200px,20vw,260px)] shrink-0 border-r border-[color:var(--color-border-subtle)] overflow-hidden"
      style={{ background: "var(--color-bg-root)" }}
    >
      {/* PANEL HEADER */}
      <div
        className="h-7 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center justify-between px-2 font-mono text-[10px] tracking-[0.18em] text-[color:var(--color-text-muted)]"
        style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
          <span className="uppercase">HISTORY</span>
          {studioHistory.length > 0 && (
            <span
              className="px-1 text-[9.5px] rounded-sm"
              style={{ background: "var(--color-bg-panel)", color: "var(--color-text-primary)" }}
            >
              {studioHistory.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onNewStudioRequest}
            title="New Request"
            className="w-5 h-5 flex items-center justify-center text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-panel)] rounded-sm transition-colors"
          >
            <PlusIcon size={10} />
          </button>
          <button
            title="Search history"
            className="w-5 h-5 flex items-center justify-center text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-panel)] rounded-sm transition-colors"
          >
            <SearchIcon size={10} />
          </button>
        </div>
      </div>

      {/* SCROLL LIST */}
      <div className="flex-1 overflow-y-auto">
        {studioHistory.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-[color:var(--color-text-muted)] font-mono text-center opacity-60">
            No history yet.
          </div>
        ) : (
          studioHistory.map((item) => {
            const isActive = selectedStudioHistoryId === item.id;
            const statusDot = item.error
              ? "var(--color-status-critical)"
              : item.response
                ? getStatusDotColor(item.response.status)
                : "var(--color-border-hover)";
            return (
              <button
                key={item.id}
                onClick={() => onSelectStudioHistoryItem(item.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id });
                }}
                className="w-full text-left px-2 py-1.5 flex items-start gap-1.5 border-b border-[color:var(--color-border-subtle)] transition-colors"
                style={isActive
                  ? { background: "rgba(249,115,22,0.08)", borderLeft: "2px solid var(--color-accent)" }
                  : { borderLeft: "2px solid transparent" }}
              >
                {/* Status dot */}
                <span
                  className="mt-[6px] w-[5px] h-[5px] rounded-full shrink-0"
                  style={{ background: statusDot }}
                />
                <div className="min-w-0 flex-1">
                  {/* Method + timestamp */}
                  <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
                    <span className="font-bold shrink-0" style={{ color: getMethodColor(item.request.method) }}>
                      {item.request.method}
                    </span>
                    <span className="text-[color:var(--color-text-primary)] truncate">
                      {formatUrlPath(item.request.url) || "/"}
                    </span>
                  </div>
                  {/* Status + timing */}
                  <div className="flex items-center justify-between mt-0.5">
                    <span className={`font-mono text-[9.5px] font-bold ${item.error ? "text-[color:var(--color-status-critical)]" : item.response ? getStatusClass(item.response.status) : "text-[color:var(--color-text-muted)]"}`}>
                      {item.error ? "ERR" : item.response ? item.response.status : "—"}
                    </span>
                    <span className="font-mono text-[9.5px] text-[color:var(--color-text-ghost)] shrink-0 ml-1">
                      {item.response
                        ? `${item.response.timing_ms}ms · ${new Blob([item.response.body || ""]).size}B`
                        : new Date(item.createdAt).toLocaleTimeString([], { hourCycle: "h23" })}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* FOOTER COUNT */}
      {studioHistory.length > 0 && (
        <div
          className="h-6 shrink-0 border-t border-[color:var(--color-border-subtle)] px-2 flex items-center font-mono text-[9.5px] text-[color:var(--color-text-muted)]"
          style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
        >
          {studioHistory.length} req{studioHistory.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* CONTEXT MENU PORTAL */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[9999] min-w-[180px] rounded-sm border border-[color:var(--color-border-subtle)] shadow-2xl overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x, background: "var(--color-bg-panel)" }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-bold text-[color:var(--color-accent)] hover:bg-[color:var(--color-bg-hover)] transition-colors font-mono"
              onClick={() => {
                const item = studioHistory.find(h => h.id === contextMenu.itemId);
                if (item?.response?.body) {
                  onCompareWithHistory?.(item.response.body);
                }
                setContextMenu(null);
              }}
            >
              <GitCompareIcon size={13} />
              Compare with current
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-bold text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-hover)] transition-colors font-mono"
              onClick={() => {
                onSelectStudioHistoryItem(contextMenu.itemId);
                setContextMenu(null);
              }}
            >
              <RotateCcwIcon size={13} />
              Reload Request
            </button>
            <div className="h-px bg-[color:var(--color-border-subtle)] w-full" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-hover)] hover:text-[color:var(--color-text-primary)] transition-colors font-mono"
              onClick={() => {
                const item = studioHistory.find(h => h.id === contextMenu.itemId);
                if (item) navigator.clipboard.writeText(item.request.url);
                setContextMenu(null);
              }}
            >
              <ClipboardIcon size={13} />
              Copy URL
            </button>
          </div>
        </>,
        document.body
      )}
    </aside>
  );
}
