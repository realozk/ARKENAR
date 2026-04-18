import React, { useState } from "react";
import {
  CopyIcon, WandIcon, GitCompareIcon, Code2Icon, ArrowLeftRightIcon, TrashIcon, SendIcon, SaveIcon,
} from "../icons";
import type { StudioResponse, ResponseTab } from "./useStudio";
import { RESPONSE_TABS } from "./useStudio";
import { getStatusClass } from "./StudioHistorySidebar";

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
  onMirrorToRequest?: () => void;
  onToggleCompare?: () => void;
}

function CodeLine({ line }: { line: string }) {
  if (line.length > 2000) return <>{line}</>;

  const keyMatch = line.match(/^(\s*)"([^"]*?)"(\s*:)(.*)$/);
  if (keyMatch) {
    const [_, indent, key, colon, rest] = keyMatch;

    let restNode: React.ReactNode = rest;

    const strMatch = rest.match(/^(\s*)"([^"]*?)"(.*)$/);
    if (strMatch) {
      restNode = <>{strMatch[1]}<span style={{ color: "#86efac" }}>"{strMatch[2]}"</span>{strMatch[3]}</>;
    } else if (rest.match(/\b(true|false)\b/)) {
      const boolMatch = rest.match(/^(.*?\b)(true|false)(\b.*)$/);
      if (boolMatch) restNode = <>{boolMatch[1]}<span style={{ color: "#fbbf24" }}>{boolMatch[2]}</span>{boolMatch[3]}</>;
    } else if (rest.match(/\bnull\b/)) {
      const nullMatch = rest.match(/^(.*?\b)(null)(\b.*)$/);
      if (nullMatch) restNode = <>{nullMatch[1]}<span className="text-[color:var(--color-text-ghost)]">{nullMatch[2]}</span>{nullMatch[3]}</>;
    } else if (rest.match(/-?[\d.]+/)) {
      const numMatch = rest.match(/^(.*?)(-?[\d.]+)(.*)$/);
      if (numMatch) restNode = <>{numMatch[1]}<span style={{ color: "#c4b5fd" }}>{numMatch[2]}</span>{numMatch[3]}</>;
    }

    return <>{indent}<span style={{ color: "#93c5fd" }}>"{key}"</span>{colon}{restNode}</>;
  }

  const strMatchOnly = line.match(/^(\s*)"([^"]*?)"(.*)$/);
  if (strMatchOnly && !line.includes(':')) {
    return <>{strMatchOnly[1]}<span style={{ color: "#86efac" }}>"{strMatchOnly[2]}"</span>{strMatchOnly[3]}</>;
  }

  return <>{line}</>;
}

