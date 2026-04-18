import React from "react";
import { Square, ChevronDown, Clipboard, Send } from "lucide-react";
import type { HttpMethod, PipelineStage } from "./useStudio";
import { METHODS } from "./useStudio";

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: "draft", label: "DRAFT" },
  { id: "dispatch", label: "DISPATCH" },
  { id: "await", label: "AWAIT" },
  { id: "render", label: "RENDER" },
];

interface StudioTopBarProps {
  method: HttpMethod;
  url: string;
  isLoading: boolean;
  pipeline: PipelineStage;
  showMethodMenu: boolean;
  onMethodChange: (m: HttpMethod) => void;
  onUrlChange: (v: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onToggleMethodMenu: () => void;
  onImportCurl: () => void;
}

export default function StudioTopBar({
  method, url, isLoading, pipeline,
  showMethodMenu, onMethodChange, onUrlChange, onSend, onAbort,
  onToggleMethodMenu, onImportCurl,
}: StudioTopBarProps) {

  const getMethodColor = (m: string) => {
    switch (m) {
      case "GET": return "text-status-success";
      case "POST": return "text-status-warning";
      case "PUT":
      case "PATCH": return "text-blue-400";
      case "DELETE": return "text-status-critical";
      default: return "text-text-muted";
    }
  };

  const getStageStatus = (stageId: PipelineStage) => {
    const order: PipelineStage[] = ["draft", "dispatch", "await", "render"];
    const si = order.indexOf(stageId);
    const ci = order.indexOf(pipeline);
    
    if (si === ci && isLoading) return "active";
    if (si < ci || (si === ci && !isLoading && pipeline === "render")) return "done";
    return "inactive";
  };

  return (
    <div className="flex items-center h-11 shrink-0 bg-bg-panel border-b border-border-subtle px-4 gap-3">
      
      <div className="relative shrink-0">
        <button 
          className="flex items-center gap-1 px-3 h-[30px] rounded-md border border-border-subtle bg-bg-card font-mono text-xs font-bold text-accent-text hover:bg-accent10 hover:border-accent transition-all duration-150 shrink-0" 
          onClick={onToggleMethodMenu}
        >
          <span className={getMethodColor(method)}>{method}</span>
          <ChevronDown size={10} />
        </button>
        {showMethodMenu && (
          <div className="absolute top-[calc(100%+4px)] left-0 z-[999] bg-bg-panel border border-border-subtle rounded-md min-w-[100px] overflow-hidden shadow-xl">
            {METHODS.map((m) => (
              <button
                key={m}
                className={`block w-full px-3 py-2 text-left font-mono text-xs font-bold hover:bg-bg-hover transition-colors ${getMethodColor(m)}`}
                onClick={() => { onMethodChange(m); onToggleMethodMenu(); }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-center h-[30px] rounded-md border border-border-subtle bg-bg-root focus-within:border-accent transition-colors overflow-hidden">
        <input
          type="text"
          placeholder="https://target.com/api/endpoint"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !isLoading && url.trim()) onSend(); }}
          className="flex-1 min-w-0 h-full bg-transparent border-none outline-none font-mono text-xs text-text-primary px-3 placeholder:text-text-ghost"
          spellCheck={false}
        />
      </div>

      <button
        onClick={onImportCurl}
        title="Import cURL"
        className="flex items-center justify-center w-[30px] h-[30px] rounded-md border border-border-subtle bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all duration-150 shrink-0"
      >
        <Clipboard size={13} />
      </button>

      <div className="max-[600px]:hidden flex items-center gap-[3px] ml-2 shrink-0">
        {STAGES.map((s, idx) => {
          const status = getStageStatus(s.id);
          let dotClass = "w-[6px] h-[6px] rounded-full transition-colors duration-300 ";
          
          if (status === "active") dotClass += "bg-accent shadow-[0_0_8px_var(--color-accent)]";
          else if (status === "done") dotClass += "bg-status-success";
          else dotClass += "bg-[var(--color-bg-hover)]";

          return (
            <React.Fragment key={s.id}>
              {idx > 0 && <div className="w-2 h-px bg-border-subtle" />}
              <div className={dotClass} title={s.label} />
            </React.Fragment>
          );
        })}
      </div>

      {isLoading ? (
        <button
          onClick={onAbort}
          className="flex items-center gap-2 px-4 h-[30px] rounded-md border border-status-critical text-status-critical text-xs font-bold uppercase tracking-widest hover:bg-status-critical10 active:scale-95 transition-all duration-150 shrink-0"
        >
          <Square size={12} fill="currentColor" />
          <span className="max-[600px]:hidden">Abort</span>
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!url.trim()}
          className="flex items-center gap-2 px-4 h-[30px] rounded-md bg-accent text-black text-xs font-bold uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all duration-150 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={12} />
          <span className="max-[600px]:hidden">Send</span>
        </button>
      )}
    </div>
  );
}
