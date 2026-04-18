import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EnvVar } from "../../types";
import type { FuzzResult, FuzzConfig } from "../../types";

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

export type RequestTab = "headers" | "body" | "params" | "env";
export type ResponseTab = "body" | "headers" | "cookies" | "diff";
export type PocTab = "curl" | "python" | "raw";
export type QueryParam = { id: string; key: string; value: string; enabled: boolean };

export const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export const REQUEST_TABS: { id: RequestTab; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "params", label: "Params" },
  { id: "env", label: "Env Vars" },
];

export const RESPONSE_TABS: { id: ResponseTab; label: string }[] = [
  { id: "body", label: "Body" },
  { id: "headers", label: "Headers" },
  { id: "cookies", label: "Cookies" },
];

export const POC_TABS: { id: PocTab; label: string }[] = [
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

export interface AutoLoginResult {
  cookie_header: string;
  status_code: number;
}

export type PipelineStage = "draft" | "dispatch" | "await" | "render";

export function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return "text-status-success";
  if (status >= 300 && status < 400) return "text-status-warning";
  return "text-status-critical";
}

export function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "#4caf50";
  if (status >= 300 && status < 400) return "#2196f3";
  if (status >= 400 && status < 500) return "#ff9800";
  return "#f44336";
}

export function getMethodColor(method: HttpMethod): string {
  switch (method) {
    case "GET": return "#4caf50";
    case "POST": return "#ff6b35";
    case "PUT": return "#ff9800";
    case "PATCH": return "#2196f3";
    case "DELETE": return "#f44336";
    default: return "#aaaaaa";
  }
}



