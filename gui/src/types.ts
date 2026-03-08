export interface ScanConfig {
  target: string;
  listFile: string;
  mode: "simple" | "advanced";
  threads: number;
  timeout: number;
  rateLimit: number;
  output: string;
  proxy: string;
  headers: string;
  tags: string;
  payloads: string;
  verbose: boolean;
  scope: boolean;
  dryRun: boolean;
  enableCrawler: boolean;
  enableNuclei: boolean;
  crawlerDepth: number;
  crawlerMaxUrls: number;
  crawlerTimeout: number;
  webhookUrl?: string;
  // Auth (v1.3)
  authToken?: string;
  authCookies?: string;
  authType: "none" | "bearer" | "cookie" | "custom";
  // Discovery (v1.3)
  enableJsAnalysis: boolean;
  enableParamFuzz: boolean;
  // OAST (Market-Killer)
  oastServer?: string;
  oastToken?: string;
  // Evasion (Market-Killer)
  enableWafEvasion: boolean;
}

export type LogLevel = "info" | "success" | "error" | "warn" | "phase";
export type ScanStatus = "idle" | "running" | "finished" | "error" | "stopping";

export interface LogEntry {
  time: string;
  level: LogLevel;
  message: string;
}

export interface ScanStatsEvent {
  targets: number;
  urls: number;
  critical: number;
  medium: number;
  safe: number;
  elapsed: string;
}

export interface ScanLogEvent {
  level: string;
  message: string;
}

export interface ScanFindingEvent {
  url: string;
  vuln_type: string;
  payload: string;
  status_code: number;
  timing_ms: number;
  server: string | null;
  curl_cmd: string;
}

// ── Exploit Studio ───────────────────────────────────────────────────────────────

export interface StudioRequest {
  url: string;
  method: string;
  headers: [string, string][];
  body?: string;
}

export interface StudioResponse {
  status: number;
  headers: [string, string][];
  body: string;
  bodyTruncated: boolean;
  timingMs: number;
}

export interface ScanHistoryEntry {
  id: string;
  date: string;
  target: string;
  elapsed: string;
  findingsCount: number;
  criticalCount: number;
  mediumCount: number;
  safeCount: number;
  urlsScanned: number;
  targetsCount: number;
}

export const DEFAULT_CONFIG: ScanConfig = {
  target: "",
  listFile: "",
  mode: "simple",
  threads: 50,
  timeout: 5,
  rateLimit: 100,
  output: "scan_results.json",
  proxy: "",
  headers: "",
  tags: "",
  payloads: "",
  verbose: false,
  scope: false,
  dryRun: false,
  enableCrawler: true,
  enableNuclei: true,
  crawlerDepth: 3,
  crawlerMaxUrls: 50,
  crawlerTimeout: 60,
  webhookUrl: "",
  // Auth
  authType: "none",
  authToken: "",
  authCookies: "",
  // Discovery
  enableJsAnalysis: false,
  enableParamFuzz: false,
  // OAST
  oastServer: "",
  oastToken: "",
  // Evasion
  enableWafEvasion: false,
};
