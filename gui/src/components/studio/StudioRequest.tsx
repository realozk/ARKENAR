import React from "react";
import { ChevronDown, Plus, Trash, Check, FileCode, LogIn, Share2, Binary, Link2, Braces, RefreshCw, Send, X } from "lucide-react";
import { METHODS, REQUEST_TABS, HttpMethod, QueryParam, RequestTab } from "./useStudio";

function ActionButton({ icon: Icon, title, label, onClick }: { icon: React.ElementType; title: string; label: string; onClick: () => void; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
    >
      <Icon size={13} strokeWidth={2.3} />
      <span>{label}</span>
    </button>
  );
}

export interface StudioRequestProps {
  state: {
    method: HttpMethod;
    url: string;
    headersInput: string;
    body: string;
    queryParams: QueryParam[];
    showMethodMenu: boolean;
    isLoading: boolean;
    requestTab: RequestTab;
    isBodyDisabled: boolean;
  };
  setters: {
    setMethod: (m: HttpMethod) => void;
    setUrl: (u: string) => void;
    setShowMethodMenu: (s: boolean | ((s: boolean) => boolean)) => void;
    setRequestTab: (t: RequestTab) => void;
    setHeadersInput: (h: string) => void;
    setBody: (b: string) => void;
    setShowPocModal: (s: boolean) => void;
    setShowSmartLogin: (s: boolean) => void;
    setCompareMode: (s: boolean) => void;
  };
  handlers: {
    onSend: () => void;
    updateQueryParams: (params: QueryParam[]) => void;
    applyTextMutation: (mutator: (val: string) => string) => void;
  };
  refs: {
    headersRef: React.RefObject<HTMLTextAreaElement>;
    bodyRef: React.RefObject<HTMLTextAreaElement>;
  };
  onSendToBasic?: (url: string, headers: string) => void;
}

