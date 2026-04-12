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
  htmlReport: boolean;
  enableFingerprint: boolean;
  scopeRegex: string;
  wafEvasionThreshold: number;
  enableSmartPayloads: boolean;
  nucleiTemplatesDir: string;
  enableJsAnalysis: boolean;
  enableParamFuzz: boolean;
}

export type LogLevel = "info" | "success" | "error" | "warn" | "phase";
export type ScanStatus = "idle" | "running" | "finished" | "error" | "stopping";

export interface LogEntry {
  id: string;
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
  tech_stack: string[];
  waf_detected: string | null;
  verified: boolean;
  notes: string | null;
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
  htmlReport: false,
  enableFingerprint: true,
  scopeRegex: "",
  wafEvasionThreshold: 5,
  enableSmartPayloads: true,
  nucleiTemplatesDir: "",
  enableJsAnalysis: false,
  enableParamFuzz: false,
};

export interface ReconDns {
  a: string[];
  mx: string[];
  txt: string[];
  cname: string | null;
  whois: string;
}

export interface ReconJsSecret {
  url: string;
  secret_type: string;
  matched_value: string;
  line_number: number;
}

export interface ReconHost {
  host: string;
  ports: number[];
  dns: ReconDns | null;
  jsSecrets: ReconJsSecret[];
}

export interface EnvVar {
  id: string;
  key: string;    
  value: string;  
}
export interface FuzzResult {
  id: string;
  payload: string;
  status: number;
  responseTime: number;
  responseLength: number;
  responseBody: string;
  error: string | null;
}

export interface FuzzConfig {
  anchor: string;          
  field: "url" | "body";  
  payloads: string[];      
  concurrency: number;      
}

export interface AliveResult {
  url: string;
  status_code: number;
  title: string;
  tech_stack: string[];
  content_length: number;
}

export interface ReconNote {
  id: string;
  target: string;
  note: string;
  timestamp: string;
}
