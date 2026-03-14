import React from "react";
import { Clock, Plus } from "lucide-react";
import { StudioHistoryItem, getStatusClass, buildHistoryLabel } from "./useStudio";

interface TrafficDrawerProps {
  history: StudioHistoryItem[];
  selectedHistoryId: string | null;
  onSelect: (id: string) => void;
  onNewRequest: () => void;
}

export function TrafficDrawer({ history, selectedHistoryId, onSelect, onNewRequest }: TrafficDrawerProps) {
  return (
    <div className="w-64 border-r border-border-subtle bg-bg-panel/30 flex flex-col h-full shrink-0">
      <div className="p-3 border-b border-border-subtle flex items-center justify-between shrink-0">
        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Clock size={14} className="text-accent-text" />
          Traffic History
        </h3>
        <button
          onClick={onNewRequest}
          className="p-1.5 hover:bg-bg-hover rounded-lg text-text-muted hover:text-text-primary transition-colors"
          title="New Request"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {history.length === 0 ? (
          <div className="text-center p-4 text-xs text-text-muted italic">No traffic yet</div>
        ) : (
          history.map((item) => {
            const isSelected = item.id === selectedHistoryId;
            const status = item.response?.status;
            const statusClass = status ? getStatusClass(status) : "text-text-muted";

            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`w-full text-left p-2.5 rounded-xl transition-all duration-200 flex flex-col gap-1.5 ${
                  isSelected
                    ? "bg-accent-dim border border-accent/20 shadow-sm"
                    : "hover:bg-bg-hover border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between w-full gap-2">
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      item.request.method === "GET"
                        ? "bg-blue-500/10 text-blue-400"
                        : item.request.method === "POST"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : item.request.method === "PUT"
                        ? "bg-amber-500/10 text-amber-400"
                        : item.request.method === "DELETE"
                        ? "bg-rose-500/10 text-rose-400"
                        : "bg-gray-500/10 text-gray-400"
                    }`}
                  >
                    {item.request.method}
                  </span>
                  {status && (
                    <span className={`text-[10px] font-bold ${statusClass}`}>
                      {status}
                    </span>
                  )}
                  {!status && item.error && (
                    <span
                      className="text-[10px] font-bold text-status-critical"
                      title={item.error}
                    >
                      ERR
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-primary font-mono truncate w-full opacity-90">
                  {buildHistoryLabel(item.request)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}