import React from "react";
import {
  ChevronIcon, PlayIcon, StopIcon, ClipboardIcon, DotIcon, SaveIcon,
} from "../icons";
import type { HttpMethod, PipelineStage } from "./useStudio";
import { METHODS } from "./useStudio";

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: "draft", label: "DRAFT" },
  { id: "dispatch", label: "DISPATCH" },
  { id: "await", label: "AWAIT" },
  { id: "render", label: "RENDER" },
];

// TASK 4: Removed INJECTION_HINTS constant and its render block.
// §payload§ | §reqid§ | §token§ were mockup decorations with no functional purpose.
// A real variable injection feature will be implemented as a proper dropdown later.

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

function getMethodColor(m: string): string {
  switch (m) {
    case "GET":    return "#22c55e";
    case "POST":   return "var(--color-accent)";
    case "PUT":    return "#3b82f6";
    case "DELETE": return "#ef4444";
    case "PATCH":  return "#a855f7";
    default:       return "var(--color-text-muted)";
  }
}

export default function StudioTopBar({
  method, url, isLoading, pipeline,
  showMethodMenu, onMethodChange, onUrlChange, onSend, onAbort,
  onToggleMethodMenu, onImportCurl,
}: StudioTopBarProps) {

  const getStageStatus = (stageId: PipelineStage) => {
    const order: PipelineStage[] = ["draft", "dispatch", "await", "render"];
    const si = order.indexOf(stageId);
    const ci = order.indexOf(pipeline);
    if (si === ci && isLoading) return "active";
    if (si < ci || (si === ci && !isLoading && pipeline === "render")) return "done";
    return "inactive";
  };

  return (
    <div
      className="h-10 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center gap-2 px-2"
      style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
    >
      {/* METHOD DROPDOWN */}
      <div className="relative shrink-0">
        <button
          className="h-7 px-2 pr-1.5 flex items-center gap-1.5 border border-[color:var(--color-border-subtle)] rounded-sm font-mono text-[11px] focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
          style={{ background: "var(--color-bg-panel)" }}
          onClick={onToggleMethodMenu}
        >
          <span className="font-bold" style={{ color: getMethodColor(method) }}>
            {method}
          </span>
          <ChevronIcon size={10} className="text-[color:var(--color-text-muted)]" />
        </button>

        {showMethodMenu && (
          <div
            className="absolute left-0 top-full mt-0.5 w-24 border border-[color:var(--color-border-subtle)] rounded-sm z-20 py-0.5"
            style={{ background: "var(--color-bg-panel)" }}
          >
            {METHODS.map((m) => (
              <button
                key={m}
                onClick={() => { onMethodChange(m); onToggleMethodMenu(); }}
                className="w-full text-left px-2 py-0.5 font-mono text-[11px] hover:bg-[color:var(--color-bg-hover)] flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:bg-[color:var(--color-bg-hover)]"
              >
                <span className="font-bold" style={{ color: getMethodColor(m) }}>{m}</span>
                {method === m && (
                  <DotIcon size={6} className="text-[color:var(--color-accent)]" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* URL BAR — clean, no injection hint tokens */}
      <div
        className="flex-1 min-w-0 h-7 flex items-stretch border border-[color:var(--color-border-subtle)] rounded-sm focus-within:border-[color:var(--color-accent)] transition-colors"
        style={{ background: "var(--color-bg-panel)" }}
      >
        <input
          type="text"
          placeholder="https://target.com/api/endpoint"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !isLoading && url.trim()) onSend(); }}
          className="flex-1 min-w-0 bg-transparent font-mono text-[11.5px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-ghost)] outline-none px-2"
          spellCheck={false}
        />
      </div>

      {/* IMPORT CURL */}
      <button
        onClick={onImportCurl}
        title="Import cURL"
        className="w-7 h-7 border border-[color:var(--color-border-subtle)] rounded-sm flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] transition-colors shrink-0 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
        style={{ background: "var(--color-bg-panel)" }}
      >
        <ClipboardIcon size={11} />
      </button>

      {/* SAVE */}
      <button
        title="Save request"
        className="w-7 h-7 border border-[color:var(--color-border-subtle)] rounded-sm flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] transition-colors shrink-0 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
        style={{ background: "var(--color-bg-panel)" }}
      >
        <SaveIcon size={11} />
      </button>

      {/* PIPELINE DOTS */}
      <div className="max-[600px]:hidden flex items-center gap-[3px] shrink-0">
        {STAGES.map((s, idx) => {
          const status = getStageStatus(s.id);
          let style: React.CSSProperties = {};
          let baseClass = "w-[5px] h-[5px] rounded-full transition-colors duration-300 ";
          if (status === "active") {
            baseClass += "shadow-[0_0_8px_var(--color-accent)]";
            style = { background: "var(--color-accent)" };
          } else if (status === "done") {
            style = { background: "var(--color-status-success)" };
          } else {
            style = { background: "var(--color-border-hover)" };
          }
          return (
            <React.Fragment key={s.id}>
              {idx > 0 && <div className="w-2 h-px bg-[color:var(--color-border-subtle)]" />}
              <div className={baseClass} style={style} title={s.label} />
            </React.Fragment>
          );
        })}
      </div>

      {/* SEND / ABORT */}
      {isLoading ? (
        <button
          onClick={onAbort}
          className="h-7 px-3 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] font-semibold text-white rounded-sm border border-[color:var(--color-status-critical)] text-[color:var(--color-status-critical)] hover:bg-[rgba(239,68,68,0.1)] active:scale-95 transition-all duration-150 shrink-0 focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
        >
          <StopIcon size={10} />
          <span className="max-[600px]:hidden">ABORT</span>
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!url.trim()}
          className="h-7 px-3 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] font-semibold text-white rounded-sm active:scale-95 transition-all duration-150 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-1 focus-visible:outline-white focus-visible:outline-offset-2"
          style={{ background: "var(--color-accent)" }}
        >
          <PlayIcon size={10} />
          <span className="max-[600px]:hidden">SEND</span>
        </button>
      )}
    </div>
  );
}
