import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CloseIcon, RefreshIcon, BoltIcon, KeyIcon, ChevronIcon, CheckCircleIcon, CopyIcon,
} from "../icons";
import type { StudioHistoryItem, PocTab } from "./useStudio";
import { useStudio, POC_TABS } from "./useStudio";
import StudioTopBar from "./StudioTopBar";
import StudioRequestEditor from "./StudioRequestEditor";
import StudioResponseViewer from "./StudioResponseViewer";
import StudioHistorySidebar from "./StudioHistorySidebar";

const SCROLLBAR_CSS = `
  .sw-scroll::-webkit-scrollbar { width: 4px; }
  .sw-scroll::-webkit-scrollbar-track { background: var(--color-bg-root, #0d0d0d); }
  .sw-scroll::-webkit-scrollbar-thumb { background: var(--color-border-subtle, #333); border-radius: 2px; }
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[420px] border border-[color:var(--color-border-subtle)] rounded-sm font-mono"
        style={{ background: "var(--color-bg-panel)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[color:var(--color-border-subtle)]">
          <div className="flex items-center gap-2">
            <KeyIcon size={13} className="text-[color:var(--color-accent)]" />
            <span className="text-xs font-bold tracking-widest uppercase text-[color:var(--color-text-primary)]">Smart Auto-Login</span>
          </div>
          <button onClick={onClose} className="text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] transition-colors">
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-2.5">
          <p className="text-[11px] text-[color:var(--color-text-ghost)] leading-relaxed m-0">
            Performs GET → parse → POST handshake. CSRF tokens auto-detected.
          </p>
          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--color-text-ghost)] mb-1">Login URL</div>
            <input
              className="w-full border border-[color:var(--color-border-subtle)] rounded-sm px-2.5 py-1.5 text-[11px] text-[color:var(--color-text-primary)] outline-none font-mono focus:border-[color:var(--color-accent)] transition-colors"
              style={{ background: "var(--color-bg-root)" }}
              type="text" value={loginUrl} onChange={e => setLoginUrl(e.target.value)}
              placeholder="http://target/login.php" autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--color-text-ghost)] mb-1">Username</div>
              <input
                className="w-full border border-[color:var(--color-border-subtle)] rounded-sm px-2.5 py-1.5 text-[11px] text-[color:var(--color-text-primary)] outline-none font-mono focus:border-[color:var(--color-accent)] transition-colors"
                style={{ background: "var(--color-bg-root)" }}
                type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="admin"
              />
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--color-text-ghost)] mb-1">Password</div>
              <input
                className="w-full border border-[color:var(--color-border-subtle)] rounded-sm px-2.5 py-1.5 text-[11px] text-[color:var(--color-text-primary)] outline-none font-mono focus:border-[color:var(--color-accent)] transition-colors"
                style={{ background: "var(--color-bg-root)" }}
                type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              />
            </div>
          </div>
          <button
            className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-[11px] text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] transition-colors p-0 mt-1 font-mono"
            onClick={() => setShowAdv(v => !v)}
          >
            <ChevronIcon size={11} className={`transition-transform duration-200 ${showAdv ? "rotate-180" : ""}`} />
            Advanced field overrides
          </button>
          {showAdv && (
            <div className="grid grid-cols-3 gap-2">
              {[["Username field", usernameField, setUsernameField, "username"], ["Password field", passwordField, setPasswordField, "password"], ["CSRF field", tokenField, setTokenField, "auto-detect"]].map(([lbl, val, setter, ph]) => (
                <div key={lbl as string}>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--color-text-ghost)] mb-1 truncate" title={lbl as string}>{lbl as string}</div>
                  <input
                    className="w-full border border-[color:var(--color-border-subtle)] rounded-sm px-2 py-1 text-[11px] text-[color:var(--color-text-primary)] outline-none font-mono focus:border-[color:var(--color-accent)] transition-colors"
                    style={{ background: "var(--color-bg-root)" }}
                    value={val as string}
                    onChange={e => (setter as (v: string) => void)(e.target.value)}
                    placeholder={ph as string}
                  />
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="border border-[color:var(--color-status-critical)]/30 rounded-sm p-2 text-[11px] text-[color:var(--color-status-critical)] leading-relaxed mt-1 break-words" style={{ background: "rgba(239,68,68,0.07)" }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-1.5 border border-[color:var(--color-status-success)]/30 rounded-sm p-2 text-[11px] text-[color:var(--color-status-success)] leading-relaxed mt-1" style={{ background: "rgba(34,197,94,0.07)" }}>
              <CheckCircleIcon size={13} />{successMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 p-3 border-t border-[color:var(--color-border-subtle)] rounded-b-sm"
          style={{ background: "var(--color-bg-root-2, var(--color-bg-card, var(--color-bg-panel)))" }}
        >
          <button
            className="border border-[color:var(--color-border-subtle)] rounded-sm px-3.5 py-1.5 text-[11px] text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] font-mono transition-colors"
            style={{ background: "var(--color-bg-root)" }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex items-center gap-1.5 border-none rounded-sm px-4 py-1.5 text-[11px] font-bold text-white font-mono cursor-pointer disabled:opacity-50 hover:brightness-110 active:scale-95 transition-all"
            style={{ background: "var(--color-accent)" }}
            onClick={handleSubmit}
            disabled={isLoading || !loginUrl.trim() || !username.trim() || !password}
          >
            {isLoading ? <RefreshIcon size={13} className="animate-spin" /> : <KeyIcon size={13} />}
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[760px] border border-[color:var(--color-border-subtle)] rounded-sm font-mono flex flex-col max-h-[80vh]"
        style={{ background: "var(--color-bg-panel)" }}
      >
        <div className="flex items-center justify-between p-3 border-b border-[color:var(--color-border-subtle)] shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            <div className="text-[11px] font-bold tracking-widest uppercase text-[color:var(--color-text-primary)]">Export PoC</div>
          </div>
          <button onClick={onClose} className="text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] transition-colors">
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[color:var(--color-border-subtle)] shrink-0 overflow-x-auto">
          {POC_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className="px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-sm border whitespace-nowrap transition-colors font-mono"
              style={pocTab === t.id
                ? { background: "var(--color-bg-hover, rgba(249,115,22,0.1))", borderColor: "rgba(249,115,22,0.4)", color: "var(--color-text-primary)" }
                : { background: "transparent", borderColor: "var(--color-border-subtle)", color: "var(--color-text-muted)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <pre className="sw-scroll flex-1 p-3.5 m-0 text-[11px] text-[color:var(--color-text-primary)] whitespace-pre-wrap break-words leading-relaxed overflow-y-auto" style={{ background: "var(--color-bg-root)" }}>
          {activePocSnippet}
        </pre>
        <div
          className="flex justify-end p-3 border-t border-[color:var(--color-border-subtle)] shrink-0 rounded-b-sm"
          style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
        >
          <button
            className="flex items-center gap-1.5 border-none rounded-sm px-4 py-1.5 text-[11px] font-bold text-white cursor-pointer hover:brightness-110 active:scale-95 transition-all"
            style={{ background: "var(--color-accent)" }}
            onClick={onCopy}
          >
            <CopyIcon size={13} />{pocCopied ? "Copied!" : "Copy"}
          </button>
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
  const statusColor = (s: number) =>
    s >= 200 && s < 300 ? "var(--color-status-success)"
      : s >= 300 && s < 400 ? "#3b82f6"
        : s >= 400 && s < 500 ? "var(--color-status-warning)"
          : "var(--color-status-critical)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-[760px] border border-[color:var(--color-border-subtle)] rounded-sm font-mono flex flex-col max-h-[88vh] overflow-hidden"
        style={{ background: "var(--color-bg-panel)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--color-border-subtle)] shrink-0">
          <div className="flex items-center gap-2">
            <BoltIcon size={13} className="text-[color:var(--color-accent)]" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-[color:var(--color-text-primary)]">Quick Fuzz</span>
          </div>
          <button onClick={onCancel} className="text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] transition-colors">
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Anchor info */}
        <div className="px-4 pb-3 pt-2 shrink-0">
          <div
            className="text-[11px] text-[color:var(--color-text-muted)] border border-[color:var(--color-border-subtle)] rounded-sm px-2.5 py-1.5 flex items-center gap-1.5"
            style={{ background: "var(--color-bg-hover, rgba(255,255,255,0.03))" }}
          >
            Targeting <strong className="text-[color:var(--color-text-primary)]">{fuzzAnchor?.field}</strong>:
            <code className="border border-[color:var(--color-border-subtle)] px-1 py-0.5 rounded-sm truncate max-w-[400px] text-[color:var(--color-accent)]" style={{ background: "var(--color-bg-panel)" }}>
              {fuzzAnchor?.anchor}
            </code>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 gap-3 px-4 min-h-[300px] overflow-hidden max-[600px]:flex-col">
          <div className="flex flex-col w-[200px] max-[600px]:w-full shrink-0 gap-1.5">
            <div className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--color-text-ghost)]">Payloads (one per line)</div>
            <textarea
              className="sw-scroll flex-1 resize-none border border-[color:var(--color-border-subtle)] rounded-sm p-2 text-[11px] text-[color:var(--color-text-primary)] outline-none font-mono transition-colors disabled:opacity-50"
              style={{ background: "var(--color-bg-root)" }}
              value={fuzzPayloads}
              onChange={e => onPayloadsChange(e.target.value)}
              disabled={isFuzzing}
              placeholder={"admin\ntest\n' OR 1=1--"}
              spellCheck={false}
            />
          </div>
          <div className="flex flex-col flex-1 min-w-0 gap-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--color-text-ghost)]">Live Results</div>
              {isFuzzing && <span className="text-[10px] text-[color:var(--color-accent)] font-bold">{fuzzProgress}%</span>}
            </div>
            <div className="flex flex-col flex-1 border border-[color:var(--color-border-subtle)] rounded-sm overflow-hidden" style={{ background: "var(--color-bg-root)" }}>
              <div
                className="grid grid-cols-[2fr_60px_70px_70px] gap-0 px-2.5 py-1.5 border-b border-[color:var(--color-border-subtle)] text-[10px] font-bold tracking-wider text-[color:var(--color-text-ghost)] shrink-0"
                style={{ background: "var(--color-bg-panel)" }}
              >
                <span>Payload</span><span>Status</span><span>Length</span><span>Time</span>
              </div>
              <div className="flex-1 overflow-y-auto sw-scroll p-1">
                {fuzzResults.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-[color:var(--color-text-ghost)]">
                    {isFuzzing ? "Waiting…" : "Enter payloads and click Run."}
                  </div>
                ) : fuzzResults.map(r => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[2fr_60px_70px_70px] gap-0 px-1.5 py-1 border-b border-[color:var(--color-border-subtle)]/50 text-[11px] items-center hover:bg-[color:var(--color-bg-panel)] rounded-sm transition-colors cursor-default"
                  >
                    <span className="text-[color:var(--color-text-primary)] overflow-hidden text-ellipsis whitespace-nowrap pr-2" title={r.payload}>{r.payload}</span>
                    <span className="font-bold" style={{ color: r.error ? "var(--color-status-critical)" : statusColor(r.status) }}>
                      {r.error ? "ERR" : r.status}
                    </span>
                    <span className="text-[color:var(--color-text-muted)]">{r.responseLength}</span>
                    <span className="text-[color:var(--color-text-ghost)]">{r.responseTime}ms</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between p-3 mt-3 border-t border-[color:var(--color-border-subtle)] shrink-0"
          style={{ background: "var(--color-bg-root-2, var(--color-bg-panel))" }}
        >
          <span className="text-[11px] text-[color:var(--color-text-ghost)]">
            {isFuzzing ? "Running…" : `${fuzzResults.length} completed`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="border border-[color:var(--color-border-subtle)] rounded-sm px-3.5 py-1.5 text-[11px] text-[color:var(--color-text-ghost)] hover:text-[color:var(--color-text-primary)] font-mono transition-colors"
              style={{ background: "var(--color-bg-root)" }}
            >
              {isFuzzing ? "Stop" : "Close"}
            </button>
            <button
              onClick={onStart}
              disabled={isFuzzing || !fuzzPayloads.trim()}
              className="flex items-center gap-1.5 border-none rounded-sm px-4 py-1.5 text-[11px] font-bold text-white font-mono cursor-pointer disabled:opacity-30 hover:brightness-110 active:scale-95 transition-all"
              style={{ background: "var(--color-accent)" }}
            >
              {isFuzzing ? <RefreshIcon size={13} className="animate-spin" /> : <BoltIcon size={13} />}
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

  // Reset workspace to a blank request (new request)
  const handleNewRequest = () => {
    setters.setUrl("");
    setters.setMethod("GET");
    setters.setHeadersInput("");
    setters.setBody("");
    setters.setResponse(null);
    setters.setError(null);
    setters.setCompareMode(false);
    setters.setDiffLines([]);
    setters.setPipeline("draft");
    props.setSelectedHistoryId(null);
  };

  const [reqPaneWidth, setReqPaneWidth] = useState(42);
  const reqPaneRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = reqPaneRef.current?.getBoundingClientRect().width || 0;
    const containerWidth = reqPaneRef.current?.parentElement?.getBoundingClientRect().width || 1;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidthPx = startWidth + delta;
      const newWidthPct = (newWidthPx / containerWidth) * 100;
      const minPct = (240 / containerWidth) * 100;
      const clampedPct = Math.min(Math.max(newWidthPct, minPct), 60);
      setReqPaneWidth(clampedPct);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  useEffect(() => {
    if (props.onCompareWithHistoryRef) {
      props.onCompareWithHistoryRef.current = handlers.onCompareWithHistory;
    }
  }, [props.onCompareWithHistoryRef, handlers.onCompareWithHistory]);

  return (
    <div
      className="flex flex-col h-full w-full font-mono text-[color:var(--color-text-primary)] overflow-hidden"
      style={{ background: "var(--color-bg-root)" }}
    >
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

      <div className="flex flex-1 overflow-hidden min-h-0 flex-row max-[700px]:flex-col">
        <StudioHistorySidebar
          studioHistory={props.history}
          selectedStudioHistoryId={props.selectedHistoryId}
          onSelectStudioHistoryItem={props.setSelectedHistoryId}
          onNewStudioRequest={handleNewRequest}
          onCompareWithHistory={handlers.onCompareWithHistory}
        />

        {/* Hairline divider (history | request) */}
        <div className="w-px shrink-0 bg-[color:var(--color-border-subtle)] max-[700px]:hidden" />

        <div ref={reqPaneRef} style={{ width: `${reqPaneWidth}%` }} className="flex flex-col max-[700px]:!w-full max-[700px]:flex-1 flex-shrink-0 relative">
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
        </div>

        {/* Draggable resize handle */}
        <div
          onMouseDown={startResize}
          className="w-1 shrink-0 cursor-col-resize hover:bg-[color:var(--color-accent)] transition-colors duration-150 max-[700px]:hidden z-10"
          style={{ background: "var(--color-border-subtle)" }}
        />

        <div className="flex flex-col flex-1 min-h-0 max-[700px]:min-h-[40vh]">
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
            onMirrorToRequest={() => setters.setBody(state.response?.body || "")}
            onToggleCompare={() => setters.setCompareMode(!state.compareMode)}
          />
        </div>
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
