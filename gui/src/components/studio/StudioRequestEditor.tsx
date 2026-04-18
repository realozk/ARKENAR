import React, { useState, useEffect } from "react";
import { Zap, ArrowRight, Plus, KeyRound, Trash2 } from "lucide-react";
import type {
  RequestTab, QueryParam, HttpMethod,
} from "./useStudio";
import type { EnvVar } from "../../types";
import { REQUEST_TABS } from "./useStudio";

interface StudioRequestEditorProps {
  requestTab: RequestTab;
  headersInput: string;
  body: string;
  queryParams: QueryParam[];
  isBodyDisabled: boolean;
  method: HttpMethod;
  headersRef: React.RefObject<HTMLTextAreaElement | null>;
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
  onTabChange: (t: RequestTab) => void;
  onHeadersChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onQueryParamsChange: (params: QueryParam[]) => void;
  applyTextMutation: (fn: (v: string) => string) => void;
  onSmartLogin: () => void;
  onQuickFuzz: () => void;
  onSendToBasic?: (url: string, headers: string) => void;
  url: string;
  envVars: EnvVar[];
  onEnvVarsChange: (vars: EnvVar[]) => void;
}

const parseHeaders = (raw: string) => {
  return raw.split('\n').filter(l => l.trim()).map(line => {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      return { id: crypto.randomUUID(), k: line.slice(0, idx).trim(), v: line.slice(idx + 1).trim() };
    }
    return { id: crypto.randomUUID(), k: line.trim(), v: "" };
  });
};