export function StudioRequest({ state, setters, handlers, refs, onSendToBasic }: StudioRequestProps) {
  const updateParam = (id: string, field: keyof QueryParam, val: string | boolean) => {
    handlers.updateQueryParams(state.queryParams.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const removeParam = (id: string) => {
    handlers.updateQueryParams(state.queryParams.filter((p) => p.id !== id));
  };

  const addParam = () => {
    handlers.updateQueryParams([
      ...state.queryParams,
      { id: crypto.randomUUID(), key: "", value: "", enabled: true },
    ]);
  };

  const safeBase64Encode = (input: string) => btoa(Array.from(new TextEncoder().encode(input)).map(b => String.fromCharCode(b)).join(""));
  const safeBase64Decode = (input: string) => new TextDecoder().decode(Uint8Array.from(atob(input), c => c.charCodeAt(0)));
  const toHex = (input: string) => Array.from(input).map(ch => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("");

  return (
    <section className="flex-1 flex flex-col min-w-0 h-full overflow-hidden rounded-xl border border-border-subtle bg-bg-panel p-4 animate-fade-slide-in">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setters.setShowMethodMenu(!state.showMethodMenu)}
            className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
          >
            {state.method}
            <ChevronDown size={13} strokeWidth={2.2} className="text-text-secondary" />
          </button>

          {state.showMethodMenu && (
            <div className="absolute z-20 mt-1 w-[120px] rounded-lg border border-border-subtle bg-bg-panel shadow-lg animate-fade-slide-in">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setters.setMethod(m);
                    setters.setShowMethodMenu(false);
                  }}
                  className="block w-full border-b border-border-subtle px-3 py-2 text-left text-xs font-semibold tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary last:border-b-0"
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          type="text"
          value={state.url}
          onChange={(e) => setters.setUrl(e.target.value)}
          placeholder="https://target.tld/path"
          className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/20"
          onKeyDown={(e) => { if (e.key === "Enter") handlers.onSend(); }}
        />

        <button
          type="button"
          onClick={handlers.onSend}
          disabled={state.isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-bg-root btn-glow disabled:opacity-60 transition-all duration-200"
        >
          {state.isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
          Execute
        </button>

        <button
          type="button"
          onClick={() => {
            setters.setHeadersInput("");
            setters.setBody("");
            handlers.updateQueryParams([]);
            setters.setCompareMode(false);
          }}
          className="rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={() => setters.setShowPocModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
        >
          <FileCode size={14} />
          Export PoC
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2 border-b border-border-subtle pb-3">
        {REQUEST_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setters.setRequestTab(tab.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
              state.requestTab === tab.id
                ? "bg-bg-card text-text-primary border-accent/40 ring-1 ring-accent/20"
                : "bg-bg-card text-text-muted border-border-subtle hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5">
        <button
          type="button"
          onClick={() => setters.setShowSmartLogin(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-input px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary hover:bg-accent/10 hover:text-accent-text hover:border-accent/30 transition-all duration-200"
          title="Automate CSRF-protected login and inject session cookie"
        >
          <LogIn size={12} strokeWidth={2.3} />
          Smart Login
        </button>

        <button
          type="button"
          onClick={() => onSendToBasic?.(state.url, state.headersInput)}
          disabled={!state.url.trim() || !onSendToBasic}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent/15 border border-accent/25 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-text hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          title="Copy current URL + Headers to the Basic Scanner and switch tabs"
        >
          <Share2 size={12} strokeWidth={2.3} />
          Send to Basic
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-card px-3 py-2 overflow-x-auto custom-scrollbar">
        <span className="text-[13px] font-semibold uppercase tracking-wider text-text-muted shrink-0">Utility</span>
        <ActionButton icon={Binary} title="Base64 Encode selected text" label="B64 Encode" onClick={() => handlers.applyTextMutation((v) => safeBase64Encode(v))} />
        <ActionButton icon={Binary} title="Base64 Decode selected text" label="B64 Decode" onClick={() => handlers.applyTextMutation((v) => safeBase64Decode(v))} />
        <ActionButton icon={Link2} title="URL Encode selected text" label="URL Encode" onClick={() => handlers.applyTextMutation((v) => encodeURIComponent(v))} />
        <ActionButton icon={Link2} title="URL Decode selected text" label="URL Decode" onClick={() => handlers.applyTextMutation((v) => decodeURIComponent(v))} />
        <ActionButton icon={Braces} title="Convert selected text to hexadecimal" label="→ Hex" onClick={() => handlers.applyTextMutation((v) => toHex(v))} />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {state.requestTab === "headers" && (
          <textarea
            ref={refs.headersRef as any}
            value={state.headersInput}
            onChange={(e) => setters.setHeadersInput(e.target.value)}
            placeholder={"Authorization: Bearer token\nContent-Type: application/json"}
            className="h-full w-full resize-none rounded-lg border border-border-subtle bg-bg-input p-3 font-mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none custom-scrollbar"
            spellCheck={false}
          />
        )}

        {state.requestTab === "body" && (
          <div className="relative w-full h-full">
            {state.isBodyDisabled && (
              <div className="absolute inset-0 z-10 bg-bg-root/50 backdrop-blur-[1px] flex items-center justify-center">
                <div className="bg-bg-panel border border-border-subtle px-4 py-2 rounded-lg text-sm text-text-muted shadow-lg">
                  Body is not supported for {state.method} requests
                </div>
              </div>
            )}
            <textarea
              ref={refs.bodyRef as any}
              value={state.body}
              onChange={(e) => setters.setBody(e.target.value)}
              disabled={state.isBodyDisabled}
              className={`h-full w-full resize-none rounded-lg border border-border-subtle p-3 font-mono text-[13px] placeholder:text-text-muted focus:outline-none custom-scrollbar disabled:opacity-30 ${state.isBodyDisabled ? "bg-bg-card text-text-muted" : "bg-bg-input text-text-primary"}`}
              spellCheck={false}
              placeholder='{"key": "value"}'
            />
          </div>
        )}

        {state.requestTab === "params" && (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr>
                    <th className="w-8 border-b border-border-subtle pb-2 text-center" />
                    <th className="border-b border-border-subtle pb-2 px-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">Key</th>
                    <th className="border-b border-border-subtle pb-2 px-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">Value</th>
                    <th className="w-8 border-b border-border-subtle pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {state.queryParams.map((param) => (
                    <tr key={param.id} className="group">
                      <td className="py-1 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={param.enabled}
                          onChange={(e) => updateParam(param.id, "enabled", e.target.checked)}
                          className="h-3.5 w-3.5 cursor-pointer"
                          style={{ accentColor: 'var(--color-accent)' }}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          type="text"
                          value={param.key}
                          onChange={(e) => updateParam(param.id, "key", e.target.value)}
                          placeholder="key"
                          style={{ color: 'var(--color-text-primary)' }}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 font-mono placeholder:text-text-muted hover:border-border-subtle focus:border-accent/40 focus:bg-bg-input focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          type="text"
                          value={param.value}
                          onChange={(e) => updateParam(param.id, "value", e.target.value)}
                          placeholder="value"
                          style={{ color: 'var(--color-text-primary)' }}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 font-mono placeholder:text-text-muted hover:border-border-subtle focus:border-accent/40 focus:bg-bg-input focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                        />
                      </td>
                      <td className="py-1 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => removeParam(param.id)}
                          className="rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:bg-status-critical/10 hover:text-status-critical transition-all"
                        >
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {state.queryParams.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[13px] text-text-muted">
                        No parameters yet — type <code className="rounded bg-bg-card px-1.5 py-0.5 font-mono text-xs tracking-wider">?key=value</code> in the URL bar or add one below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addParam}
              className="mt-2 text-left text-[12px] font-semibold uppercase tracking-wider text-accent hover:text-accent/70 transition-colors"
            >
              + Add Parameter
            </button>
          </div>
        )}
      </div>
    </section>
  );
}