export default function StudioResponseViewer({
  response, error, responseTab, onTabChange, codeLines, responseCookies,
  compareMode, diffLines, onBeautify, onClear, onShowPoc,
  onMirrorToRequest, onToggleCompare
}: StudioResponseViewerProps) {
  const [_copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!response?.body) return;
    await navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const hasBody = !!response?.body;

  const getStatusText = (status: number) => {
    if (status === 200) return "OK";
    if (status === 201) return "Created";
    if (status === 204) return "No Content";
    if (status === 301) return "Moved Permanently";
    if (status === 302) return "Found";
    if (status === 400) return "Bad Request";
    if (status === 401) return "Unauthorized";
    if (status === 403) return "Forbidden";
    if (status === 404) return "Not Found";
    if (status === 429) return "Too Many Requests";
    if (status === 500) return "Internal Server Error";
    if (status >= 500) return "Server Error";
    return "";
  };

  const getContentType = () => {
    if (!response) return null;
    const item = response.headers.find(h => h[0].toLowerCase() === 'content-type');
    return item ? item[1] : null;
  };

  // Status badge color for the panel header pill
  const getStatusBadgeStyle = (status: number): React.CSSProperties => {
    if (status >= 200 && status < 300) return { color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.06)" };
    if (status >= 300 && status < 400) return { color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.06)" };
    if (status >= 400 && status < 500) return { color: "#eab308", border: "1px solid rgba(234,179,8,0.3)", background: "rgba(234,179,8,0.06)" };
    return { color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" };
  };

  return (
    <div className="flex flex-col h-full flex-1 min-w-0" style={{ background: "var(--color-bg-root)" }}>

      {/* PANEL HEADER */}
      <div
        className="h-7 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center justify-between px-2 font-mono text-[10px] tracking-[0.18em]"
        style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
      >
        <div className="flex items-center gap-1.5 text-[color:var(--color-text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
          <span className="uppercase">RESPONSE</span>
        </div>
        {/* Inline status + action buttons */}
        <div className="flex items-center gap-1">
          {response && (
            <>
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm"
                style={getStatusBadgeStyle(response.status)}
              >
                {response.status} {getStatusText(response.status)}
              </span>
              <span className="font-mono text-[10px] text-[color:var(--color-text-muted)] mx-1">
                {response.timing_ms ?? 0}ms · {(new Blob([response.body || ""]).size / 1024).toFixed(2)} KB
              </span>
            </>
          )}
          <TBtn title="Save" onClick={() => { }}>
            <SaveIcon size={10} />
          </TBtn>
          <TBtn title="Copy response body" onClick={handleCopy} disabled={!hasBody}>
            <CopyIcon size={10} />
          </TBtn>
        </div>
      </div>

      {/* SUB-TABS */}
      <div
        className="h-7 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center px-1 font-mono text-[10.5px] tracking-[0.14em]"
        style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
      >
        {RESPONSE_TABS.map(t => {
          const active = responseTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className="relative h-7 px-3 flex items-center gap-1.5 transition-colors"
              style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
            >
              <span>{t.label.toUpperCase()}</span>
              {t.id === "cookies" && responseCookies.length > 0 && (
                <span className="px-1 text-[9.5px] rounded-sm" style={{ background: "var(--color-bg-panel)", color: "var(--color-text-ghost)" }}>
                  {responseCookies.length}
                </span>
              )}
              {t.id === "headers" && response && response.headers.length > 0 && (
                <span className="px-1 text-[9.5px] rounded-sm" style={{ background: "var(--color-bg-panel)", color: "var(--color-text-ghost)" }}>
                  {response.headers.length}
                </span>
              )}
              {active && (
                <span
                  className="absolute left-2 right-2 -bottom-px h-[1px]"
                  style={{ background: "var(--color-accent)" }}
                />
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        {/* Tool buttons: beautify, mirror, poc, diff */}
        <div className="flex items-center gap-0.5 pr-1">
          <TBtn title="Beautify JSON" onClick={onBeautify} disabled={!hasBody}>
            <WandIcon size={11} />
          </TBtn>
          <TBtn title="Mirror body to request" onClick={onMirrorToRequest} disabled={!hasBody}>
            <ArrowLeftRightIcon size={11} />
          </TBtn>
          <TBtn title="Export PoC snippet" onClick={onShowPoc} disabled={!hasBody}>
            <Code2Icon size={11} />
          </TBtn>
          <TBtn
            title="Diff / Compare"
            onClick={onToggleCompare}
            disabled={!hasBody}
            active={compareMode}
          >
            <GitCompareIcon size={11} />
          </TBtn>
          <div className="w-px h-3 bg-[color:var(--color-border-subtle)] mx-1" />
          <TBtn title="Clear response" onClick={onClear}>
            <TrashIcon size={11} />
          </TBtn>
        </div>
      </div>

      {/* BODY SECTIONS */}
      <div className="flex flex-1 overflow-hidden">

        {responseTab === "body" && (
          <div className="flex flex-col flex-1 min-w-0">
            {response?.body_truncated && (
              <div className="border-b border-[color:var(--color-status-warning)]/30 px-4 py-1.5 text-[10px] text-[color:var(--color-status-warning)] font-mono shrink-0" style={{ background: "rgba(234,179,8,0.08)" }}>
                ⚠ Response truncated — showing first portion only.
              </div>
            )}

            {!response && !error && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[color:var(--color-text-ghost)]">
                <SendIcon size={24} className="opacity-20" />
                <span className="font-mono text-[11px] opacity-50 text-center px-6">
                  Send a request to see the response
                </span>
              </div>
            )}

            {error && !response && (
              <div className="flex-1 p-4 font-mono text-[11.5px] text-[color:var(--color-status-critical)] overflow-auto break-words" style={{ background: "var(--color-bg-root)" }}>
                {error}
              </div>
            )}

            {response && !compareMode && (
              <div className="flex flex-1 overflow-hidden" style={{ background: "var(--color-bg-root)" }}>
                {/* Gutter */}
                <div
                  className="shrink-0 pt-1.5 pb-2 font-mono text-[11.5px] text-right select-none sticky left-0 border-r border-[color:var(--color-border-subtle)]"
                  style={{ background: "var(--color-bg-root)", color: "var(--color-border-hover)" }}
                >
                  {codeLines.map((_, i) => (
                    <div key={i} className="px-2 leading-relaxed">{i + 1}</div>
                  ))}
                </div>
                {/* Code */}
                <div className="flex-1 overflow-auto px-3 py-1.5 font-mono text-[11.5px] text-[color:var(--color-text-primary)] leading-relaxed whitespace-pre" style={{ background: "var(--color-bg-root)" }}>
                  {codeLines.map((line, i) => (
                    <div key={i}><CodeLine line={line} /></div>
                  ))}
                </div>
              </div>
            )}

            {compareMode && diffLines.length > 0 && (
              <div className="flex flex-1 overflow-hidden" style={{ background: "var(--color-bg-root)" }}>
                {/* Diff gutter */}
                <div
                  className="shrink-0 pt-1.5 pb-2 font-mono text-[11.5px] text-right select-none sticky left-0 border-r border-[color:var(--color-border-subtle)]"
                  style={{ background: "var(--color-bg-root)", color: "var(--color-text-muted)" }}
                >
                  {diffLines.map((line, i) => (
                    <div
                      key={i}
                      className="px-2 leading-relaxed"
                      style={{
                        color: line.type === "added"
                          ? "var(--color-status-success)"
                          : line.type === "removed"
                            ? "var(--color-status-critical)"
                            : undefined,
                      }}
                    >
                      {line.type === "added" ? "+" : line.type === "removed" ? "−" : i + 1}
                    </div>
                  ))}
                </div>
                {/* Diff content */}
                <div className="flex-1 overflow-auto py-1.5 font-mono text-[11.5px] leading-relaxed whitespace-pre" style={{ background: "var(--color-bg-root)" }}>
                  {diffLines.map((line, i) => (
                    <div
                      key={i}
                      className="px-4 flex min-w-max"
                      style={{
                        background: line.type === "added"
                          ? "rgba(34,197,94,0.07)"
                          : line.type === "removed"
                            ? "rgba(239,68,68,0.07)"
                            : undefined,
                        color: line.type === "added"
                          ? "var(--color-status-success)"
                          : line.type === "removed"
                            ? "var(--color-status-critical)"
                            : "var(--color-text-muted)",
                      }}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {responseTab === "headers" && (
          <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-root)" }}>
            {!response ? (
              <div className="flex flex-col items-center justify-center h-full text-[color:var(--color-text-ghost)] font-mono text-[11px]">No response yet.</div>
            ) : response.headers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[color:var(--color-text-ghost)] font-mono text-[11px]">No headers.</div>
            ) : (
              <table className="w-full font-mono text-[11px]">
                <tbody>
                  {response.headers.map(([k, v], i) => (
                    <tr key={i} className="border-b border-[color:var(--color-border-subtle)]">
                      <td className="py-1 pl-3 pr-3 align-top w-[34%]" style={{ color: "#fdba74" }}>{k}</td>
                      <td className="py-1 pr-3 text-[color:var(--color-text-primary)] break-all">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {responseTab === "cookies" && (
          <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px]" style={{ background: "var(--color-bg-root)" }}>
            {responseCookies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[color:var(--color-text-ghost)]">No Set-Cookie headers.</div>
            ) : (
              <>
                <div className="text-[color:var(--color-text-muted)] mb-1 text-[9.5px] uppercase tracking-wider">Set-Cookie</div>
                <div className="border border-[color:var(--color-border-subtle)] p-2 space-y-1">
                  {responseCookies.map(([k, v], i) => {
                    const parts = v.split(';');
                    const rawName = parts[0].split('=')[0];
                    const attrs = parts.slice(1).join(';').trim();
                    return (
                      <div key={i}>
                        <span style={{ color: "#fdba74" }}>{rawName || k}</span>
                        {v.includes('=') && <span className="text-[color:var(--color-text-primary)]">={parts[0].split('=').slice(1).join('=')}</span>}
                        {attrs && <span className="text-[color:var(--color-text-ghost)] ml-1">{attrs}</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* STATUS FOOTER — only when response exists */}
      {response && !error && (
        <div
          className="h-6 shrink-0 border-t border-[color:var(--color-border-subtle)] px-2 flex items-center justify-between font-mono text-[9.5px] text-[color:var(--color-text-muted)]"
          style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: "var(--color-status-success)" }}
              />
              connected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-bold ${getStatusClass(response.status)}`}>{response.status}</span>
            <span>{response.timing_ms ?? 0}ms</span>
            <span className="text-[color:var(--color-text-primary)]">{new Blob([response.body || ""]).size}B</span>
            {getContentType() && <span className="truncate max-w-[120px]">{getContentType()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// Shared tool-button in response panel header
function TBtn({
  title, onClick, disabled, active, children,
}: {
  title: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-5 h-5 flex items-center justify-center rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        color: active ? "var(--color-accent)" : "var(--color-text-ghost)",
        background: active ? "rgba(249,115,22,0.1)" : undefined,
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = active ? "var(--color-accent)" : "var(--color-text-ghost)"; }}
    >
      {children}
    </button>
  );
}