export default function StudioRequestEditor({
  requestTab, headersInput, body, queryParams, isBodyDisabled, method,
  bodyRef, onTabChange, onHeadersChange, onBodyChange,
  onQueryParamsChange, onSmartLogin, onQuickFuzz,
  onSendToBasic, url, envVars, onEnvVarsChange,
}: StudioRequestEditorProps) {

  // Headers parsing logic to support the new Row-based editor
  const [headerRows, setHeaderRows] = useState(() => parseHeaders(headersInput).map((h) => ({ ...h, id: h.id as `${string}-${string}-${string}-${string}-${string}` })));

  useEffect(() => {
    const currentStr = headerRows.filter(h => h.k).map(h => `${h.k}: ${h.v}`).join('\n');
    if (headersInput !== currentStr && headersInput.trim() !== currentStr.trim()) {
      setHeaderRows(parseHeaders(headersInput).map((h) => ({ ...h, id: h.id as `${string}-${string}-${string}-${string}-${string}` })));
    }
  }, [headersInput]);

  const updateHeaderRows = (newRows: { id: string; k: string; v: string }[]) => {
    setHeaderRows(newRows.map((h) => ({ ...h, id: h.id as `${string}-${string}-${string}-${string}-${string}` })));
    onHeadersChange(newRows.filter(r => r.k.trim()).map(r => `${r.k}: ${r.v}`).join('\n'));
  };

  const addHeaderRow = () => updateHeaderRows([...headerRows, { id: crypto.randomUUID(), k: "", v: "" }]);
  const updateHeaderRow = (id: string, field: "k" | "v", val: string) => updateHeaderRows(headerRows.map(r => r.id === id ? { ...r, [field]: val } : r));
  const deleteHeaderRow = (id: string) => updateHeaderRows(headerRows.filter(r => r.id !== id));

  // Params
  const addParam = () => onQueryParamsChange([...queryParams, { id: crypto.randomUUID(), key: "", value: "", enabled: true }]);
  const updateParam = (id: string, field: "key" | "value", val: string) => onQueryParamsChange(queryParams.map(p => p.id === id ? { ...p, [field]: val } : p));
  const toggleParam = (id: string) => onQueryParamsChange(queryParams.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  const deleteParam = (id: string) => onQueryParamsChange(queryParams.filter(p => p.id !== id));



  // Env Vars
  const addEnvVar = () => onEnvVarsChange([...envVars, { id: crypto.randomUUID(), key: "", value: "" }]);
  const updateEnvVar = (id: string, field: "key" | "value", val: string) => {
    const updated = envVars.map(v => v.id === id ? { ...v, [field]: val } : v);
    onEnvVarsChange(updated);
    localStorage.setItem("arkenar-env-vars", JSON.stringify(updated));
  };
  const deleteEnvVar = (id: string) => {
    const updated = envVars.filter(v => v.id !== id);
    onEnvVarsChange(updated);
    localStorage.setItem("arkenar-env-vars", JSON.stringify(updated));
  };

  const bodySize = new Blob([body]).size;

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-bg-root">

      {/* TAB BAR */}
      <div className="flex items-end gap-[2px] px-3 pt-2 bg-bg-panel border-b border-border-subtle shrink-0">
        {REQUEST_TABS.map(t => {
          const active = requestTab === t.id;
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
              {t.id === "params" && queryParams.length > 0 && (
                <span className="ml-1.5 px-1.5 rounded-full bg-accent10 text-accent text-[10px] py-0.5">
                  {queryParams.filter(p => p.enabled).length}
                </span>
              )}
            </button>
          );
        })}
        <div className="flex-1" />
      </div>

      {/* TAB PANELS */}
      <div className="flex-1 overflow-y-auto bg-bg-card flex flex-col min-h-0">

        {requestTab === "headers" && (
          <div className="p-3 gap-2 flex flex-col">
            {headerRows.map(r => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_26px] gap-2 items-center">
                <input
                  type="text"
                  placeholder="Key (e.g. Content-Type)"
                  value={r.k}
                  onChange={e => updateHeaderRow(r.id, "k", e.target.value)}
                  className="h-7 w-full bg-bg-input border border-border-subtle rounded px-2 font-mono text-xs text-text-primary focus:border-accent focus:outline-none transition-colors placeholder:text-text-ghost"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={r.v}
                  onChange={e => updateHeaderRow(r.id, "v", e.target.value)}
                  className="h-7 w-full bg-bg-input border border-border-subtle rounded px-2 font-mono text-xs text-text-primary focus:border-accent focus:outline-none transition-colors placeholder:text-text-ghost"
                />
                <button
                  onClick={() => deleteHeaderRow(r.id)}
                  className="w-[26px] h-[26px] flex items-center justify-center rounded text-text-ghost hover:text-status-critical hover:bg-status-critical10 transition-all duration-150"
                  title="Remove Header"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={addHeaderRow}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border-subtle text-text-ghost text-xs hover:text-accent-text hover:border-accent transition-all duration-150 mt-1 justify-center"
            >
              <Plus size={14} /> Add header
            </button>
          </div>
        )}

        {requestTab === "body" && (
          <textarea
            ref={bodyRef as React.RefObject<HTMLTextAreaElement>}
            placeholder={isBodyDisabled ? `Body not available for ${method} requests` : '{"key": "value"}'}
            value={body}
            onChange={e => onBodyChange(e.target.value)}
            disabled={isBodyDisabled}
            spellCheck={false}
            className={`flex-1 w-full resize-none bg-transparent border-none outline-none font-mono text-xs text-text-primary p-4 leading-7 placeholder:text-text-ghost ${isBodyDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          />
        )}

        {requestTab === "params" && (
          <div className="p-3 gap-2 flex flex-col">
            {queryParams.length > 0 && (
              <div className="grid grid-cols-[1fr_1fr_26px_26px] gap-2 items-center px-2 mb-1">
                <span className="text-[10px] font-bold uppercase text-text-ghost tracking-wider">Key</span>
                <span className="text-[10px] font-bold uppercase text-text-ghost tracking-wider">Value</span>
                <span className="text-[10px] font-bold uppercase text-text-ghost tracking-wider text-center">On</span>
                <span />
              </div>
            )}
            {queryParams.map(p => (
              <div key={p.id} className="grid grid-cols-[1fr_1fr_26px_26px] gap-2 items-center">
                <input
                  type="text"
                  placeholder="key"
                  value={p.key}
                  onChange={e => updateParam(p.id, "key", e.target.value)}
                  className={`h-7 w-full bg-bg-input border border-border-subtle rounded px-2 font-mono text-xs text-text-primary focus:border-accent focus:outline-none transition-colors placeholder:text-text-ghost ${!p.enabled && 'opacity-50'}`}
                />
                <input
                  type="text"
                  placeholder="value"
                  value={p.value}
                  onChange={e => updateParam(p.id, "value", e.target.value)}
                  className={`h-7 w-full bg-bg-input border border-border-subtle rounded px-2 font-mono text-xs text-text-primary focus:border-accent focus:outline-none transition-colors placeholder:text-text-ghost ${!p.enabled && 'opacity-50'}`}
                />
                <button
                  onClick={() => toggleParam(p.id)}
                  className="w-[26px] h-[26px] flex items-center justify-center rounded transition-all duration-150"
                  title="Toggle Parameter"
                >
                  <div className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center border ${p.enabled ? 'bg-accent border-accent text-black' : 'border-text-ghost'}`}>
                    {p.enabled && <Zap size={10} fill="currentColor" />}
                  </div>
                </button>
                <button
                  onClick={() => deleteParam(p.id)}
                  className="w-[26px] h-[26px] flex items-center justify-center rounded text-text-ghost hover:text-status-critical hover:bg-status-critical10 transition-all duration-150"
                  title="Remove Parameter"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={addParam}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border-subtle text-text-ghost text-xs hover:text-accent-text hover:border-accent transition-all duration-150 mt-1 justify-center"
            >
              <Plus size={14} /> Add parameter
            </button>
          </div>
        )}

        {requestTab === "env" && (
          <div className="p-3 gap-2 flex flex-col">
            {envVars.length > 0 && (
              <div className="grid grid-cols-[1fr_1fr_26px] gap-2 items-center px-2 mb-1">
                <span className="text-[10px] font-bold uppercase text-text-ghost tracking-wider">Variable</span>
                <span className="text-[10px] font-bold uppercase text-text-ghost tracking-wider">Value</span>
                <span />
              </div>
            )}
            {envVars.map(v => (
              <div key={v.id} className="grid grid-cols-[1fr_1fr_26px] gap-2 items-center">
                <input
                  type="text"
                  placeholder="KEY (e.g. JWT_TOKEN)"
                  value={v.key}
                  onChange={e => updateEnvVar(v.id, "key", e.target.value)}
                  className="h-7 w-full bg-bg-input border border-border-subtle rounded px-2 font-mono text-xs text-text-primary focus:border-accent focus:outline-none transition-colors placeholder:text-text-ghost text-status-warning"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={v.value}
                  onChange={e => updateEnvVar(v.id, "value", e.target.value)}
                  className="h-7 w-full bg-bg-input border border-border-subtle rounded px-2 font-mono text-xs text-text-primary focus:border-accent focus:outline-none transition-colors placeholder:text-text-ghost"
                />
                <button
                  onClick={() => deleteEnvVar(v.id)}
                  className="w-[26px] h-[26px] flex items-center justify-center rounded text-text-ghost hover:text-status-critical hover:bg-status-critical10 transition-all duration-150"
                  title="Remove Variable"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={addEnvVar}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border-subtle text-text-ghost text-xs hover:text-accent-text hover:border-accent transition-all duration-150 mt-1 justify-center"
            >
              <Plus size={14} /> Add variable
            </button>
            <div className="mt-2 text-center text-[10px] text-text-ghost font-mono">
              Use {"{{VAR}}"} in URL, Headers, or Body for injection.
            </div>
          </div>
        )}

      </div>

      {/* BOTTOM TOOLBAR */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border-subtle bg-bg-panel shrink-0 flex-wrap">
        <button
          onClick={onSmartLogin}
          className="flex items-center gap-[5px] px-3 py-1 rounded-md border border-border-subtle bg-bg-card text-xs font-semibold text-text-muted hover:text-accent-text hover:bg-accent10 hover:border-accent transition-all duration-150"
        >
          <KeyRound size={12} />
          Smart Login
        </button>
        <button
          onClick={onQuickFuzz}
          className="flex items-center gap-[5px] px-3 py-1 rounded-md border border-border-subtle bg-bg-card text-xs font-semibold text-status-warning hover:bg-status-warning20 hover:border-status-warning/30 transition-all duration-150"
        >
          <Zap size={12} />
          Quick Fuzz
        </button>
        {onSendToBasic && (
          <button
            onClick={() => onSendToBasic(url, headersInput)}
            className="flex items-center gap-[5px] px-3 py-1 rounded-md border border-border-subtle bg-bg-card text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all duration-150"
          >
            <ArrowRight size={12} />
            Send to Basic
          </button>
        )}

        <div className="flex-1" />

        <span className="font-mono text-[10px] text-text-ghost">
          Body · {bodySize}B
        </span>
      </div>

    </div>
  );
}
