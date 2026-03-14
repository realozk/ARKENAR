import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Copy, KeyRound, RefreshCw, ChevronDown, CheckCircle } from "lucide-react";
import { StudioRequest as StudioRequestPane } from "./studio/StudioRequest";
import { StudioResponse as StudioResponsePane } from "./studio/StudioResponse";
import { useStudio, POC_TABS } from "./studio/useStudio";

// Re-exporting types for App.tsx compatibility
export type { StudioRequest, StudioHistoryItem, HttpMethod } from "./studio/useStudio";
export { getStatusClass, buildHistoryLabel } from "./studio/useStudio";

/* ── SmartLoginModal ───────────────────────────────────────────── */
interface AutoLoginResult {
  cookie_header: string;
  status_code: number;
}

interface SmartLoginModalProps {
  onClose: () => void;
  onSuccess: (cookieHeader: string) => void;
}

function SmartLoginModal({ onClose, onSuccess }: SmartLoginModalProps) {
  const [loginUrl, setLoginUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tokenField, setTokenField] = useState('');
  const [usernameField, setUsernameField] = useState('');
  const [passwordField, setPasswordField] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!loginUrl.trim() || !username.trim() || !password) {
      setError('Login URL, Username, and Password are all required.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await invoke<AutoLoginResult>('studio_auto_login', {
        req: {
          login_url: loginUrl.trim(),
          username: username.trim(),
          password,
          username_field: usernameField.trim() || null,
          password_field: passwordField.trim() || null,
          token_field: tokenField.trim() || null,
        },
      });

      setSuccessMsg(`✓ Session captured (HTTP ${result.status_code}). Cookie header injected.`);
      setTimeout(() => {
        onSuccess(result.cookie_header);
        onClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border-subtle bg-bg-panel shadow-2xl animate-fade-slide-in">
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4 bg-gradient-surface rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 border border-accent/20">
              <KeyRound size={14} className="text-accent-text" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary leading-none">Smart Auto-Login</p>
              <p className="text-[10px] text-text-muted mt-0.5 uppercase tracking-wider">CSRF-Aware Session Capture</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-ghost hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            Performs a <strong className="text-text-secondary">GET → parse → POST</strong> handshake.
            Hidden CSRF tokens are auto-detected and submitted with your credentials.
          </p>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5 block">Login URL</label>
            <input type="text" value={loginUrl} onChange={e => setLoginUrl(e.target.value)} placeholder="http://target/login.php" autoFocus className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-ghost/50 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5 block">Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" autoComplete="off" className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-ghost/50 outline-none focus:border-accent/40 transition-all" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5 block">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-ghost/50 outline-none focus:border-accent/40 transition-all" />
            </div>
          </div>

          <button type="button" onClick={() => setShowAdvanced(v => !v)} className="flex items-center gap-1.5 text-[11px] text-text-ghost hover:text-accent-text transition-colors duration-150">
            <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
            Advanced field overrides
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-3 gap-3 animate-fade-slide-in">
              {[
                { label: 'Username field', value: usernameField, set: setUsernameField, placeholder: 'username' },
                { label: 'Password field', value: passwordField, set: setPasswordField, placeholder: 'password' },
                { label: 'CSRF token field', value: tokenField, set: setTokenField, placeholder: 'auto-detect' },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label}>
                  <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">{label}</label>
                  <input type="text" value={value} onChange={e => set(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-border-subtle bg-bg-input px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-ghost/40 outline-none focus:border-accent/40 transition-all" />
                </div>
              ))}
            </div>
          )}

          {error && <div className="rounded-lg bg-status-critical/10 border border-status-critical/20 px-3 py-2.5 text-xs text-status-critical leading-relaxed animate-fade-slide-in">{error}</div>}
          {successMsg && <div className="flex items-center gap-2 rounded-lg bg-status-success/10 border border-status-success/20 px-3 py-2.5 text-xs text-status-success animate-fade-slide-in"><CheckCircle size={13} strokeWidth={2.5} className="shrink-0" />{successMsg}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-border-subtle bg-bg-card px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={isLoading || !loginUrl.trim() || !username.trim() || !password} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-bg-root btn-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
            {isLoading ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={13} />}
            {isLoading ? 'Authenticating…' : 'Execute Login'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Wrapper ──────────────────────────────────────────────── */
export default function StudioPanel(props: {
  initialRequest?: Partial<import("./studio/useStudio").StudioRequest> | null;
  onInitialRequestConsumed?: () => void;
  history: import("./studio/useStudio").StudioHistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<import("./studio/useStudio").StudioHistoryItem[]>>;
  selectedHistoryId: string | null;
  setSelectedHistoryId: (id: string | null) => void;
  onSendToBasic?: (url: string, headers: string) => void;
}) {
  const studio = useStudio(props);
  const { state, setters, handlers, refs } = studio;

  return (
    <div className="flex flex-col h-full overflow-hidden p-5 animate-fade-in bg-transparent">
      <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
        
        {/* Left Side: Request */}
        <StudioRequestPane
          state={state as any}
          setters={setters as any}
          handlers={handlers as any}
          refs={refs as any}
          onSendToBasic={props.onSendToBasic}
        />

        {/* Right Side: Response */}
        <StudioResponsePane
          state={state as any}
          setters={setters as any}
          handlers={handlers as any}
        />
        
      </div>

      {/* PoC Modal */}
      {state.showPocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-xl border border-border-subtle bg-bg-panel shadow-2xl animate-fade-slide-in">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Export PoC</h3>
                <p className="text-xs tracking-wider text-text-muted">Generate ready-to-share exploit proof of concept snippets.</p>
              </div>
              <button onClick={() => setters.setShowPocModal(false)} className="rounded-lg border border-border-subtle bg-bg-card p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200">
                <X size={14} />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-3 flex items-center gap-2">
                {POC_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setters.setPocTab(tab.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                      state.pocTab === tab.id
                        ? "bg-bg-card text-text-primary border-accent/40 ring-1 ring-accent/20"
                        : "bg-bg-card text-text-muted border-border-subtle hover:bg-bg-hover hover:text-text-primary"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="rounded-lg border border-border-subtle bg-neutral-950 p-3">
                <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap font-mono text-[13px] text-text-primary">
                  {state.activePocSnippet}
                </pre>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={handlers.onCopyPoc} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-bg-root btn-glow transition-all duration-200">
                  <Copy size={13} />
                  {state.pocCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Login Modal */}
      {state.showSmartLogin && (
        <SmartLoginModal
          onClose={() => setters.setShowSmartLogin(false)}
          onSuccess={(cookieHeader) => {
            setters.setHeadersInput(handlers.injectCookieHeader(state.headersInput, cookieHeader));
            setters.setRequestTab('headers');
          }}
        />
      )}
    </div>
  );
}