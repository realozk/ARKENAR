import React, { useState } from "react";
import { LogIn, Zap, ArrowRight, Plus, X } from "lucide-react";
import type {
  RequestTab, QueryParam, HttpMethod,
} from "./useStudio";
import type { EnvVar } from "../../types";
import { REQUEST_TABS, safeBase64Encode, safeBase64Decode } from "./useStudio";

const SC: React.CSSProperties = { scrollbarWidth: "thin", scrollbarColor: "#333 #0d0d0d" };

const C = {
  root: { flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden", minWidth: 0, background: "#111111" },
  tabBar: { display: "flex", alignItems: "center", gap: 0, borderBottom: "1px solid #2a2a2a", background: "#141414", flexShrink: 0 },
  tab: (active: boolean): React.CSSProperties => ({
    padding: "7px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1,
    textTransform: "uppercase", fontFamily: "monospace",
    color: active ? "#e0e0e0" : "#666666",
    background: "transparent", border: "none",
    borderBottom: `2px solid ${active ? "#ff6b35" : "transparent"}`,
    cursor: "pointer", transition: "color 0.1s",
    marginBottom: -1,
  }),
  editorArea: { flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" as const },
  textarea: { flex: 1, minHeight: 0, width: "100%", background: "#0d0d0d", border: "none", borderTop: "1px solid #2a2a2a", padding: "10px 12px", fontSize: 12, fontFamily: "monospace", color: "#e0e0e0", outline: "none", resize: "none" as const, lineHeight: 1.6, overflowY: "auto" as const },
  paramsWrap: { flex: 1, minHeight: 0, overflowY: "auto" as const, background: "#0d0d0d", padding: 0 },
  paramHeader: { display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 0, padding: "6px 12px", background: "#141414", borderBottom: "1px solid #2a2a2a", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, color: "#666666" },
  paramRow: { display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 0, borderBottom: "1px solid #1a1a1a", alignItems: "center" },
  paramInput: { background: "transparent", border: "none", borderRight: "1px solid #1a1a1a", padding: "5px 10px", fontSize: 12, fontFamily: "monospace", color: "#e0e0e0", outline: "none", width: "100%" },
  paramCheck: { padding: "0 10px", cursor: "pointer", color: "#666" },
  paramDel: { background: "transparent", border: "none", cursor: "pointer", padding: "0 10px", color: "#444", fontSize: 16 },
  addParamBtn: { display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "transparent", border: "none", cursor: "pointer", color: "#666666", fontSize: 11, fontFamily: "monospace", borderTop: "1px solid #1a1a1a", width: "100%" },
  actionRow: { display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid #2a2a2a", background: "#141414", flexShrink: 0, flexWrap: "wrap" as const },
  actionBtn: { display: "flex", alignItems: "center", gap: 5, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, padding: "5px 12px", fontSize: 11, color: "#aaaaaa", cursor: "pointer", fontFamily: "monospace", whiteSpace: "nowrap" as const },
  utilBar: { display: "flex", gap: 6, padding: "6px 12px", borderTop: "1px solid #2a2a2a", background: "#0d0d0d", flexShrink: 0, flexWrap: "wrap" as const },
  utilBtn: { display: "flex", alignItems: "center", gap: 4, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 3, padding: "3px 8px", fontSize: 10, color: "#888888", cursor: "pointer", fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase" as const },
  utilSep: { width: 1, background: "#2a2a2a", margin: "0 2px", alignSelf: "stretch" as const },
  envScroll: { flex: 1, overflowY: "auto" as const, padding: "4px 0", background: "#0d0d0d" },
  envItem: { display: "flex", alignItems: "center", gap: 0, padding: "0 12px", height: 32, borderBottom: "1px solid #1a1a1a" },
  envKey: { fontSize: 11, fontFamily: "monospace", color: "#ff6b35", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  envEq: { fontSize: 11, color: "#444444", margin: "0 4px", fontFamily: "monospace" },
  envVal: { fontSize: 11, fontFamily: "monospace", color: "#aaaaaa", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  envDel: { background: "transparent", border: "none", cursor: "pointer", color: "#444", padding: "2px 4px", flexShrink: 0 },
  addVarRow: { display: "flex", gap: 4, padding: "6px 12px", borderBottom: "1px solid #2a2a2a", background: "#111111" },
  addVarInput: { flex: 1, background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 3, padding: "4px 6px", fontSize: 11, fontFamily: "monospace", color: "#e0e0e0", outline: "none", minWidth: 0 },
  addVarBtn: { background: "#ff6b35", border: "none", borderRadius: 3, padding: "4px 8px", fontSize: 10, fontWeight: 700, color: "#000", cursor: "pointer" },
  empty: { padding: "16px 12px", fontSize: 11, color: "#444444", fontFamily: "monospace", textAlign: "center" as const },
};

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

export default function StudioRequestEditor({
  requestTab, headersInput, body, queryParams, isBodyDisabled, method,
  headersRef, bodyRef, onTabChange, onHeadersChange, onBodyChange,
  onQueryParamsChange, applyTextMutation, onSmartLogin, onQuickFuzz,
  onSendToBasic, url, envVars, onEnvVarsChange,
}: StudioRequestEditorProps) {
  const addParam = () => {
    onQueryParamsChange([...queryParams, { id: crypto.randomUUID(), key: "", value: "", enabled: true }]);
  };

  const updateParam = (id: string, field: "key" | "value", val: string) => {
    onQueryParamsChange(queryParams.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const toggleParam = (id: string) => {
    onQueryParamsChange(queryParams.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  };

  const deleteParam = (id: string) => {
    onQueryParamsChange(queryParams.filter(p => p.id !== id));
  };

  const mutate = (fn: (v: string) => string) => {
    applyTextMutation(fn);
  };

  const [addingVar, setAddingVar] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const handleAddVar = () => {
    if (!newKey.trim()) return;
    const updated = [...envVars, { id: crypto.randomUUID(), key: newKey.trim(), value: newVal }];
    onEnvVarsChange(updated);
    localStorage.setItem("arkenar-env-vars", JSON.stringify(updated));
    setNewKey(""); setNewVal(""); setAddingVar(false);
  };

  const handleDeleteVar = (id: string) => {
    const updated = envVars.filter(v => v.id !== id);
    onEnvVarsChange(updated);
    localStorage.setItem("arkenar-env-vars", JSON.stringify(updated));
  };

  return (
    <div style={C.root}>
      <div style={C.tabBar}>
        {REQUEST_TABS.map(t => (
          <button key={t.id} style={C.tab(requestTab === t.id)} onClick={() => onTabChange(t.id)}>
            {t.label}
            {t.id === "params" && queryParams.length > 0 && (
              <span style={{ marginLeft: 5, fontSize: 10, background: "rgba(255,107,53,0.2)", color: "#ff6b35", padding: "0 5px", borderRadius: 8 }}>
                {queryParams.filter(p => p.enabled).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={C.editorArea}>
        {requestTab === "headers" && (
          <textarea
            ref={headersRef as React.RefObject<HTMLTextAreaElement>}
            style={{ ...C.textarea, ...SC }}
            placeholder={"Content-Type: application/json\nAuthorization: Bearer token\nX-Custom-Header: value"}
            value={headersInput}
            onChange={e => onHeadersChange(e.target.value)}
            spellCheck={false}
          />
        )}

        {requestTab === "body" && (
          <textarea
            ref={bodyRef as React.RefObject<HTMLTextAreaElement>}
            style={{ ...C.textarea, ...SC, opacity: isBodyDisabled ? 0.4 : 1 }}
            placeholder={isBodyDisabled ? `Body not available for ${method} requests` : '{"key": "value"}'}
            value={body}
            onChange={e => onBodyChange(e.target.value)}
            disabled={isBodyDisabled}
            spellCheck={false}
          />
        )}

        {requestTab === "params" && (
          <div style={{ ...C.paramsWrap, ...SC }}>
            <div style={C.paramHeader}>
              <span>Key</span>
              <span>Value</span>
              <span style={{ paddingLeft: 10 }}>On</span>
              <span />
            </div>
            {queryParams.map(p => (
              <div key={p.id} style={C.paramRow}>
                <input
                  style={{ ...C.paramInput, opacity: p.enabled ? 1 : 0.5 }}
                  placeholder="key"
                  value={p.key}
                  onChange={e => updateParam(p.id, "key", e.target.value)}
                />
                <input
                  style={{ ...C.paramInput, opacity: p.enabled ? 1 : 0.5 }}
                  placeholder="value"
                  value={p.value}
                  onChange={e => updateParam(p.id, "value", e.target.value)}
                />
                <div style={C.paramCheck} onClick={() => toggleParam(p.id)}>
                  <div style={{ width: 14, height: 14, border: `1px solid ${p.enabled ? "#ff6b35" : "#444"}`, borderRadius: 2, background: p.enabled ? "#ff6b35" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {p.enabled && <span style={{ fontSize: 10, color: "#000", lineHeight: 1 }}>✓</span>}
                  </div>
                </div>
                <button style={C.paramDel} onClick={() => deleteParam(p.id)}>×</button>
              </div>
            ))}
            <button style={C.addParamBtn} onClick={addParam}>+ Add Parameter</button>
          </div>
        )}

        {requestTab === "env" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "#0d0d0d" }}>
            <div style={{ padding: "6px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "flex-end" }}>
              <button 
                onClick={() => setAddingVar(v => !v)}
                style={{ ...C.utilBtn, background: "transparent", border: "1px solid #333", color: "#aaa" }}
              >
                <Plus size={10} /> Add Variable
              </button>
            </div>
            {addingVar && (
              <div style={C.addVarRow}>
                <input
                  style={C.addVarInput}
                  placeholder="KEY (e.g. JWT_TOKEN)"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") handleAddVar(); if (e.key === "Escape") setAddingVar(false); }}
                />
                <input
                  style={{ ...C.addVarInput, borderColor: "#3a3a3a" }}
                  placeholder="value"
                  value={newVal}
                  onChange={e => setNewVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddVar(); }}
                />
                <button style={C.addVarBtn} onClick={handleAddVar}>✓</button>
              </div>
            )}
            {envVars.length === 0 && !addingVar ? (
              <div style={C.empty}>No variables defined. Add one to use {"{{VAR}}"} injection.</div>
            ) : (
              <div style={{ ...C.envScroll, ...SC }}>
                {envVars.map(v => (
                  <div key={v.id} style={C.envItem}>
                    <span style={C.envKey} title={v.key}>{v.key}</span>
                    <span style={C.envEq}>=</span>
                    <span style={C.envVal} title={v.value}>{v.value}</span>
                    <button style={C.envDel} onClick={() => handleDeleteVar(v.id)} title="Delete">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={C.actionRow}>
        <button style={C.actionBtn} onClick={onSmartLogin}>
          <LogIn size={12} />
          Smart Login
        </button>
        <button style={C.actionBtn} onClick={onQuickFuzz}>
          <Zap size={12} />
          Quick Fuzz
        </button>
        {onSendToBasic && (
          <button style={C.actionBtn} onClick={() => onSendToBasic(url, headersInput)}>
            <ArrowRight size={12} />
            Send to Basic
          </button>
        )}
      </div>

      <div style={C.utilBar}>
        <button style={C.utilBtn} onClick={() => mutate(safeBase64Encode)}>B64 Enc</button>
        <button style={C.utilBtn} onClick={() => mutate(safeBase64Decode)}>B64 Dec</button>
        <div style={C.utilSep} />
        <button style={C.utilBtn} onClick={() => mutate(encodeURIComponent)}>URL Enc</button>
        <button style={C.utilBtn} onClick={() => mutate(decodeURIComponent)}>URL Dec</button>
        <div style={C.utilSep} />
        <button style={C.utilBtn} onClick={() => mutate(s => s.toUpperCase())}>Upper</button>
        <button style={C.utilBtn} onClick={() => mutate(s => s.toLowerCase())}>Lower</button>
      </div>
    </div>
  );
}
