import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";


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

export type RequestTab = "headers" | "body" | "params";
export type ResponseTab = "body" | "headers" | "cookies";
export type PocTab = "curl" | "python" | "raw";
export type QueryParam = { id: string; key: string; value: string; enabled: boolean };

export const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export const REQUEST_TABS: { id: RequestTab; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "params", label: "Params" },
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
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function safeBase64Decode(input: string): string {
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function toHex(input: string): string {
  return Array.from(input)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
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
  const [showSmartLogin, setShowSmartLogin] = useState(false);

  const headersRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const suppressUrlEffect = useRef(false);

  const isBodyDisabled = useMemo(() => method === "GET" || method === "HEAD", [method]);

  const injectCookieHeader = (currentHeaders: string, cookieValue: string): string => {
    const cleaned = currentHeaders
      .split('\n')
      .filter(line => !line.trim().toLowerCase().startsWith('cookie:'))
      .filter(Boolean);
    cleaned.push(`Cookie: ${cookieValue}`);
    return cleaned.join('\n');
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

  const isResponseJson = useMemo(() => {
  if (!response) return false;
  return response.headers.some(([k, v]) =>
    k.toLowerCase() === 'content-type' && v.toLowerCase().includes('application/json')
  );
}, [response]);

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
      
      const res = await invoke<StudioResponse>('studio_send', { req });

      const isJsonContentType = res.headers.some(([k, v]) =>
      k.toLowerCase() === 'content-type' && v.toLowerCase().includes('application/json')
    );
    

      let finalRes = res;
      if (isJsonContentType) {
        try {
          const pretty = JSON.stringify(JSON.parse(res.body), null, 2);
          finalRes = { ...res, body: pretty };
        } catch {
        }
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

  const onMirrorToRequest = () => {
  if (!response?.body) return;
  setBody(response.body);
  setRequestTab('body');
};

const onImportCurl = async () => {
  try {
    const text = await navigator.clipboard.readText();
    const raw = text.trim();

    if (!raw.startsWith('curl')) {
      setError('Clipboard does not contain a cURL command.');
      return;
    }

    const urlMatch = raw.match(/['"]?(https?:\/\/[^\s'"\\]+)['"]?/);
    const parsedUrl = urlMatch?.[1] ?? '';

    const methodMatch = raw.match(/(?:-X|--request)\s+([A-Z]+)/);
    const VALID_METHODS = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'] as const;
    const raw_method = methodMatch?.[1] ?? 'GET';
    const parsedMethod = (VALID_METHODS.includes(raw_method as any) ? raw_method : 'GET') as HttpMethod;

    const headerMatches = [...raw.matchAll(/(?:-H|--header)\s+['"]([^'"]+)['"]/g)];
    const parsedHeaders = headerMatches
      .map(m => m[1])
      .filter(h => !h.toLowerCase().startsWith('content-length'))
      .join('\n');

const bodySingle = raw.match(/(?:--data-raw|--data-binary|--data|-d)\s+'([\s\S]*?)'/);

const bodyDouble = raw.match(/(?:--data-raw|--data-binary|--data|-d)\s+"([\s\S]*?)"/);
const parsedBody = bodySingle?.[1] ?? bodyDouble?.[1] ?? '';


    if (!parsedUrl) {
      setError('Could not parse a valid URL from the cURL command.');
      return;
    }

    // Fire all setters
    setUrl(parsedUrl);
    setMethod(parsedMethod);
    setHeadersInput(parsedHeaders);
    setBody(parsedBody);
    if (parsedBody) setRequestTab('body');
    setError(null);

  } catch {
    setError('Failed to read clipboard. Please grant clipboard permissions.');
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
      showMethodMenu, isLoading, error,
      response, previousResponse, responseTab, requestTab,
      showPocModal, pocTab, pocCopied,
      compareMode, showSmartLogin,
      isBodyDisabled, responseCookies, displayBody, codeLines, diffLines,
      activePocSnippet,isResponseJson,  
    },
    refs: {
      headersRef, bodyRef
    },
    setters: {
      setMethod, setUrl, setHeadersInput, setBody, setQueryParams,
      setShowMethodMenu, setIsLoading, setError,
      setResponse, setPreviousResponse, setResponseTab, setRequestTab,
      setShowPocModal, setPocTab, setPocCopied,
      setCompareMode, setShowSmartLogin
    },
    handlers: {
      updateQueryParams, applyTextMutation, onSend, onBeautifyResponse, onCopyPoc, injectCookieHeader, onMirrorToRequest,onImportCurl,
    }
  };
}