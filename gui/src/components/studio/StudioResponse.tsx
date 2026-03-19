import { useState, useEffect, useRef } from "react";
import { Copy, Braces, GitCompare, ArrowLeftToLine, Search, X } from "lucide-react";
import { ResponseTab, StudioResponse as StudioResponseType, getStatusClass, RESPONSE_TABS } from "./useStudio";

const highlightText = (text: string | null | undefined, highlight: string) => {
  if (!text) return "";
  if (!highlight.trim()) return text;
  const parts = String(text).split(new RegExp(`(${highlight})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === highlight.toLowerCase() ? (
      <span key={index} className="bg-orange-500 text-black font-bold rounded-[2px] px-0.5">
        {part}
      </span>
    ) : (part)
  );
};

export interface StudioResponseProps {
  state: {
    response: StudioResponseType | null;
    previousResponse: StudioResponseType | null;
    error: string | null;
    responseTab: ResponseTab;
    compareMode: boolean;
    displayBody: string;
    codeLines: string[];
    diffLines: Array<{ type: "same" | "added" | "removed"; text: string }>;
    responseCookies: [string, string][];
    isResponseJson: boolean;
  };
  setters: {
    setResponseTab: (t: ResponseTab) => void;
    setResponse: (r: StudioResponseType | null) => void;
    setCompareMode: (c: boolean | ((c: boolean) => boolean)) => void;
  };
  handlers: {
    onBeautifyResponse: () => void;
    onMirrorToRequest: () => void;
    onCompareWithHistory: (historyBody: string) => void;
  };
}

export function StudioResponse({ state, setters, handlers }: StudioResponseProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchTerm('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <section className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-xl border border-border-subtle bg-bg-panel p-4 animate-fade-slide-in">
      {/* Error Box */}
      {state.error && (
        <div className="mb-3 rounded-lg border border-status-critical/25 bg-status-critical/10 px-3 py-2 text-xs font-semibold tracking-wider text-status-critical">
          {state.error}
        </div>
      )}

      {/* Status Bar */}
      <div className="mb-3 flex items-center justify-between rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs tracking-wider">
        <div className="flex items-center gap-3 text-text-secondary">
          <span className={state.response ? `${getStatusClass(state.response.status)} font-semibold uppercase tracking-wider` : "text-text-muted font-semibold uppercase tracking-wider"}>
            STATUS: {state.response ? state.response.status : "—"}
          </span>
          <span className="font-semibold uppercase tracking-wider text-text-muted">
            TIME: {state.response ? `${state.response.timing_ms} ms` : "—"}
          </span>
          {state.response?.body_truncated && (
            <span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wider text-status-warning">
              TRUNCATED
            </span>
          )}

          {/* Tabs */}
          <div className="ml-2 flex items-center gap-2">
            {RESPONSE_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setters.setResponseTab(tab.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                  state.responseTab === tab.id
                    ? 'bg-bg-card text-text-primary border-accent/40 ring-1 ring-accent/20'
                    : 'bg-bg-card text-text-muted border-border-subtle hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center bg-zinc-900 border border-zinc-700/50 rounded flex-shrink-0 px-2 py-1 w-64 focus-within:border-orange-500/50 transition-all ml-auto mr-4">
          <Search className="w-3.5 h-3.5 text-zinc-500 mr-2" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search... (Ctrl+F)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none text-xs text-zinc-200 focus:outline-none w-full placeholder-zinc-600"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="ml-1 text-zinc-500 hover:text-orange-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {state.isResponseJson && (
          <button
            type="button"
            onClick={handlers.onMirrorToRequest}
            title="Copy JSON response to Request Body"
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-text hover:bg-accent/20 hover:border-accent/50 transition-all duration-200"
          >
            <ArrowLeftToLine size={13} strokeWidth={2.5} />
            Send to Request
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 rounded-lg border border-border-subtle bg-bg-card p-2 overflow-hidden relative">
        {state.responseTab === "body" && (
          <div className="h-full overflow-auto rounded-lg border border-border-subtle bg-bg-input">
            {state.compareMode ? (
              <div className="h-full overflow-auto p-2 font-mono text-[13px] leading-6">
                {state.diffLines.length === 0 ? (
                  <div className="text-text-muted p-4 text-center">
                    Send a second request to see the diff against this response.
                  </div>
                ) : (
                  state.diffLines.map((line, idx) => (
                    <div key={line.type + '-' + idx} className={`px-2 py-0.5 ${
                      line.type === 'added' ? 'bg-status-success/10 text-status-success' :
                      line.type === 'removed' ? 'bg-status-critical/10 text-status-critical' :
                      'text-text-primary'
                    }`}>
                      {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                      {line.text}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex h-full overflow-auto font-mono text-[13px] leading-6">
                <div className="select-none border-r border-border-subtle bg-bg-card px-3 py-2 text-text-muted">
                  {state.codeLines.map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>
                <pre className="min-w-full whitespace-pre px-3 py-2 text-text-primary">
                  {highlightText(state.displayBody, searchTerm)}
                </pre>
              </div>
            )}
          </div>
        )}

        {state.responseTab === "headers" && (
          <div className="h-full overflow-auto space-y-2 p-1">
            {state.response?.headers?.length ? (
              state.response.headers.map(([k, v], idx) => (
                <div key={`${k}-${idx}`} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2">
                  <div className="text-[13px] text-text-muted">{k}</div>
                  <div className="break-all font-mono text-[13px] text-text-primary">{v}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-text-muted">No headers.</div>
            )}
          </div>
        )}

        {state.responseTab === "cookies" && (
          <div className="h-full overflow-auto space-y-2 p-1">
            {state.responseCookies.length ? (
              state.responseCookies.map(([, v], idx) => (
                <div key={idx} className="group flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-bg-input px-3 py-2">
                  <div className="font-mono text-[13px] text-text-primary break-all">
                    {v}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(v)}
                    className="flex-shrink-0 rounded p-1.5 text-text-muted opacity-0 transition-all hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100"
                    title="Copy cookie"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-sm text-text-muted">No cookies.</div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setters.setResponse(null)}
          className="rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
        >
          Clear Response
        </button>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(state.response?.body ?? "")}
          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
        >
          <Copy size={13} />
          Copy Body
        </button>
        <button
          type="button"
          onClick={handlers.onBeautifyResponse}
          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
        >
          <Braces size={13} />
          Beautify {"{}"}
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !state.compareMode;
            setters.setCompareMode(next);
            if (next && state.previousResponse && state.response) {
              handlers.onCompareWithHistory(state.previousResponse.body);
            }
          }}
          className={`inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
            state.compareMode ? "bg-accent/10 text-accent-text ring-1 ring-accent/20" : "bg-bg-card text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          }`}
        >
          <GitCompare size={13} />
          Compare (Diff)
        </button>
      </div>
    </section>
  );
}