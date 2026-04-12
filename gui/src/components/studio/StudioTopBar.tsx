import React from "react";
import { Play, Square, ChevronDown, Clipboard } from "lucide-react";
import type { HttpMethod, PipelineStage } from "./useStudio";
import { METHODS, getMethodColor } from "./useStudio";

const C = {
  root: { flexShrink: 0, background: "#141414", borderBottom: "1px solid #2a2a2a", display: "flex", flexDirection: "column" as const },
  row1: { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", minHeight: 48 },
  row2: { display: "flex", alignItems: "center", gap: 0, padding: "0 14px 6px", borderTop: "1px solid #1a1a1a" },
  brand: { display: "flex", alignItems: "center", gap: 8, marginRight: 12, flexShrink: 0 },
  brandDot: { width: 8, height: 8, borderRadius: "50%", background: "#ff6b35", flexShrink: 0 },
  brandText: { fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, color: "#e0e0e0" },
  methodBtn: (method: HttpMethod) => ({
    display: "flex", alignItems: "center", gap: 4,
    background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4,
    padding: "5px 10px", fontSize: 12, fontWeight: 700, fontFamily: "monospace",
    color: getMethodColor(method), cursor: "pointer", flexShrink: 0,
    letterSpacing: 1,
  } as React.CSSProperties),
  urlInput: { flex: 1, background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 4, padding: "6px 10px", fontSize: 12, fontFamily: "monospace", color: "#e0e0e0", outline: "none", minWidth: 0, width: "100%" },
  btnExecute: (disabled: boolean) => ({
    display: "flex", alignItems: "center", gap: 6,
    background: disabled ? "#2a2a2a" : "#ff6b35",
    border: "none", borderRadius: 4, padding: "6px 16px",
    fontSize: 11, fontWeight: 700, letterSpacing: 1,
    textTransform: "uppercase" as const, color: disabled ? "#666" : "#000",
    cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
  } as React.CSSProperties),
  btnAbort: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #f44336", borderRadius: 4, padding: "5px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const, color: "#f44336", cursor: "pointer", flexShrink: 0 },
  btnImport: { display: "flex", alignItems: "center", gap: 5, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, padding: "5px 10px", fontSize: 10, color: "#aaaaaa", cursor: "pointer", fontFamily: "monospace", flexShrink: 0 },
  methodMenu: { position: "absolute" as const, top: "100%", left: 0, zIndex: 999, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, marginTop: 2, minWidth: 100, overflow: "hidden" },
  methodItem: (method: HttpMethod) => ({ display: "block", width: "100%", padding: "7px 14px", fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: getMethodColor(method), background: "transparent", border: "none", cursor: "pointer", textAlign: "left" as const, letterSpacing: 1 }),
  pipeline: { display: "flex", alignItems: "center", gap: 0, marginLeft: "auto", background: "#0a0a0a", padding: "4px 10px", borderRadius: 6, border: "1px solid #1a1a1a" },
};

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: "draft", label: "DRAFT" },
  { id: "dispatch", label: "DISPATCH" },
  { id: "await", label: "AWAIT" },
  { id: "render", label: "RENDER" },
];

function stageDot(stage: PipelineStage, current: PipelineStage, isRunning: boolean): React.CSSProperties {
  const order: PipelineStage[] = ["draft", "dispatch", "await", "render"];
  const si = order.indexOf(stage);
  const ci = order.indexOf(current);
  if (si === ci && isRunning) return { color: "#ff6b35" };
  if (si < ci || (si === ci && !isRunning && current === "render")) return { color: "#4caf50" };
  return { color: "#444444" };
}

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
  return (
    <div style={C.root}>
      <div style={C.row1}>
        <div style={C.brand}>
          <div style={C.brandDot} />
          <span style={C.brandText}>Exploit Studio</span>
        </div>

        <div style={{ position: "relative", flexShrink: 0 }}>
          <button style={C.methodBtn(method)} onClick={onToggleMethodMenu}>
            {method}
            <ChevronDown size={11} />
          </button>
          {showMethodMenu && (
            <div style={C.methodMenu}>
              {METHODS.map(m => (
                <button key={m} style={C.methodItem(m)} onClick={() => { onMethodChange(m); onToggleMethodMenu(); }}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          style={C.urlInput}
          type="text"
          placeholder="https://target.com/api/endpoint"
          value={url}
          onChange={e => onUrlChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !isLoading && url.trim()) onSend(); }}
        />

        <button style={C.btnImport} onClick={onImportCurl} title="Import cURL from clipboard">
          <Clipboard size={11} />
          cURL
        </button>

        {isLoading ? (
          <button style={C.btnAbort} onClick={onAbort}>
            <Square size={11} />
            Abort
          </button>
        ) : (
          <button style={C.btnExecute(!url.trim())} onClick={onSend} disabled={!url.trim()}>
            <Play size={11} />
            Execute
          </button>
        )}

        <div style={C.pipeline}>
          {STAGES.map((s, idx) => (
            <React.Fragment key={s.id}>
              {idx > 0 && (
                <div style={{ width: 16, height: 1, background: "#2a2a2a", margin: "0 4px" }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 9, ...stageDot(s.id, pipeline, isLoading) }}>
                  {s.id === pipeline && isLoading ? "●" : (["draft", "dispatch", "await", "render"].indexOf(s.id) <= ["draft", "dispatch", "await", "render"].indexOf(pipeline) ? "●" : "○")}
                </span>
                <span style={{ fontSize: 9, letterSpacing: 1, color: stageDot(s.id, pipeline, isLoading).color, fontWeight: 700 }}>
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