export function parseHeaderLines(headersInput: string): Array<[string, string]> {
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

export function safeBase64Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export function safeBase64Decode(input: string): string {
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function toHex(input: string): string {
  return Array.from(input).map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

export function buildCurlSnippet(request: StudioRequest): string {
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

export function buildPythonSnippet(request: StudioRequest): string {
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
    `resp = requests.request(${JSON.stringify(request.method)}, url, headers=headers, data=data)`,
    "print('Status:', resp.status_code)",
    "print(resp.text)",
  ].join("\n");
}

export function buildRawHttpSnippet(request: StudioRequest): string {
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

export function diffBodies(previousBody: string, currentBody: string): Array<{ type: "same" | "added" | "removed"; text: string }> {
  const prev = previousBody.split("\n");
  const curr = currentBody.split("\n");
  const max = Math.max(prev.length, curr.length);
  const lines: Array<{ type: "same" | "added" | "removed"; text: string }> = [];
  for (let idx = 0; idx < max; idx += 1) {
    const p = prev[idx];
    const c = curr[idx];
    if (p === c && c !== undefined) { lines.push({ type: "same", text: c }); continue; }
    if (p !== undefined) lines.push({ type: "removed", text: p });
    if (c !== undefined) lines.push({ type: "added", text: c });
  }
  return lines;
}

export function useStudio(props: {
  initialRequest?: Partial<StudioRequest> | null;
  onInitialRequestConsumed?: () => void;
  history: StudioHistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<StudioHistoryItem[]>>;
  selectedHistoryId: string | null;
  setSelectedHistoryId: (id: string | null) => void;
}) {
  const { initialRequest, onInitialRequestConsumed, history, setHistory, selectedHistoryId, setSelectedHistoryId } = props;

  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [headersInput, setHeadersInput] = useState("");
  const [body, setBody] = useState("");
  const [queryParams, setQueryParams] = useState<QueryParam[]>([]);
  const abortFuzzRef = useRef(false);

  const [showMethodMenu, setShowMethodMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage>("draft");

  const [response, setResponse] = useState<StudioResponse | null>(null);
  const [previousResponse, setPreviousResponse] = useState<StudioResponse | null>(null);
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [requestTab, setRequestTab] = useState<RequestTab>("headers");

  const [showPocModal, setShowPocModal] = useState(false);
  const [pocTab, setPocTab] = useState<PocTab>("curl");
  const [pocCopied, setPocCopied] = useState(false);

  const [compareMode, setCompareMode] = useState(false);
  const [fuzzMode, setFuzzMode] = useState(false);
  const [fuzzAnchor, setFuzzAnchor] = useState<FuzzConfig | null>(null);
  const [fuzzPayloads, setFuzzPayloads] = useState("");
  const [fuzzResults, setFuzzResults] = useState<FuzzResult[]>([]);
  const [isFuzzing, setIsFuzzing] = useState(false);
  const [fuzzProgress, setFuzzProgress] = useState(0);

  const [showSmartLogin, setShowSmartLogin] = useState(false);

  const [envVars, setEnvVars] = useState<EnvVar[]>(() => {
    try { return JSON.parse(localStorage.getItem("arkenar-env-vars") ?? "[]"); }
    catch { return []; }
  });

  const headersRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const suppressUrlEffect = useRef(false);

  const isBodyDisabled = useMemo(() => method === "GET" || method === "HEAD", [method]);

  const injectCookieHeader = (currentHeaders: string, cookieValue: string): string => {
    const cleaned = currentHeaders
      .split("\n")
      .filter(line => !line.trim().toLowerCase().startsWith("cookie:"))
      .filter(Boolean);
    cleaned.push(`Cookie: ${cookieValue}`);
    return cleaned.join("\n");
  };

  const responseCookies = useMemo(
    () => (response?.headers ?? []).filter(([k]) => k.toLowerCase() === "set-cookie"),
    [response?.headers],
  );

  const displayBody = response?.body ?? "";

  const codeLines = useMemo(() => {
    const lines = displayBody.split("\n");
    return lines.length === 0 ? [""] : lines;
  }, [displayBody]);

  const [diffLines, setDiffLines] = useState<{ type: "same" | "added" | "removed"; text: string }[]>([]);

  const finalRequest = useMemo<StudioRequest>(() => ({
    url,
    method,
    headers: headersInput,
    body: isBodyDisabled ? "" : body,
  }), [url, method, headersInput, body, isBodyDisabled]);

  const curlSnippet = useMemo(() => buildCurlSnippet(finalRequest), [finalRequest]);
  const pythonSnippet = useMemo(() => buildPythonSnippet(finalRequest), [finalRequest]);
  const rawSnippet = useMemo(() => buildRawHttpSnippet(finalRequest), [finalRequest]);

  const activePocSnippet = useMemo(() => {
    if (pocTab === "curl") return curlSnippet;
    if (pocTab === "python") return pythonSnippet;
    return rawSnippet;
  }, [pocTab, curlSnippet, pythonSnippet, rawSnippet]);

  const isResponseJson = useMemo(() => {
    if (!response) return false;
    return response.headers.some(([k, v]) =>
      k.toLowerCase() === "content-type" && v.toLowerCase().includes("application/json")
    );
  }, [response]);

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
    if (suppressUrlEffect.current) { suppressUrlEffect.current = false; return; }
    try {
      const parsed = new URL(url);
      setQueryParams(
        Array.from(parsed.searchParams.entries()).map(([k, v]) => ({
          id: crypto.randomUUID(), key: k, value: v, enabled: true,
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
    try { transformed = mutator(selected); } catch { return; }
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
        setMethod(item.request?.method || "GET");
        setUrl(item.request?.url || "");
        setHeadersInput(item.request?.headers || "");
        setBody(item.request?.body || "");
        setResponse(item.response || null);
        setError(item.error || null);
        setCompareMode(false);
        setPipeline(item.response ? "render" : "draft");
      }
    }
  }, [selectedHistoryId, history]);

  useEffect(() => {
    const reqSize = url ? new Blob([url]).size : 0;
    const resSize = response?.body ? new Blob([response.body]).size : 0;
    const fmtBytes = (n: number) => n > 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;
    
    const stageMap: Record<PipelineStage, number> = { "draft": 0, "dispatch": 1, "await": 2, "render": 3 };
    const statusStr = response ? String(response.status) : error ? "Error" : isLoading ? pipeline.toUpperCase() : "Idle";
      
    window.dispatchEvent(new CustomEvent("studio-stats", {
      detail: {
        status: statusStr,
        time: response ? `${response.timing_ms}ms` : "—",
        reqSize: fmtBytes(reqSize),
        resSize: fmtBytes(resSize),
        phase: stageMap[pipeline],
      }
    }));
  }, [url, response, error, isLoading, pipeline]);

  const envVarsRef = useRef(envVars);
  envVarsRef.current = envVars;

  const injectEnvVars = (text: string): string => {
    try {
      return envVarsRef.current.reduce((acc, v) => {
        if (!v.key.trim()) return acc;
        const escaped = v.key.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return acc.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, "g"), v.value);
      }, text);
    } catch { return text; }
  };

  const computeDiff = (a: string, b: string) => {
    const aLines = a.split("\n");
    const bLines = b.split("\n");
    const result: { type: "same" | "removed" | "added"; text: string }[] = [];
    const maxLen = Math.max(aLines.length, bLines.length);
    for (let i = 0; i < maxLen; i++) {
      const aLine = aLines[i];
      const bLine = bLines[i];
      if (aLine === bLine) { result.push({ type: "same", text: aLine ?? "" }); }
      else {
        if (aLine !== undefined) result.push({ type: "removed", text: aLine });
        if (bLine !== undefined) result.push({ type: "added", text: bLine });
      }
    }
    return result;
  };

  const onSend = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setShowMethodMenu(false);
    setPreviousResponse(response);
    setPipeline("dispatch");

    try {
      const req: StudioRequest = {
        url: injectEnvVars(finalRequest.url.trim()),
        method: finalRequest.method,
        headers: injectEnvVars(finalRequest.headers),
        body: injectEnvVars(finalRequest.body),
      };

      setPipeline("await");
      const res = await invoke<StudioResponse>("studio_send", { req });
      setPipeline("render");

      const isJsonContentType = res.headers.some(([k, v]) =>
        k.toLowerCase() === "content-type" && v.toLowerCase().includes("application/json")
      );

      let finalRes = res;
      if (isJsonContentType) {
        try {
          const pretty = JSON.stringify(JSON.parse(res.body), null, 2);
          finalRes = { ...res, body: pretty };
        } catch { }
      }

      const item: StudioHistoryItem = {
        id: crypto.randomUUID(),
        request: req,
        response: finalRes,
        error: null,
        createdAt: Date.now(),
      };
      setHistory((prev) => [item, ...prev]);
      setSelectedHistoryId(item.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setResponse(null);
      setPipeline("draft");

      const failedReq: StudioRequest = {
        url: injectEnvVars(finalRequest.url.trim()),
        method: finalRequest.method,
        headers: injectEnvVars(finalRequest.headers),
        body: injectEnvVars(finalRequest.body),
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

  const onMirrorToRequest = () => {
    if (!response?.body) return;
    setBody(response.body);
    setRequestTab("body");
  };

  const onCompareWithHistory = (historyBody: string) => {
    if (!response?.body) return;
    const diff = computeDiff(historyBody, response.body);
    setDiffLines(diff);
    setCompareMode(true);
    setResponseTab("body");
  };

  const onStartFuzz = async () => {
    if (!fuzzAnchor || !fuzzPayloads.trim) return;
    const payloads = fuzzPayloads.split("\n").map(p => p.trim()).filter(Boolean);
    if (payloads.length === 0) return;
    setIsFuzzing(true);
    setFuzzResults([]);
    setFuzzProgress(0);
    abortFuzzRef.current = false;

    for (let i = 0; i < payloads.length; i++) {
      if (abortFuzzRef.current) break;
      const payload = payloads[i];
      const fuzzedUrl = fuzzAnchor.field === "url" ? finalRequest.url.replace(fuzzAnchor.anchor, payload) : finalRequest.url;
      const fuzzedBody = fuzzAnchor.field === "body" ? finalRequest.body.replace(fuzzAnchor.anchor, payload) : finalRequest.body;
      const start = Date.now();
      try {
        const res = await invoke<{ status: number; body: string }>("studio_send", {
          req: { url: fuzzedUrl, method: finalRequest.method, headers: finalRequest.headers, body: fuzzedBody },
        });
        setFuzzResults(prev => [...prev, { id: crypto.randomUUID(), payload, status: res.status, responseTime: Date.now() - start, responseLength: res.body.length, responseBody: res.body, error: null }]);
      } catch (err) {
        setFuzzResults(prev => [...prev, { id: crypto.randomUUID(), payload, status: 0, responseTime: Date.now() - start, responseLength: 0, responseBody: "", error: err instanceof Error ? err.message : String(err) }]);
      }
      setFuzzProgress(Math.round(((i + 1) / payloads.length) * 100));
    }
    setIsFuzzing(false);
  };

  const onCancelFuzz = () => {
    abortFuzzRef.current = true;
    setIsFuzzing(false);
    setFuzzMode(false);
    setFuzzAnchor(null);
    setFuzzPayloads("");
    setFuzzResults([]);
    setFuzzProgress(0);
  };

  const onImportCurl = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text.startsWith("curl")) { setError("Clipboard does not contain a cURL command."); return; }
      const tokens: string[] = [];
      let i = 0;
      while (i < text.length) {
        if (/\s/.test(text[i]) || (text[i] === "\\" && text[i + 1] === "\n")) { i++; continue; }
        if (text[i] === "'") {
          i++; let tok = "";
          while (i < text.length && text[i] !== "'") tok += text[i++];
          i++; tokens.push(tok); continue;
        }
        if (text[i] === '"') {
          i++; let tok = "";
          while (i < text.length && text[i] !== '"') {
            if (text[i] === "\\" && text[i + 1] === '"') { tok += '"'; i += 2; }
            else tok += text[i++];
          }
          i++; tokens.push(tok); continue;
        }
        let tok = "";
        while (i < text.length && !/\s/.test(text[i])) tok += text[i++];
        tokens.push(tok);
      }
      let parsedUrl = "", parsedMethod = "GET";
      const headerLines: string[] = [];
      let parsedBody = "";
      for (let j = 0; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.startsWith("http://") || t.startsWith("https://")) { parsedUrl = t; continue; }
        if ((t === "-X" || t === "--request") && tokens[j + 1]) { parsedMethod = tokens[++j].toUpperCase(); continue; }
        if ((t === "-H" || t === "--header") && tokens[j + 1]) {
          const h = tokens[++j];
          if (!h.startsWith(":") && !h.toLowerCase().startsWith("content-length")) headerLines.push(h);
          continue;
        }
        if ((t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") && tokens[j + 1]) {
          parsedBody = tokens[++j]; continue;
        }
      }
      if (!parsedUrl) { setError("Could not parse a valid URL from the cURL command."); return; }
      if (parsedMethod === "GET" && parsedBody) parsedMethod = "POST";
      const VALID = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
      const safeMethod = (VALID.includes(parsedMethod) ? parsedMethod : "GET") as HttpMethod;
      setUrl(parsedUrl);
      setMethod(safeMethod);
      setHeadersInput(headerLines.join("\n"));
      setBody(parsedBody);
      if (parsedBody) setRequestTab("body");
      setError(null);
    } catch {
      setError("Failed to read clipboard. Please grant clipboard permissions.");
    }
  };

  const onCopyPoc = async () => {
    await navigator.clipboard.writeText(activePocSnippet);
    setPocCopied(true);
    setTimeout(() => setPocCopied(false), 2000);
  };

  return {
    state: {
      method, url, headersInput, body, queryParams,
      showMethodMenu, isLoading, error, pipeline,
      response, previousResponse, responseTab, requestTab,
      showPocModal, pocTab, pocCopied,
      compareMode, showSmartLogin,
      isBodyDisabled, responseCookies, displayBody, codeLines, diffLines,
      activePocSnippet, isResponseJson, envVars, fuzzMode, fuzzAnchor,
      fuzzPayloads, fuzzResults, isFuzzing, fuzzProgress,
    },
    refs: { headersRef, bodyRef },
    setters: {
      setMethod, setUrl, setHeadersInput, setBody, setQueryParams,
      setShowMethodMenu, setIsLoading, setError,
      setResponse, setPreviousResponse, setResponseTab, setRequestTab,
      setShowPocModal, setPocTab, setPocCopied,
      setCompareMode, setShowSmartLogin, setEnvVars, setDiffLines,
      setFuzzMode, setFuzzAnchor, setFuzzPayloads, setPipeline,
    },
    handlers: {
      updateQueryParams, applyTextMutation, onSend, onBeautifyResponse,
      onCopyPoc, injectCookieHeader, onMirrorToRequest, onImportCurl,
      onCompareWithHistory, onStartFuzz, onCancelFuzz,
    },
  };
}

export type { EnvVar };
