import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

type StudioResponse = {
  status: number;
  headers: [string, string][];
  body: string;
  body_truncated: boolean;
  timing_ms: number;
};

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return "text-status-success";
  if (status >= 300 && status < 400) return "text-status-warning";
  return "text-status-critical";
}

export default function StudioPanel() {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [headersInput, setHeadersInput] = useState("");
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<StudioResponse | null>(null);
  const [showHeaders, setShowHeaders] = useState(true);

  const isBodyDisabled = useMemo(() => method === "GET" || method === "HEAD", [method]);

  const onSend = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const req = {
        url: url.trim(),
        method,
        headers: headersInput,
        body: isBodyDisabled ? "" : body,
      };

      const res = await invoke<StudioResponse>("studio_send", { req });
      setResponse(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setResponse(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-bg-root p-3 animate-fade-in">
      <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col rounded-xl border border-border-subtle bg-bg-panel p-3 transition-all duration-300">
          <div className="mb-3 flex items-center gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className="rounded-lg border border-border-subtle bg-bg-input px-2.5 py-2 text-xs text-text-primary focus:outline-none hover:border-accent/30 transition-all duration-300"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://target.tld/path"
              className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none hover:border-accent/30 transition-all duration-300"
            />

            <button
              type="button"
              onClick={onSend}
              disabled={isLoading}
              className="inline-flex shrink-0 min-w-[76px] items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-text disabled:opacity-60 transition-all duration-300"
            >
              {isLoading && <span className="h-3 w-3 animate-spin rounded-full border border-accent-text border-t-transparent" />}
              <span>{isLoading ? "Sending" : "Send"}</span>
            </button>
          </div>

          <div className="mb-3 flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex min-h-0 flex-1 flex-col">
              <label className="mb-1 text-11px text-text-secondary">Headers</label>
              <textarea
                value={headersInput}
                onChange={(e) => setHeadersInput(e.target.value)}
                placeholder={"Authorization: Bearer token\\nContent-Type: application/json"}
                className="min-h-[120px] flex-1 resize-none rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none hover:border-accent/30 transition-all duration-300"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <label className="mb-1 text-11px text-text-secondary">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={isBodyDisabled}
                placeholder='{"key":"value"}'
                className={`min-h-[140px] flex-1 resize-none rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none transition-all duration-300 ${
                  isBodyDisabled
                    ? "bg-bg-card text-text-muted"
                    : "bg-bg-input hover:border-accent/30"
                }`}
              />
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border border-border-subtle bg-bg-panel p-3 transition-all duration-300">
          {error && (
            <div className="mb-3 rounded-lg border border-status-critical/30 bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
              {error}
            </div>
          )}

          <div className="mb-3 flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs text-text-secondary">
            <span className={response ? getStatusClass(response.status) : "text-text-muted"}>
              Status: {response ? response.status : "—"}
            </span>
            <span>Time: {response ? `${response.timing_ms} ms` : "—"}</span>
            {response?.body_truncated && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-10px font-semibold text-accent-text">
                TRUNCATED
              </span>
            )}
          </div>

          <div className="mb-3 rounded-lg border border-border-subtle bg-bg-card">
            <button
              type="button"
              onClick={() => setShowHeaders((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs text-text-primary hover:border-accent/30 transition-all duration-300"
            >
              <span>Response Headers</span>
              <span className="text-text-muted">{showHeaders ? "Hide" : "Show"}</span>
            </button>

            {showHeaders && (
              <div className="max-h-40 overflow-auto border-t border-border-subtle px-3 py-2">
                {response?.headers?.length ? (
                  <div className="space-y-1">
                    {response.headers.map(([key, value], idx) => (
                      <div key={`${key}-${idx}`} className="flex gap-2 text-xs">
                        <span className="min-w-32 text-text-secondary">{key}:</span>
                        <span className="break-all text-text-primary">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-text-muted">No headers</div>
                )}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 rounded-lg border border-border-subtle bg-bg-card p-2">
            <div className="h-full overflow-x-auto overflow-y-auto">
              <pre className="w-max min-w-full whitespace-pre text-xs text-text-primary">
                <code className="font-mono">{response?.body ?? ""}</code>
              </pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
