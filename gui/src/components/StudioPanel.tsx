import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Binary,
  Braces,
  ChevronDown,
  Copy,
  FileCode,
  GitCompare,
  Link2,
  RefreshCw,
  Send,
  X,
} from "lucide-react";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type StudioRequest = {
  url: string;
  method: HttpMethod;
  headers: string;
  body: string;
};

export type StudioResponse = {
  status: number;
  headers: [string, string][];
  body: string;
  body_truncated: boolean;
  timing_ms: number;
};

type RequestTab = "headers" | "body" | "params";
type ResponseTab = "body" | "headers" | "cookies";
type PocTab = "curl" | "python" | "raw";
type QueryParam = { id: string; key: string; value: string; enabled: boolean };

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const REQUEST_TABS: { id: RequestTab; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "params", label: "Params" },
];

const RESPONSE_TABS: { id: ResponseTab; label: string }[] = [
  { id: "body", label: "Body" },
  { id: "headers", label: "Headers" },
  { id: "cookies", label: "Cookies" },
];

const POC_TABS: { id: PocTab; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python Requests" },
  { id: "raw", label: "Raw HTTP" },
];

export type StudioHistoryItem = {
  id: string;
  request: StudioRequest;
  response: StudioResponse | null;
  error: string | null;
  createdAt: number;
};

export function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return "text-status-success";
  if (status >= 300 && status < 400) return "text-status-warning";
  return "text-status-critical";
}

export function buildHistoryLabel(request: StudioRequest): string {
  try {
    const parsed = new URL(request.url);
    return `${request.method} ${parsed.pathname || "/"}`;
  } catch {
    return `${request.method} ${request.url || "<empty>"}`;
  }
}

function parseHeaderLines(headersInput: string): Array<[string, string]> {
  return headersInput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) return null;
      return [key, value] as [string, string];
    })
    .filter((v): v is [string, string] => v !== null);
}



