import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, RefreshCw, Zap, KeyRound, ChevronDown, CheckCircle, Copy } from "lucide-react";
import type { StudioHistoryItem, PocTab } from "./useStudio";
import { useStudio, POC_TABS } from "./useStudio";
import StudioTopBar from "./StudioTopBar";
import StudioRequestEditor from "./StudioRequestEditor";
import StudioResponseViewer from "./StudioResponseViewer";

const SCROLLBAR_CSS = `
  .sw-scroll::-webkit-scrollbar { width: 4px; }
  .sw-scroll::-webkit-scrollbar-track { background: #0d0d0d; }
  .sw-scroll::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
  @keyframes sw-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
`;

interface AutoLoginResult { cookie_header: string; status_code: number; }

function SmartLoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (cookie: string) => void }) {
  const [loginUrl, setLoginUrl] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tokenField, setTokenField] = React.useState("");
  const [usernameField, setUsernameField] = React.useState("");
  const [passwordField, setPasswordField] = React.useState("");
  const [showAdv, setShowAdv] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!loginUrl.trim() || !username.trim() || !password) { setError("Login URL, Username, and Password are all required."); return; }
    setIsLoading(true); setError(null); setSuccessMsg(null);
    try {
      const result = await invoke<AutoLoginResult>("studio_auto_login", {
        req: { login_url: loginUrl.trim(), username: username.trim(), password, username_field: usernameField.trim() || null, password_field: passwordField.trim() || null, token_field: tokenField.trim() || null },
      });
      setSuccessMsg(`✓ Session captured (HTTP ${result.status_code}). Cookie injected.`);
      setTimeout(() => { onSuccess(result.cookie_header); onClose(); }, 900);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setIsLoading(false); }
  };

  const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" };
  const modal: React.CSSProperties = { width: "100%", maxWidth: 420, background: "#141414", border: "1px solid #2a2a2a", borderRadius: 4, fontFamily: "monospace" };
  const header: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #2a2a2a" };
  const title: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#e0e0e0" };
  const body: React.CSSProperties = { padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 };
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#666", marginBottom: 4 };
  const input: React.CSSProperties = { width: "100%", background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 4, padding: "6px 10px", fontSize: 12, color: "#e0e0e0", outline: "none", fontFamily: "monospace", boxSizing: "border-box" };
  const footer: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", borderTop: "1px solid #2a2a2a" };
  const cancelBtn: React.CSSProperties = { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, padding: "6px 14px", fontSize: 11, color: "#aaaaaa", cursor: "pointer", fontFamily: "monospace" };
  const execBtn: React.CSSProperties = { background: "#ff6b35", border: "none", borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, color: "#000", cursor: "pointer", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 };
  const advBtn: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", color: "#666", fontSize: 11, padding: 0, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 5 };
  const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
  const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={13} color="#ff6b35" />
            <span style={title}>Smart Auto-Login</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}><X size={14} /></button>
        </div>
        <div style={body}>
          <p style={{ fontSize: 11, color: "#aaaaaa", lineHeight: 1.5, margin: 0 }}>Performs GET → parse → POST handshake. CSRF tokens auto-detected.</p>
          <div><div style={label}>Login URL</div><input style={input} type="text" value={loginUrl} onChange={e => setLoginUrl(e.target.value)} placeholder="http://target/login.php" autoFocus /></div>
          <div style={grid2}>
            <div><div style={label}>Username</div><input style={input} type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" /></div>
            <div><div style={label}>Password</div><input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></div>
          </div>
          <button style={advBtn} onClick={() => setShowAdv(v => !v)}>
            <ChevronDown size={11} style={{ transform: showAdv ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }} />
            Advanced field overrides
          </button>
          {showAdv && (
            <div style={grid3}>
              {[["Username field", usernameField, setUsernameField, "username"], ["Password field", passwordField, setPasswordField, "password"], ["CSRF field", tokenField, setTokenField, "auto-detect"]].map(([lbl, val, setter, ph]) => (
                <div key={lbl as string}><div style={label}>{lbl as string}</div><input style={{ ...input, fontSize: 11 }} value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} placeholder={ph as string} /></div>
              ))}
            </div>
          )}
          {error && <div style={{ background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.3)", borderRadius: 4, padding: "8px 10px", fontSize: 11, color: "#f44336" }}>{error}</div>}
          {successMsg && <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.3)", borderRadius: 4, padding: "8px 10px", fontSize: 11, color: "#4caf50" }}><CheckCircle size={13} />{successMsg}</div>}
        </div>
        <div style={footer}>
          <button style={cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...execBtn, opacity: isLoading || !loginUrl.trim() || !username.trim() || !password ? 0.5 : 1 }} onClick={handleSubmit} disabled={isLoading || !loginUrl.trim() || !username.trim() || !password}>
            {isLoading ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound size={13} />}
            {isLoading ? "Authenticating…" : "Execute Login"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PocModal({ activePocSnippet, pocTab, pocCopied, onTabChange, onCopy, onClose }: {
  activePocSnippet: string; pocTab: PocTab; pocCopied: boolean;
  onTabChange: (t: PocTab) => void; onCopy: () => void; onClose: () => void;
}) {
  const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" };
  const modal: React.CSSProperties = { width: "100%", maxWidth: 760, background: "#141414", border: "1px solid #2a2a2a", borderRadius: 4, fontFamily: "monospace", display: "flex", flexDirection: "column", maxHeight: "80vh" };
  const header: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #2a2a2a" };
  const tabBar: React.CSSProperties = { display: "flex", gap: 6, padding: "8px 16px", borderBottom: "1px solid #2a2a2a" };
  const tabBtn = (active: boolean): React.CSSProperties => ({ background: active ? "#1a1a1a" : "transparent", border: active ? "1px solid rgba(255,107,53,0.4)" : "1px solid #2a2a2a", borderRadius: 4, padding: "4px 12px", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const, color: active ? "#e0e0e0" : "#666", cursor: "pointer" });
  const pre: React.CSSProperties = { flex: 1, overflowY: "auto", padding: 14, fontSize: 12, color: "#e0e0e0", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#0d0d0d", margin: 0, lineHeight: 1.6 };
  const footer: React.CSSProperties = { display: "flex", justifyContent: "flex-end", padding: "10px 16px", borderTop: "1px solid #2a2a2a" };
  const copyBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#ff6b35", border: "none", borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, color: "#000", cursor: "pointer" };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        <div style={header}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#e0e0e0" }}>Export PoC</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}><X size={14} /></button>
        </div>
        <div style={tabBar}>
          {POC_TABS.map(t => <button key={t.id} style={tabBtn(pocTab === t.id)} onClick={() => onTabChange(t.id)}>{t.label}</button>)}
        </div>
        <pre style={pre} className="sw-scroll">{activePocSnippet}</pre>
        <div style={footer}>
          <button style={copyBtn} onClick={onCopy}><Copy size={13} />{pocCopied ? "Copied!" : "Copy"}</button>
        </div>
      </div>
    </div>
  );
}

function FuzzModal({
  fuzzAnchor, fuzzPayloads, fuzzResults, isFuzzing, fuzzProgress,
  onPayloadsChange, onStart, onCancel,
}: {
  fuzzAnchor: { field: string; anchor: string } | null;
  fuzzPayloads: string; fuzzResults: { id: string; payload: string; status: number; responseTime: number; responseLength: number; error: string | null }[];
  isFuzzing: boolean; fuzzProgress: number;
  onPayloadsChange: (v: string) => void; onStart: () => void; onCancel: () => void;
}) {
  const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" };
  const modal: React.CSSProperties = { width: "100%", maxWidth: 760, background: "#141414", border: "1px solid #2a2a2a", borderRadius: 4, fontFamily: "monospace", padding: 16, display: "flex", flexDirection: "column", maxHeight: "88vh", gap: 12 };
  const cols: React.CSSProperties = { display: "flex", gap: 12, flex: 1, minHeight: 300 };
  const leftCol: React.CSSProperties = { width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 };
  const rightCol: React.CSSProperties = { flex: 1, display: "flex", flexDirection: "column", gap: 6 };
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, color: "#666" };
  const ta: React.CSSProperties = { flex: 1, resize: "none" as const, background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 4, padding: 8, fontSize: 12, color: "#e0e0e0", outline: "none", fontFamily: "monospace" };
  const tableHeader: React.CSSProperties = { display: "grid", gridTemplateColumns: "2fr 60px 70px 70px", gap: 0, padding: "5px 10px", background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#666" };
  const resultRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "2fr 60px 70px 70px", gap: 0, padding: "4px 10px", borderBottom: "1px solid #1a1a1a", fontSize: 11 };
  const footer: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #2a2a2a", paddingTop: 10 };

  const statusColor = (s: number) => s >= 200 && s < 300 ? "#4caf50" : s >= 300 && s < 400 ? "#2196f3" : s >= 400 && s < 500 ? "#ff9800" : "#f44336";

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={14} color="#ff6b35" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#e0e0e0" }}>Quick Fuzz</span>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}><X size={14} /></button>
        </div>
        <div style={{ fontSize: 11, color: "#aaaaaa", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, padding: "6px 10px" }}>
          Targeting <strong style={{ color: "#e0e0e0" }}>{fuzzAnchor?.field}</strong>: <code style={{ color: "#ff6b35" }}>{fuzzAnchor?.anchor}</code>
        </div>
        <div style={cols}>
          <div style={leftCol}>
            <div style={label}>Payloads (one per line)</div>
            <textarea style={ta} className="sw-scroll" value={fuzzPayloads} onChange={e => onPayloadsChange(e.target.value)} disabled={isFuzzing} placeholder={"admin\ntest\n' OR 1=1--"} spellCheck={false} />
          </div>
          <div style={rightCol}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={label}>Live Results</div>
              {isFuzzing && <span style={{ fontSize: 10, color: "#ff6b35", fontWeight: 700 }}>{fuzzProgress}%</span>}
            </div>
            <div style={{ flex: 1, border: "1px solid #2a2a2a", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={tableHeader}>
                <span>Payload</span><span>Status</span><span>Length</span><span>Time</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", background: "#0d0d0d" }} className="sw-scroll">
                {fuzzResults.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#444" }}>{isFuzzing ? "Waiting…" : "Enter payloads and click Run."}</div>
                ) : fuzzResults.map(r => (
                  <div key={r.id} style={resultRow}>
                    <span style={{ color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.payload}</span>
                    <span style={{ color: r.error ? "#f44336" : statusColor(r.status), fontWeight: 700 }}>{r.error ? "ERR" : r.status}</span>
                    <span style={{ color: "#aaaaaa" }}>{r.responseLength}</span>
                    <span style={{ color: "#666" }}>{r.responseTime}ms</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={footer}>
          <span style={{ fontSize: 11, color: "#666" }}>{isFuzzing ? "Running…" : `${fuzzResults.length} completed`}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, padding: "6px 14px", fontSize: 11, color: "#aaa", cursor: "pointer", fontFamily: "monospace" }}>{isFuzzing ? "Stop" : "Close"}</button>
            <button onClick={onStart} disabled={isFuzzing || !fuzzPayloads.trim()} style={{ display: "flex", alignItems: "center", gap: 6, background: "#ff6b35", border: "none", borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, color: "#000", cursor: "pointer", fontFamily: "monospace", opacity: isFuzzing || !fuzzPayloads.trim() ? 0.5 : 1 }}>
              {isFuzzing ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={13} />}
              {isFuzzing ? "Running…" : "Run"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudioWorkspace(props: {
  initialRequest?: Partial<import("./useStudio").StudioRequest> | null;
  onInitialRequestConsumed?: () => void;
  history: StudioHistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<StudioHistoryItem[]>>;
  selectedHistoryId: string | null;
  setSelectedHistoryId: (id: string | null) => void;
  onSendToBasic?: (url: string, headers: string) => void;
  onCompareWithHistoryRef?: React.MutableRefObject<((body: string) => void) | null>;
}) {
  const studio = useStudio(props);
  const { state, setters, handlers, refs } = studio;

  useEffect(() => {
    if (props.onCompareWithHistoryRef) {
      props.onCompareWithHistoryRef.current = handlers.onCompareWithHistory;
    }
  }, [props.onCompareWithHistoryRef, handlers.onCompareWithHistory]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "#111111", fontFamily: "monospace", color: "#e0e0e0", overflow: "hidden" }}>
      <style>{SCROLLBAR_CSS}</style>

      <StudioTopBar
        method={state.method}
        url={state.url}
        isLoading={state.isLoading}
        pipeline={state.pipeline}
        showMethodMenu={state.showMethodMenu}
        onMethodChange={setters.setMethod}
        onUrlChange={setters.setUrl}
        onSend={handlers.onSend}
        onAbort={() => setters.setIsLoading(false)}
        onToggleMethodMenu={() => setters.setShowMethodMenu(v => !v)}
        onImportCurl={handlers.onImportCurl}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <StudioRequestEditor
          requestTab={state.requestTab}
          headersInput={state.headersInput}
          body={state.body}
          queryParams={state.queryParams}
          isBodyDisabled={state.isBodyDisabled}
          method={state.method}
          headersRef={refs.headersRef}
          bodyRef={refs.bodyRef}
          onTabChange={setters.setRequestTab}
          onHeadersChange={setters.setHeadersInput}
          onBodyChange={setters.setBody}
          onQueryParamsChange={handlers.updateQueryParams}
          applyTextMutation={handlers.applyTextMutation}
          onSmartLogin={() => setters.setShowSmartLogin(true)}
          onQuickFuzz={() => { setters.setFuzzMode(true); setters.setFuzzAnchor({ anchor: state.url, field: "url", payloads: [], concurrency: 1 }); }}
          onSendToBasic={props.onSendToBasic}
          url={state.url}
          envVars={state.envVars}
          onEnvVarsChange={setters.setEnvVars}
        />

        <StudioResponseViewer
          response={state.response}
          error={state.error}
          responseTab={state.responseTab}
          onTabChange={setters.setResponseTab}
          codeLines={state.codeLines}
          responseCookies={state.responseCookies}
          compareMode={state.compareMode}
          diffLines={state.diffLines}
          onBeautify={handlers.onBeautifyResponse}
          onClear={() => { setters.setResponse(null); setters.setError(null); setters.setCompareMode(false); setters.setDiffLines([]); }}
          onShowPoc={() => setters.setShowPocModal(true)}
        />
      </div>

      {state.showSmartLogin && (
        <SmartLoginModal
          onClose={() => setters.setShowSmartLogin(false)}
          onSuccess={(cookie) => {
            setters.setHeadersInput(handlers.injectCookieHeader(state.headersInput, cookie));
            setters.setRequestTab("headers");
          }}
        />
      )}

      {state.showPocModal && (
        <PocModal
          activePocSnippet={state.activePocSnippet}
          pocTab={state.pocTab}
          pocCopied={state.pocCopied}
          onTabChange={setters.setPocTab}
          onCopy={handlers.onCopyPoc}
          onClose={() => setters.setShowPocModal(false)}
        />
      )}

      {state.fuzzMode && (
        <FuzzModal
          fuzzAnchor={state.fuzzAnchor}
          fuzzPayloads={state.fuzzPayloads}
          fuzzResults={state.fuzzResults}
          isFuzzing={state.isFuzzing}
          fuzzProgress={state.fuzzProgress}
          onPayloadsChange={setters.setFuzzPayloads}
          onStart={handlers.onStartFuzz}
          onCancel={handlers.onCancelFuzz}
        />
      )}
    </div>
  );
}
