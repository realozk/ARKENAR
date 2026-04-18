import React, { useState } from "react";
import { Copy, Wand2, GitCompare, Code2, ArrowLeftRight, Trash2, Send } from "lucide-react";
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
       restNode = <>{strMatch[1]}<span className="text-[#a8ff78]">"{strMatch[2]}"</span>{strMatch[3]}</>;
    } else if (rest.match(/\b(true|false)\b/)) {
       const boolMatch = rest.match(/^(.*?\b)(true|false)(\b.*)$/);
       if (boolMatch) restNode = <>{boolMatch[1]}<span className="text-accent-text">{boolMatch[2]}</span>{boolMatch[3]}</>;
    } else if (rest.match(/\bnull\b/)) {
       const nullMatch = rest.match(/^(.*?\b)(null)(\b.*)$/);
       if (nullMatch) restNode = <>{nullMatch[1]}<span className="text-text-ghost">{nullMatch[2]}</span>{nullMatch[3]}</>;
    } else if (rest.match(/-?[\d.]+/)) {
       const numMatch = rest.match(/^(.*?)(-?[\d.]+)(.*)$/);
       if (numMatch) restNode = <>{numMatch[1]}<span className="text-status-warning">{numMatch[2]}</span>{numMatch[3]}</>;
    }

    return <>{indent}<span className="text-[#9ecbff]">"{key}"</span>{colon}{restNode}</>;
  }

  const strMatchOnly = line.match(/^(\s*)"([^"]*?)"(.*)$/);
  if (strMatchOnly && !line.includes(':')) {
    return <>{strMatchOnly[1]}<span className="text-[#a8ff78]">"{strMatchOnly[2]}"</span>{strMatchOnly[3]}</>;
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

  // Derive status text mapping via standard HTTP codes if needed
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

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-bg-root">
      
      {/* TAB BAR */}
      <div className="flex items-end px-3 pt-2 bg-bg-panel border-b border-border-subtle shrink-0">
        <div className="flex items-end gap-[2px]">
          {RESPONSE_TABS.map(t => {
            const active = responseTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={active 
                  ? "px-3 py-2 text-xs font-semibold text-text-primary bg-bg-card border border-border-subtle border-b-0 rounded-t-md -mb-px z-10" 
                  : "px-3 py-2 text-xs font-semibold text-text-ghost rounded-t-md hover:text-text-muted transition-colors cursor-pointer border border-transparent border-b-0"
                }
              >
                {t.label.toUpperCase()}
                {t.id === "cookies" && responseCookies.length > 0 && (
                  <span className="ml-1.5 px-1.5 rounded-full bg-accent10 text-accent text-[10px] py-0.5">
                    {responseCookies.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Action Buttons in Tab Bar */}
        <div className="flex items-center gap-1.5 pb-1">
          <button onClick={onBeautify} disabled={!hasBody} title="Beautify JSON" className="flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border-subtle bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
            <Wand2 size={13} />
          </button>
          
          <button onClick={onMirrorToRequest} disabled={!hasBody} title="Mirror body to request" className="flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border-subtle bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
            <ArrowLeftRight size={13} />
          </button>

          <button onClick={onShowPoc} disabled={!hasBody} title="Export PoC snippet" className="flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border-subtle bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
            <Code2 size={13} />
          </button>

          <button onClick={onToggleCompare} disabled={!hasBody} title="Diff / Compare" className={`flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border-subtle bg-bg-card transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${compareMode ? 'text-accent border-accent bg-accent10' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'}`}>
            <GitCompare size={13} />
          </button>

          <button onClick={handleCopy} disabled={!hasBody} title="Copy response body" className="flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border-subtle bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
            <Copy size={13} />
          </button>
          
          <div className="w-px h-4 bg-border-subtle mx-1" />

          <button onClick={onClear} title="Clear response" className="flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border-subtle bg-bg-card text-text-muted hover:text-status-critical hover:bg-status-critical10 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* STATUS BAR */}
      {response && !error && (
        <div className="flex items-center gap-3 px-4 py-2 bg-bg-panel border-b border-border-subtle flex-wrap min-h-[36px] shrink-0">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm font-bold ${getStatusClass(response.status)}`}>{response.status}</span>
            <span className="text-xs text-text-ghost uppercase tracking-wider font-semibold">{getStatusText(response.status)}</span>
          </div>

          <div className="w-px h-3 bg-border-subtle" />

          <div className="flex items-center gap-1">
            <span className="text-xs text-text-ghost">Time</span>
            <span className="font-mono text-xs text-text-muted pl-1">{response.timing_ms ?? 0} ms</span>
          </div>

          <div className="w-px h-3 bg-border-subtle" />

          <div className="flex items-center gap-1">
            <span className="text-xs text-text-ghost">Size</span>
            <span className="font-mono text-xs text-text-muted pl-1">{new Blob([response.body || ""]).size} B</span>
          </div>

          {getContentType() && (
            <>
              <div className="w-px h-3 bg-border-subtle" />
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-ghost">Format</span>
                <span className="font-mono text-xs text-text-muted pl-1 truncate max-w-[150px]">{getContentType()}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* BODY SECTIONS */}
      <div className="flex flex-1 overflow-hidden">
        
        {responseTab === "body" && (
          <div className="flex flex-col flex-1 min-w-0">
            {response?.body_truncated && (
              <div className="bg-status-warning20 border-b border-status-warning/30 px-4 py-1.5 text-[10px] text-status-warning font-mono shrink-0">
                ⚠ Response truncated — showing first portion only.
              </div>
            )}
            
            {!response && !error && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-ghost">
                <Send size={24} className="opacity-20" />
                <span className="font-mono text-xs opacity-50 text-center px-6">Send a request to see the response</span>
              </div>
            )}
            
            {error && !response && (
              <div className="flex-1 p-4 font-mono text-xs text-status-critical bg-bg-root overflow-auto break-words">
                {error}
              </div>
            )}
            
            {response && !compareMode && (
              <div className="flex flex-1 overflow-hidden bg-bg-root">
                <div className="shrink-0 min-w-[40px] text-right px-3 py-4 font-mono text-[10px] text-text-ghost leading-7 border-r border-border-subtle bg-bg-card select-none">
                  {codeLines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <div className="flex-1 overflow-auto px-4 py-4 font-mono text-xs text-text-primary leading-7 whitespace-pre bg-bg-root">
                  {codeLines.map((line, i) => (
                    <div key={i}><CodeLine line={line} /></div>
                  ))}
                </div>
              </div>
            )}
            
            {compareMode && diffLines.length > 0 && (
              <div className="flex flex-1 overflow-hidden bg-bg-root">
                {/* Diff Gutter */}
                <div className="shrink-0 min-w-[40px] text-right px-3 py-4 font-mono text-[10px] text-text-ghost leading-7 border-r border-border-subtle bg-bg-card select-none">
                  {diffLines.map((line, i) => (
                    <div key={i} className={line.type === "added" ? "text-status-success" : line.type === "removed" ? "text-status-critical" : "text-text-muted"}>
                      {line.type === "added" ? "+" : line.type === "removed" ? "−" : i + 1}
                    </div>
                  ))}
                </div>
                {/* Diff Content */}
                <div className="flex-1 overflow-auto py-4 font-mono text-xs leading-7 whitespace-pre bg-bg-root">
                  {diffLines.map((line, i) => (
                    <div 
                      key={i} 
                      className={`px-4 flex min-w-max ${
                        line.type === "added" ? "bg-status-success10 text-status-success" : 
                        line.type === "removed" ? "bg-status-critical10 text-status-critical" : 
                        "text-text-muted"
                      }`}
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
          <div className="flex-1 overflow-y-auto bg-bg-root p-4">
            {!response ? (
              <div className="flex flex-col items-center justify-center h-full text-text-ghost font-mono text-xs">No response yet.</div>
            ) : response.headers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-ghost font-mono text-xs">No headers.</div>
            ) : (
              <div className="grid grid-cols-[minmax(120px,200px)_1fr] divide-y divide-border-subtle border border-border-subtle rounded-md">
                {response.headers.map(([k, v], i) => (
                  <React.Fragment key={i}>
                    <div className="font-mono text-xs text-[#9ecbff] py-2 px-3 break-words bg-bg-panel">{k}</div>
                    <div className="font-mono text-xs text-text-muted py-2 px-3 break-words bg-bg-card">{v}</div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {responseTab === "cookies" && (
          <div className="flex-1 overflow-y-auto bg-bg-root p-4">
            {responseCookies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-ghost font-mono text-xs">No Set-Cookie headers.</div>
            ) : (
              <table className="w-full border-collapse border border-border-subtle rounded-md overflow-hidden bg-bg-card inline-table">
                <thead>
                  <tr>
                    <th className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-ghost px-3 py-2 text-left bg-bg-panel border-b border-border-subtle w-1/3">Name</th>
                    <th className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-ghost px-3 py-2 text-left bg-bg-panel border-b border-border-subtle">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {responseCookies.map(([k, v], i) => {
                    const parts = v.split(';');
                    const rawName = parts[0].split('=')[0];
                    return (
                       <tr key={i} className="hover:bg-bg-hover transition-colors">
                        <td className="font-mono text-xs text-[#9ecbff] px-3 py-2 border-b border-border-subtle align-top break-words">
                          {rawName || k}
                        </td>
                        <td className="font-mono text-xs text-text-muted px-3 py-2 border-b border-border-subtle break-words">
                          {v}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