function safeBase64Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function safeBase64Decode(input: string): string {
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toHex(input: string): string {
  return Array.from(input)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

function buildCurlSnippet(request: StudioRequest): string {
  const headers = parseHeaderLines(request.headers);
  const parts = [`curl -X ${request.method} "${request.url}"`];
  for (const [k, v] of headers) {
    parts.push(`  -H "${k}: ${v.replace(/"/g, '\\"')}"`);
  }
  if (request.body.trim() && request.method !== "GET" && request.method !== "HEAD") {
    parts.push(`  --data-raw '${request.body.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n");
}

function buildPythonSnippet(request: StudioRequest): string {
  const headers = parseHeaderLines(request.headers);
  const headersMap = headers.length
    ? `headers = {\n${headers.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n")}\n}`
    : "headers = {}";

  const hasBody = request.body.trim() && request.method !== "GET" && request.method !== "HEAD";

  return [
    "import requests",
    "",
    `url = ${JSON.stringify(request.url)}`,
    headersMap,
    hasBody ? `data = ${JSON.stringify(request.body)}` : "data = None",
    "",
    `resp = requests.request(${JSON.stringify(request.method)}, url, headers=headers, data=data)` ,
    "print('Status:', resp.status_code)",
    "print(resp.text)",
  ].join("\n");
}

function buildRawHttpSnippet(request: StudioRequest): string {
  let urlPath = "/";
  let host = "";
  try {
    const parsed = new URL(request.url);
    urlPath = parsed.pathname + parsed.search;
    host = parsed.host;
  } catch {
    host = request.url;
  }
  const headers = parseHeaderLines(request.headers);
  const lines = [
    `${request.method} ${urlPath} HTTP/1.1`,
    `Host: ${host}`,
    ...headers.map(([k, v]) => `${k}: ${v}`),
  ];
  if (request.body.trim() && request.method !== "GET" && request.method !== "HEAD") {
    lines.push("", request.body);
  } else {
    lines.push("");
  }
  return lines.join("\r\n");
}

function diffBodies(previousBody: string, currentBody: string): Array<{ type: "same" | "added" | "removed"; text: string }> {
  const prev = previousBody.split("\n");
  const curr = currentBody.split("\n");
  const max = Math.max(prev.length, curr.length);
  const lines: Array<{ type: "same" | "added" | "removed"; text: string }> = [];

  for (let idx = 0; idx < max; idx += 1) {
    const p = prev[idx];
    const c = curr[idx];

    if (p === c && c !== undefined) {
      lines.push({ type: "same", text: c });
      continue;
    }

    if (p !== undefined) {
      lines.push({ type: "removed", text: p });
    }
    if (c !== undefined) {
      lines.push({ type: "added", text: c });
    }
  }

  return lines;
}

function ActionButton({
  icon,
  title,
  label,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  label: string;
  onClick: () => void;
}) {
  const Icon = icon;
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

export default function StudioPanel({
  initialRequest,
  onInitialRequestConsumed,
  history,
  setHistory,
  selectedHistoryId,
  setSelectedHistoryId
}: {
  initialRequest?: Partial<StudioRequest> | null;
  onInitialRequestConsumed?: () => void;
  history: StudioHistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<StudioHistoryItem[]>>;
  selectedHistoryId: string | null;
  setSelectedHistoryId: (id: string | null) => void;
}) {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [headersInput, setHeadersInput] = useState("");
  const [body, setBody] = useState("");
  const [queryParams, setQueryParams] = useState<QueryParam[]>([]);

  const [showMethodMenu, setShowMethodMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [response, setResponse] = useState<StudioResponse | null>(null);
  const [previousResponse, setPreviousResponse] = useState<StudioResponse | null>(null);
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [requestTab, setRequestTab] = useState<RequestTab>("headers");

  const [showPocModal, setShowPocModal] = useState(false);
  const [pocTab, setPocTab] = useState<PocTab>("curl");
  const [pocCopied, setPocCopied] = useState(false);

  const [compareMode, setCompareMode] = useState(false);

  const headersRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const suppressUrlEffect = useRef(false);

  const isBodyDisabled = useMemo(() => method === "GET" || method === "HEAD", [method]);

  const responseCookies = useMemo(
    () => (response?.headers ?? []).filter(([k]) => k.toLowerCase() === "set-cookie"),
    [response?.headers],
  );

  const displayBody = response?.body ?? "";

  const codeLines = useMemo(() => {
    const lines = displayBody.split("\n");
    return lines.length === 0 ? [""] : lines;
  }, [displayBody]);

  const diffLines = useMemo(() => {
    if (!compareMode || !previousResponse || !response) return [];
    return diffBodies(previousResponse.body, response.body);
  }, [compareMode, previousResponse, response]);

  const finalRequest = useMemo<StudioRequest>(() => {
    return {
      url,
      method,
      headers: headersInput,
      body: isBodyDisabled ? "" : body,
    };
  }, [url, method, headersInput, body, isBodyDisabled]);

  const curlSnippet = useMemo(() => buildCurlSnippet(finalRequest), [finalRequest]);
  const pythonSnippet = useMemo(() => buildPythonSnippet(finalRequest), [finalRequest]);
  const rawSnippet = useMemo(() => buildRawHttpSnippet(finalRequest), [finalRequest]);

  const activePocSnippet = useMemo(() => {
    if (pocTab === "curl") return curlSnippet;
    if (pocTab === "python") return pythonSnippet;
    return rawSnippet;
  }, [pocTab, curlSnippet, pythonSnippet, rawSnippet]);

  useEffect(() => {
    let phase = 0;
    if (isLoading) phase = 1;
    else if (response) phase = 3;
    else if (method && url) phase = 0;
    
    let statusText = isLoading ? "Sending..." : "Idle";
    if (response) {
      statusText = String(response.status);
    }

    const reqSize = new Blob([body]).size + new Blob([headersInput]).size;
    const resSize = response ? new Blob([response.body || ""]).size : 0;
    
    const formatBytes = (bytes: number) => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    window.dispatchEvent(new CustomEvent("studio-stats", {
      detail: {
        status: statusText,
        time: response ? `${response.timing_ms}ms` : "—",
        reqSize: formatBytes(reqSize),
        resSize: formatBytes(resSize),
        phase
      }
    }));
  }, [isLoading, response, method, url, body, headersInput]);

  useEffect(() => {
    if (!initialRequest) return;

    if (initialRequest.method) setMethod(initialRequest.method);
    if (typeof initialRequest.url === "string") setUrl(initialRequest.url);
    if (typeof initialRequest.headers === "string") setHeadersInput(initialRequest.headers);
    if (typeof initialRequest.body === "string") setBody(initialRequest.body);

    onInitialRequestConsumed?.();
  }, [initialRequest, onInitialRequestConsumed]);

  const updateQueryParams = (newParams: QueryParam[]) => {
    setQueryParams(newParams);
    const base = url.split("?")[0];
    const qp = new URLSearchParams();
    for (const p of newParams) {
      if (p.enabled && p.key.trim()) qp.append(p.key.trim(), p.value);
    }
    const qs = qp.toString();
    suppressUrlEffect.current = true;
    setUrl(qs ? `${base}?${qs}` : base);
  };

  useEffect(() => {
    if (suppressUrlEffect.current) {
      suppressUrlEffect.current = false;
      return;
    }
    try {
      const parsed = new URL(url);
      setQueryParams(
        Array.from(parsed.searchParams.entries()).map(([k, v]) => ({
          id: crypto.randomUUID(),
          key: k,
          value: v,
          enabled: true,
        }))
      );
    } catch {
      setQueryParams([]);
    }
  }, [url]);

  const applyTextMutation = (mutator: (value: string) => string) => {
    const targetRef = requestTab === "headers" ? headersRef : bodyRef;
    const textarea = targetRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;

    const currentValue = textarea.value;
    const selected = currentValue.slice(start, end);

    let transformed = selected;
    try {
      transformed = mutator(selected);
    } catch {
      return;
    }

    const next = `${currentValue.slice(0, start)}${transformed}${currentValue.slice(end)}`;

    if (requestTab === "headers") setHeadersInput(next);
    else if (requestTab === "body") setBody(next);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = start;
      textarea.selectionEnd = start + transformed.length;
    });
  };

  useEffect(() => {
    if (selectedHistoryId) {
      const item = history.find(i => i.id === selectedHistoryId);
      if (item) {
        setMethod(item.request.method);
        setUrl(item.request.url);
        setHeadersInput(item.request.headers);
        setBody(item.request.body);
        setResponse(item.response);
        setError(item.error);
        setCompareMode(false);
      }
    }
  }, [selectedHistoryId, history]);

  const onSend = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);
    setShowMethodMenu(false);
    setPreviousResponse(response);

    try {
      const req: StudioRequest = {
        url: finalRequest.url.trim(),
        method: finalRequest.method,
        headers: finalRequest.headers,
        body: finalRequest.body,
      };

      const res = await invoke<StudioResponse>("studio_send", { req });
      setResponse(res);

      const item: StudioHistoryItem = {
        id: crypto.randomUUID(),
        request: req,
        response: res,
        error: null,
        createdAt: Date.now(),
      };
      setHistory((prev) => [item, ...prev]);
      setSelectedHistoryId(item.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setResponse(null);

      const failedReq: StudioRequest = {
        url: finalRequest.url.trim(),
        method: finalRequest.method,
        headers: finalRequest.headers,
        body: finalRequest.body,
      };

      const item: StudioHistoryItem = {
        id: crypto.randomUUID(),
        request: failedReq,
        response: null,
        error: message,
        createdAt: Date.now(),
      };
      setHistory((prev) => [item, ...prev]);
      setSelectedHistoryId(item.id);
    } finally {
      setIsLoading(false);
    }
  };

  const onBeautifyResponse = () => {
    if (!response?.body) return;

    try {
      const parsed = JSON.parse(response.body);
      const pretty = JSON.stringify(parsed, null, 2);
      setResponse((prev) => (prev ? { ...prev, body: pretty } : prev));
    } catch {
      setError("Response body is not valid JSON.");
    }
  };

  const onCopyPoc = async () => {
    await navigator.clipboard.writeText(activePocSnippet);
    setPocCopied(true);
    setTimeout(() => setPocCopied(false), 2000);
  };

  return (
    <div className="h-full w-full flex flex-col p-5 animate-fade-in bg-transparent overflow-hidden">
      <div className="flex h-full gap-4 min-h-0 w-full overflow-hidden">
        

        <section className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-xl border border-border-subtle bg-bg-panel p-4 animate-fade-slide-in">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMethodMenu((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
              >
                {method}
                <ChevronDown size={13} strokeWidth={2.2} className="text-text-secondary" />
              </button>

              {showMethodMenu && (
                <div className="absolute z-20 mt-1 w-[120px] rounded-lg border border-border-subtle bg-bg-panel shadow-lg animate-fade-slide-in">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMethod(m);
                        setShowMethodMenu(false);
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
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://target.tld/path"
              className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/20"
            />

            <button
              type="button"
              onClick={onSend}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-bg-root btn-glow disabled:opacity-60 transition-all duration-200"
            >
              {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              Execute
            </button>

            <button
              type="button"
              onClick={() => {
                setHeadersInput("");
                setBody("");
                updateQueryParams([]);
                setError(null);
                setCompareMode(false);
              }}
              className="rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={() => setShowPocModal(true)}
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
                onClick={() => setRequestTab(tab.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                  requestTab === tab.id
                    ? "bg-bg-card text-text-primary border-accent/40 ring-1 ring-accent/20"
                    : "bg-bg-card text-text-muted border-border-subtle hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-card px-3 py-2">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Utility</span>
            <ActionButton icon={Binary} title="Base64 Encode selected text" label="B64 Encode" onClick={() => applyTextMutation((v) => safeBase64Encode(v))} />
            <ActionButton icon={Binary} title="Base64 Decode selected text" label="B64 Decode" onClick={() => applyTextMutation((v) => safeBase64Decode(v))} />
            <ActionButton icon={Link2} title="URL Encode selected text" label="URL Encode" onClick={() => applyTextMutation((v) => encodeURIComponent(v))} />
            <ActionButton icon={Link2} title="URL Decode selected text" label="URL Decode" onClick={() => applyTextMutation((v) => decodeURIComponent(v))} />
            <ActionButton icon={Braces} title="Convert selected text to hexadecimal" label="→ Hex" onClick={() => applyTextMutation((v) => toHex(v))} />
          </div>

          <div className="min-h-0 h-[calc(100%-143px)]">
            {requestTab === "headers" && (
              <textarea
                ref={headersRef}
                value={headersInput}
                onChange={(e) => setHeadersInput(e.target.value)}
                placeholder={"Authorization: Bearer token\nContent-Type: application/json"}
                className="h-full w-full resize-none rounded-lg border border-border-subtle bg-bg-input p-3 font-mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            )}

            {requestTab === "body" && (
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={isBodyDisabled}
                placeholder='{"payload":"value"}'
                className={`h-full w-full resize-none rounded-lg border border-border-subtle p-3 font-mono text-[13px] placeholder:text-text-muted focus:outline-none ${
                  isBodyDisabled ? "bg-bg-card text-text-muted" : "bg-bg-input text-text-primary"
                }`}
              />
            )}

            {requestTab === "params" && (
              <div className="flex h-full flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-auto">
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
                      {queryParams.map((param) => (
                        <tr key={param.id} className="group">
                          <td className="py-1 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={param.enabled}
                              onChange={(e) =>
                                updateQueryParams(queryParams.map((p) =>
                                  p.id === param.id ? { ...p, enabled: e.target.checked } : p
                                ))
                              }
                              className="h-3.5 w-3.5 cursor-pointer"
                              style={{ accentColor: 'var(--color-accent)' }}
                            />
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="text"
                              value={param.key}
                              onChange={(e) =>
                                updateQueryParams(queryParams.map((p) =>
                                  p.id === param.id ? { ...p, key: e.target.value } : p
                                ))
                              }
                              placeholder="key"
                              style={{ color: 'var(--color-text-primary)' }}
                              className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 font-mono placeholder:text-text-muted hover:border-border-subtle focus:border-accent/40 focus:bg-bg-input focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="text"
                              value={param.value}
                              onChange={(e) =>
                                updateQueryParams(queryParams.map((p) =>
                                  p.id === param.id ? { ...p, value: e.target.value } : p
                                ))
                              }
                              placeholder="value"
                              style={{ color: 'var(--color-text-primary)' }}
                              className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 font-mono placeholder:text-text-muted hover:border-border-subtle focus:border-accent/40 focus:bg-bg-input focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                            />
                          </td>
                          <td className="py-1 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => updateQueryParams(queryParams.filter((p) => p.id !== param.id))}
                              className="rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:bg-status-critical/10 hover:text-status-critical transition-all"
                            >
                              <X size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {queryParams.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-[13px] text-text-muted">
                            No parameters yet — type{" "}
                            <code className="rounded bg-bg-card px-1.5 py-0.5 font-mono text-xs tracking-wider">?key=value</code>{" "}
                            in the URL bar or add one below.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateQueryParams([
                      ...queryParams,
                      { id: crypto.randomUUID(), key: "", value: "", enabled: true },
                    ])
                  }
                  className="mt-2 text-left text-[12px] font-semibold uppercase tracking-wider text-accent hover:text-accent/70 transition-colors"
                >
                  + Add Parameter
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-xl border border-border-subtle bg-bg-panel p-4 animate-fade-slide-in">
          {error && (
            <div className="mb-3 rounded-lg border border-status-critical/25 bg-status-critical/10 px-3 py-2 text-xs font-semibold tracking-wider text-status-critical">
              {error}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-xs tracking-wider">
            <div className="flex items-center gap-3 text-text-secondary">
              <span className={response ? `${getStatusClass(response.status)} font-semibold uppercase tracking-wider` : "text-text-muted font-semibold uppercase tracking-wider"}>STATUS: {response ? response.status : "—"}</span>
              <span className="font-semibold uppercase tracking-wider text-text-muted">TIME: {response ? `${response.timing_ms} ms` : "—"}</span>
              {response?.body_truncated && <span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wider text-status-warning">TRUNCATED</span>}
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 border-b border-border-subtle pb-3">
            {RESPONSE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setResponseTab(tab.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                  responseTab === tab.id
                    ? "bg-bg-card text-text-primary border-accent/40 ring-1 ring-accent/20"
                    : "bg-bg-card text-text-muted border-border-subtle hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="h-[calc(100%-148px)] min-h-0 rounded-lg border border-border-subtle bg-bg-card p-2">
            {responseTab === "body" && (
              <div className="h-full overflow-auto rounded-lg border border-border-subtle bg-bg-input">
                {compareMode && previousResponse && response ? (
                  <div className="h-full overflow-auto p-2 font-mono text-[13px] leading-6">
                    {diffLines.length === 0 ? (
                      <div className="text-text-muted">No diff available.</div>
                    ) : (
                      diffLines.map((line, idx) => (
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
                      {codeLines.map((_, idx) => (
                        <div key={idx}>{idx + 1}</div>
                      ))}
                    </div>
                    <pre className="min-w-full whitespace-pre px-3 py-2 text-text-primary">{displayBody}</pre>
                  </div>
                )}
              </div>
            )}

            {responseTab === "headers" && (
              <div className="h-full overflow-auto space-y-2 p-1">
                {response?.headers?.length ? (
                  response.headers.map(([k, v], idx) => (
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

            {responseTab === "cookies" && (
              <div className="h-full overflow-auto space-y-2 p-1">
                {responseCookies.length ? (
                  responseCookies.map(([, v], idx) => (
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

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setResponse(null)}
              className="rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
            >
              Clear Response
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(response?.body ?? "")}
              className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
            >
              <Copy size={13} />
              Copy Body
            </button>
            <button
              type="button"
              onClick={onBeautifyResponse}
              className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
            >
              <Braces size={13} />
              Beautify {"{}"}
            </button>
            <button
              type="button"
              onClick={() => setCompareMode((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                compareMode ? "bg-accent/10 text-accent-text ring-1 ring-accent/20" : "bg-bg-card text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              <GitCompare size={13} />
              Compare (Diff)
            </button>
          </div>
        </section>
      </div>

      {showPocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-xl border border-border-subtle bg-bg-panel shadow-2xl animate-fade-slide-in">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Export PoC</h3>
                <p className="text-xs tracking-wider text-text-muted">Generate ready-to-share exploit proof of concept snippets.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPocModal(false)}
                className="rounded-lg border border-border-subtle bg-bg-card p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-200"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-3 flex items-center gap-2">
                {POC_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPocTab(tab.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                      pocTab === tab.id
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
                  {activePocSnippet}
                </pre>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCopyPoc}
                  className="inline-flex items-center gap-1 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-bg-root btn-glow transition-all duration-200"
                >
                  <Copy size={13} />
                  {pocCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
