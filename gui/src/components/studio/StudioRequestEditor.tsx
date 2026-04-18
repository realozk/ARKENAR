import React, { useState, useEffect } from "react";
import {
  PlusIcon, TrashIcon, BoltIcon, ArrowRightIcon, KeyIcon,
} from "../icons";
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

// Shared small chip button (matches mockup SmallChip)
function SmallChip({ label, accent, onClick, icon }: {
  label: string; accent?: boolean; onClick?: () => void; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="h-6 px-2 border border-[color:var(--color-border-subtle)] rounded-sm font-mono text-[10.5px] flex items-center gap-1 hover:border-[color:var(--color-accent)] transition-colors"
      style={accent
        ? { color: "var(--color-accent-hover, var(--color-accent))", borderColor: "rgba(249,115,22,0.3)" }
        : { color: "var(--color-text-muted)" }
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// Shared inline checkbox for params toggle
function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="w-3 h-3 rounded-[2px] border flex items-center justify-center shrink-0 transition-colors"
      style={checked
        ? { background: "var(--color-accent)", borderColor: "var(--color-accent)" }
        : { borderColor: "var(--color-border-subtle)", background: "transparent" }
      }
    >
      {checked && (
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M1 4l2 2 4-4" />
        </svg>
      )}
    </button>
  );
}

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

  // Tab badge helper
  const getTabBadge = (tabId: RequestTab): React.ReactNode => {
    if (tabId === "params" && queryParams.length > 0) {
      return <span className="px-1 text-[9.5px] rounded-sm ml-1" style={{ background: "var(--color-bg-panel)", color: "var(--color-text-ghost)" }}>{queryParams.filter(p => p.enabled).length}</span>;
    }
    if (tabId === "headers" && headerRows.filter(h => h.k).length > 0) {
      return <span className="px-1 text-[9.5px] rounded-sm ml-1" style={{ background: "var(--color-bg-panel)", color: "var(--color-text-ghost)" }}>{headerRows.filter(h => h.k).length}</span>;
    }
    if (tabId === "env" && envVars.length > 0) {
      return <span className="px-1 text-[9.5px] rounded-sm ml-1" style={{ background: "var(--color-bg-panel)", color: "var(--color-text-ghost)" }}>{envVars.length}</span>;
    }
    if (tabId === "body") {
      return <span className="px-1 text-[9.5px] rounded-sm ml-1" style={{ background: "var(--color-bg-panel)", color: "var(--color-text-ghost)" }}>raw</span>;
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full flex-1 min-w-0" style={{ background: "var(--color-bg-root)" }}>

      {/* PANEL HEADER */}
      <div
        className="h-7 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center justify-between px-2 font-mono text-[10px] tracking-[0.18em] text-[color:var(--color-text-muted)]"
        style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
          <span className="uppercase">REQUEST</span>
        </div>
      </div>

      {/* SUB-TABS */}
      <div
        className="h-7 shrink-0 border-b border-[color:var(--color-border-subtle)] flex items-center px-1 font-mono text-[10.5px] tracking-[0.14em]"
        style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
      >
        {REQUEST_TABS.map(t => {
          const active = requestTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className="relative h-7 px-3 flex items-center gap-0.5 transition-colors"
              style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
            >
              <span>{t.label.toUpperCase()}</span>
              {getTabBadge(t.id)}
              {active && (
                <span
                  className="absolute left-2 right-2 -bottom-px h-[1px]"
                  style={{ background: "var(--color-accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* TAB PANELS */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0" style={{ background: "var(--color-bg-root)" }}>

        {/* HEADERS */}
        {requestTab === "headers" && (
          <div className="flex-1 min-h-0 overflow-auto" style={{ background: "var(--color-bg-root)" }}>
            <table className="w-full font-mono text-[11.5px] border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}>
                <tr className="text-[9.5px] uppercase tracking-wider text-[color:var(--color-text-muted)] text-left">
                  <th className="py-1 px-1 font-normal border-b border-[color:var(--color-border-subtle)] w-[40%]">key</th>
                  <th className="py-1 px-2 font-normal border-b border-[color:var(--color-border-subtle)]">value</th>
                  <th className="w-6 py-1 font-normal border-b border-[color:var(--color-border-subtle)]" />
                </tr>
              </thead>
              <tbody>
                {headerRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-bg-panel)] group"
                  >
                    <td className="px-2 py-0.5">
                      <input
                        type="text"
                        placeholder="Header name"
                        value={r.k}
                        onChange={e => updateHeaderRow(r.id, "k", e.target.value)}
                        className="w-full bg-transparent outline-none placeholder:text-[color:var(--color-text-ghost)]"
                        style={{ color: "#fdba74" }}
                      />
                    </td>
                    <td className="px-2 py-0.5">
                      <input
                        type="text"
                        placeholder="Value"
                        value={r.v}
                        onChange={e => updateHeaderRow(r.id, "v", e.target.value)}
                        className="w-full bg-transparent text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-ghost)] outline-none"
                      />
                    </td>
                    <td className="pr-1 py-0.5">
                      <button
                        onClick={() => deleteHeaderRow(r.id)}
                        className="w-4 h-4 opacity-0 group-hover:opacity-100 text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-status-critical)] flex items-center justify-center transition-all"
                        title="Remove Header"
                      >
                        <TrashIcon size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="p-1.5">
                    <button
                      onClick={addHeaderRow}
                      className="h-5 px-1.5 flex items-center gap-1 text-[10.5px] text-[color:var(--color-text-muted)] hover:text-[color:var(--color-accent-hover,var(--color-accent))] transition-colors font-mono"
                    >
                      <PlusIcon size={9} />
                      <span>add row</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* BODY */}
        {requestTab === "body" && (
          <textarea
            ref={bodyRef as React.RefObject<HTMLTextAreaElement>}
            placeholder={isBodyDisabled ? `Body not available for ${method} requests` : '{"key": "value"}'}
            value={body}
            onChange={e => onBodyChange(e.target.value)}
            disabled={isBodyDisabled}
            spellCheck={false}
            className={`flex-1 w-full resize-none bg-transparent border-none outline-none font-mono text-[11.5px] text-[color:var(--color-text-primary)] p-3 leading-relaxed placeholder:text-[color:var(--color-text-ghost)] ${isBodyDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          />
        )}

        {/* PARAMS */}
        {requestTab === "params" && (
          <div className="flex-1 min-h-0 overflow-auto" style={{ background: "var(--color-bg-root)" }}>
            <table className="w-full font-mono text-[11.5px] border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}>
                <tr className="text-[9.5px] uppercase tracking-wider text-[color:var(--color-text-muted)] text-left">
                  <th className="w-6 py-1 px-1 font-normal border-b border-[color:var(--color-border-subtle)]" />
                  <th className="py-1 px-2 font-normal border-b border-[color:var(--color-border-subtle)] w-[40%]">key</th>
                  <th className="py-1 px-2 font-normal border-b border-[color:var(--color-border-subtle)]">value</th>
                  <th className="w-6 py-1 font-normal border-b border-[color:var(--color-border-subtle)]" />
                </tr>
              </thead>
              <tbody>
                {queryParams.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-bg-panel)] group"
                  >
                    <td className="pl-1.5 py-0.5">
                      <Checkbox checked={p.enabled} onChange={() => toggleParam(p.id)} />
                    </td>
                    <td className="px-2 py-0.5">
                      <input
                        type="text"
                        placeholder="param"
                        value={p.key}
                        onChange={e => updateParam(p.id, "key", e.target.value)}
                        className={`w-full bg-transparent outline-none placeholder:text-[color:var(--color-text-ghost)] ${!p.enabled ? "opacity-50" : ""}`}
                        style={{ color: "#fdba74" }}
                      />
                    </td>
                    <td className="px-2 py-0.5">
                      <input
                        type="text"
                        placeholder="value"
                        value={p.value}
                        onChange={e => updateParam(p.id, "value", e.target.value)}
                        className={`w-full bg-transparent text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-ghost)] outline-none ${!p.enabled ? "opacity-50" : ""}`}
                      />
                    </td>
                    <td className="pr-1 py-0.5">
                      <button
                        onClick={() => deleteParam(p.id)}
                        className="w-4 h-4 opacity-0 group-hover:opacity-100 text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-status-critical)] flex items-center justify-center transition-all"
                        title="Remove Parameter"
                      >
                        <TrashIcon size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="p-1.5">
                    <button
                      onClick={addParam}
                      className="h-5 px-1.5 flex items-center gap-1 text-[10.5px] text-[color:var(--color-text-muted)] hover:text-[color:var(--color-accent-hover,var(--color-accent))] transition-colors font-mono"
                    >
                      <PlusIcon size={9} />
                      <span>add row</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ENV VARS */}
        {requestTab === "env" && (
          <div className="flex-1 min-h-0 overflow-auto" style={{ background: "var(--color-bg-root)" }}>
            <table className="w-full font-mono text-[11.5px] border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}>
                <tr className="text-[9.5px] uppercase tracking-wider text-[color:var(--color-text-muted)] text-left">
                  <th className="py-1 px-2 font-normal border-b border-[color:var(--color-border-subtle)] w-[40%]">variable</th>
                  <th className="py-1 px-2 font-normal border-b border-[color:var(--color-border-subtle)]">value</th>
                  <th className="w-6 py-1 font-normal border-b border-[color:var(--color-border-subtle)]" />
                </tr>
              </thead>
              <tbody>
                {envVars.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-bg-panel)] group"
                  >
                    <td className="px-2 py-0.5">
                      <input
                        type="text"
                        placeholder="MY_VAR"
                        value={v.key}
                        onChange={e => updateEnvVar(v.id, "key", e.target.value)}
                        className="w-full bg-transparent outline-none placeholder:text-[color:var(--color-text-ghost)]"
                        style={{ color: "var(--color-status-warning)" }}
                      />
                    </td>
                    <td className="px-2 py-0.5">
                      <input
                        type="text"
                        placeholder="Value"
                        value={v.value}
                        onChange={e => updateEnvVar(v.id, "value", e.target.value)}
                        className="w-full bg-transparent text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-ghost)] outline-none"
                      />
                    </td>
                    <td className="pr-1 py-0.5">
                      <button
                        onClick={() => deleteEnvVar(v.id)}
                        className="w-4 h-4 opacity-0 group-hover:opacity-100 text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-status-critical)] flex items-center justify-center transition-all"
                        title="Remove Variable"
                      >
                        <TrashIcon size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="p-1.5">
                    <button
                      onClick={addEnvVar}
                      className="h-5 px-1.5 flex items-center gap-1 text-[10.5px] text-[color:var(--color-text-muted)] hover:text-[color:var(--color-accent-hover,var(--color-accent))] transition-colors font-mono"
                    >
                      <PlusIcon size={9} />
                      <span>add row</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="px-3 py-2 text-center text-[10px] text-[color:var(--color-text-ghost)] font-mono border-t border-[color:var(--color-border-subtle)]">
              Use {"{{VAR}}"} in URL, Headers, or Body for injection.
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM ACTION ROW */}
      <div
        className="h-8 shrink-0 border-t border-[color:var(--color-border-subtle)] flex items-center justify-between px-2"
        style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
      >
        <div className="flex items-center gap-1">
          <SmallChip
            label="Smart Login"
            onClick={onSmartLogin}
            icon={<KeyIcon size={9} />}
          />
          <SmallChip
            label="Quick Fuzz"
            accent
            onClick={onQuickFuzz}
            icon={<BoltIcon size={9} />}
          />
          {onSendToBasic && (
            <SmallChip
              label="Send to Basic"
              onClick={() => onSendToBasic(url, headersInput)}
              icon={<ArrowRightIcon size={9} />}
            />
          )}
        </div>
        <div className="font-mono text-[9.5px] text-[color:var(--color-text-muted)]">
          Body · {bodySize}B
        </div>
      </div>
    </div>
  );
}
