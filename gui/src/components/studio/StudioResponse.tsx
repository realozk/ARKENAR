import React from "react";
import { Copy, Braces, GitCompare, ArrowLeftToLine } from "lucide-react";
import { ResponseTab, StudioResponse as StudioResponseType, getStatusClass, RESPONSE_TABS } from "./useStudio";


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
  };
}

export function StudioResponse({ state, setters, handlers }: StudioResponseProps) {
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
        </div>
                {/* Tabs */}
        <div className="mb-0 flex items-center gap-2   px-0 pt-0">
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
      <div className="flex-1 min-h-0 rounded-lg border border-border-subtle bg-bg-card p-2 overflow-hidden">
        {state.responseTab === "body" && (
          <div className="h-full overflow-auto rounded-lg border border-border-subtle bg-bg-input">
            {state.compareMode && state.previousResponse && state.response ? (
              <div className="h-full overflow-auto p-2 font-mono text-[13px] leading-6">
                {state.diffLines.length === 0 ? (
                  <div className="text-text-muted">No diff available.</div>
                ) : (
                  state.diffLines.map((line, idx) => (
                    <div
                      key={`${line.type}-${idx}`}
                      className={`px-2 py-0.5 ${
                        line.type === "added"
                          ? "bg-status-success/10 text-status-success"
                          : line.type === "removed"
                          ? "bg-status-critical/10 text-status-critical"
                          : "text-text-primary"
                      }`}
                    >
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
                <pre className="min-w-full whitespace-pre px-3 py-2 text-text-primary">{state.displayBody}</pre>
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
                <div key={idx} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 font-mono text-[13px] text-text-primary break-all">
                  {v}
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
          onClick={() => setters.setCompareMode((v: boolean) => !v)}
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