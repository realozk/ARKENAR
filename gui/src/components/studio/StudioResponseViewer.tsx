import React, { useState } from "react";
import { Copy, Check, Trash2, Braces, GitCompare } from "lucide-react";
import type { StudioResponse, ResponseTab } from "./useStudio";
import { RESPONSE_TABS } from "./useStudio";

const SC: React.CSSProperties = { scrollbarWidth: "thin", scrollbarColor: "#333 #0d0d0d" };

const C = {
  root: { width: 380, minWidth: 380, flexShrink: 0, background: "#141414", borderLeft: "1px solid #2a2a2a", display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  tabBar: { display: "flex", alignItems: "center", gap: 0, borderBottom: "1px solid #2a2a2a", background: "#141414", flexShrink: 0 },
  tab: (active: boolean): React.CSSProperties => ({
    padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 1,
    textTransform: "uppercase" as const, fontFamily: "monospace",
    color: active ? "#e0e0e0" : "#666666",
    borderBottom: `2px solid ${active ? "#ff6b35" : "transparent"}`,
    background: "transparent", border: "none",
    cursor: "pointer", transition: "color 0.1s", marginBottom: -1,
  }),
  body: { flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" as const },
  codeArea: { flex: 1, minHeight: 0, overflowY: "auto" as const, background: "#0d0d0d", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6, borderTop: "1px solid #2a2a2a" },
  lineWrap: { display: "flex", minWidth: 0 },
  lineNum: { minWidth: 36, padding: "0 8px", textAlign: "right" as const, color: "#444", userSelect: "none" as const, borderRight: "1px solid #1a1a1a", flexShrink: 0, fontSize: 11 },
  lineText: { padding: "0 10px", color: "#e0e0e0", whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const, flex: 1 },
  emptyState: { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", color: "#444444", fontFamily: "monospace", fontSize: 12, gap: 8 },
  errorState: { flex: 1, padding: 14, fontFamily: "monospace", fontSize: 12, color: "#f44336", background: "#0d0d0d", overflowY: "auto" as const },
  headerTable: { flex: 1, overflowY: "auto" as const, background: "#0d0d0d" },
  headerRow: (i: number): React.CSSProperties => ({ display: "flex", gap: 0, padding: "5px 12px", borderBottom: "1px solid #1a1a1a", background: i % 2 === 0 ? "#0d0d0d" : "#111111" }),
  headerKey: { fontSize: 11, fontFamily: "monospace", color: "#ff6b35", minWidth: 140, flexShrink: 0, wordBreak: "break-all" as const },
  headerVal: { fontSize: 11, fontFamily: "monospace", color: "#aaaaaa", flex: 1, wordBreak: "break-all" as const, paddingLeft: 8 },
  cookieRow: { display: "flex", flexDirection: "column" as const, padding: "8px 12px", borderBottom: "1px solid #1a1a1a" },
  cookieRaw: { fontSize: 11, fontFamily: "monospace", color: "#aaaaaa", wordBreak: "break-all" as const },
  utilBar: { display: "flex", gap: 6, padding: "7px 10px", borderTop: "1px solid #2a2a2a", background: "#141414", flexShrink: 0, flexWrap: "wrap" as const, alignItems: "center" },
  utilBtn: { display: "flex", alignItems: "center", gap: 5, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, padding: "4px 10px", fontSize: 10, color: "#aaaaaa", cursor: "pointer", fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const },
  dangerBtn: { display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid #333", borderRadius: 4, padding: "4px 10px", fontSize: 10, color: "#666666", cursor: "pointer", fontFamily: "monospace" },
  diffAdded: { background: "rgba(76,175,80,0.1)", color: "#4caf50", borderLeft: "2px solid #4caf50" },
  diffRemoved: { background: "rgba(244,67,54,0.1)", color: "#f44336", borderLeft: "2px solid #f44336" },
  diffSame: { color: "#555", borderLeft: "2px solid transparent" },
  truncatedBanner: { background: "#1a1a1a", borderBottom: "1px solid #ff980066", padding: "4px 12px", fontSize: 10, color: "#ff9800", fontFamily: "monospace", flexShrink: 0 },
};

interface DiffLine { type: "same" | "added" | "removed"; text: string; }

interface StudioResponseViewerProps {
  response: StudioResponse | null;
  error: string | null;
  responseTab: ResponseTab;
  onTabChange: (t: ResponseTab) => void;
  codeLines: string[];
  responseCookies: [string, string][];
  compareMode: boolean;
  diffLines: DiffLine[];
  onBeautify: () => void;
  onClear: () => void;
  onShowPoc: () => void;
}

export default function StudioResponseViewer({
  response, error, responseTab, onTabChange, codeLines, responseCookies,
  compareMode, diffLines, onBeautify, onClear, onShowPoc,
}: StudioResponseViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!response?.body) return;
    await navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const hasBody = !!response?.body;

  return (
    <div style={C.root}>
      <div style={C.tabBar}>
        {RESPONSE_TABS.map(t => (
          <button key={t.id} style={C.tab(responseTab === t.id)} onClick={() => onTabChange(t.id)}>
            {t.label}
            {t.id === "cookies" && responseCookies.length > 0 && (
              <span style={{ marginLeft: 5, fontSize: 10, background: "rgba(255,107,53,0.2)", color: "#ff6b35", padding: "0 5px", borderRadius: 8 }}>
                {responseCookies.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={C.body}>
        {responseTab === "body" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {response?.body_truncated && (
              <div style={C.truncatedBanner}>⚠ Response truncated — showing first portion only.</div>
            )}
            {!response && !error && (
              <div style={C.emptyState}>
                <span style={{ fontSize: 28, color: "#2a2a2a" }}>⬅</span>
                <span>Execute a request to see the response.</span>
              </div>
            )}
            {error && !response && (
              <div style={{ ...C.errorState, ...SC }}>{error}</div>
            )}
            {response && !compareMode && (
              <div style={{ ...C.codeArea, ...SC }}>
                {codeLines.map((line, i) => (
                  <div key={i} style={C.lineWrap}>
                    <span style={C.lineNum}>{i + 1}</span>
                    <span style={C.lineText}>{line}</span>
                  </div>
                ))}
              </div>
            )}
            {compareMode && diffLines.length > 0 && (
              <div style={{ ...C.codeArea, ...SC }}>
                {diffLines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      ...C.lineWrap,
                      ...(line.type === "added" ? C.diffAdded : line.type === "removed" ? C.diffRemoved : C.diffSame),
                    }}
                  >
                    <span style={{ ...C.lineNum, color: line.type === "added" ? "#4caf50" : line.type === "removed" ? "#f44336" : "#333" }}>
                      {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
                    </span>
                    <span style={{ ...C.lineText, color: line.type === "same" ? "#555" : undefined }}>{line.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {responseTab === "headers" && (
          <div style={{ ...C.headerTable, ...SC }}>
            {!response ? (
              <div style={{ ...C.emptyState, height: "100%" }}>No response yet.</div>
            ) : response.headers.length === 0 ? (
              <div style={{ ...C.emptyState, height: "100%" }}>No headers.</div>
            ) : (
              response.headers.map(([k, v], i) => (
                <div key={i} style={C.headerRow(i)}>
                  <span style={C.headerKey}>{k}</span>
                  <span style={C.headerVal}>{v}</span>
                </div>
              ))
            )}
          </div>
        )}

        {responseTab === "cookies" && (
          <div style={{ ...C.headerTable, ...SC }}>
            {responseCookies.length === 0 ? (
              <div style={{ ...C.emptyState, height: "100%" }}>No Set-Cookie headers.</div>
            ) : (
              responseCookies.map(([, v], i) => (
                <div key={i} style={C.cookieRow}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#ff6b35", marginBottom: 3 }}>Cookie {i + 1}</span>
                  <span style={C.cookieRaw}>{v}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div style={C.utilBar}>
        <button
          style={{ ...C.utilBtn, color: copied ? "#4caf50" : "#aaaaaa", borderColor: copied ? "#4caf5044" : "#2a2a2a" }}
          onClick={handleCopy}
          disabled={!hasBody}
          title="Copy response body"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button style={C.utilBtn} onClick={onBeautify} disabled={!hasBody} title="Beautify JSON">
          <Braces size={11} />
          Beautify
        </button>
        <button style={C.utilBtn} onClick={onShowPoc} title="Export PoC snippet">
          <GitCompare size={11} />
          PoC
        </button>
        <div style={{ flex: 1 }} />
        <button style={C.dangerBtn} onClick={onClear} title="Clear response">
          <Trash2 size={11} />
          Clear
        </button>
      </div>
    </div>
  );
}
