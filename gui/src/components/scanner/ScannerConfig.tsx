import type { ScanConfig } from "../../types";

const S: Record<string, React.CSSProperties> = {
  root: {
    width: 240,
    minWidth: 240,
    flexShrink: 0,
    background: "#141414",
    borderRight: "1px solid #2a2a2a",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: "12px 14px 8px",
    borderBottom: "1px solid #2a2a2a",
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "#ff6b35",
  },
  scroll: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "10px 14px 20px",
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "#ff6b35",
    marginBottom: 8,
    display: "block",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  rowLabel: {
    fontSize: 11,
    color: "#aaaaaa",
    fontFamily: "monospace",
    lineHeight: 1.3,
    flex: 1,
    minWidth: 0,
  },
  rowDesc: {
    fontSize: 10,
    color: "#666666",
    fontFamily: "monospace",
    marginTop: 1,
  },
  toggle: {
    position: "relative" as const,
    display: "inline-flex",
    alignItems: "center",
    width: 32,
    height: 18,
    borderRadius: 9,
    cursor: "pointer",
    transition: "background 0.2s",
    flexShrink: 0,
  },
  toggleThumb: {
    position: "absolute" as const,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#000",
    transition: "transform 0.2s",
  },
  input: {
    width: "100%",
    background: "#0d0d0d",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: "5px 8px",
    fontSize: 11,
    fontFamily: "monospace",
    color: "#e0e0e0",
    outline: "none",
    marginTop: 4,
    boxSizing: "border-box" as const,
  },
  numberInput: {
    width: 64,
    background: "#0d0d0d",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: "4px 6px",
    fontSize: 11,
    fontFamily: "monospace",
    color: "#e0e0e0",
    outline: "none",
    textAlign: "right" as const,
    flexShrink: 0,
  },
  modeRow: {
    display: "flex",
    background: "#0d0d0d",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 6,
  },
  divider: {
    borderTop: "1px solid #2a2a2a",
    margin: "14px 0",
  },
};

function modeBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "5px 0",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    border: "none",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    background: active ? "#ff6b35" : "transparent",
    color: active ? "#000" : "#666666",
    fontFamily: "monospace",
  };
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      style={{ ...S.toggle, background: checked ? "#ff6b35" : "#2a2a2a" }}
      onClick={() => onChange(!checked)}
    >
      <div style={{ ...S.toggleThumb, transform: checked ? "translateX(14px)" : "translateX(3px)" }} />
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}
function ToggleRow({ label, desc, checked, onChange }: ToggleRowProps) {
  return (
    <div style={S.row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.rowLabel}>{label}</div>
        {desc && <div style={S.rowDesc}>{desc}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

interface NumberRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}
function NumberRow({ label, value, onChange, min = 1, max = 1000 }: NumberRowProps) {
  return (
    <div style={S.row}>
      <span style={S.rowLabel}>{label}</span>
      <input
        type="number"
        style={S.numberInput}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
      />
    </div>
  );
}

interface ScannerConfigProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
}

export default function ScannerConfig({ config, onUpdate }: ScannerConfigProps) {
  return (
    <div style={S.root}>
      <div style={S.header}>
        <span style={S.headerLabel}>Config</span>
      </div>

      <div style={{ ...S.scroll, ...scrollbarStyle }}>
        <div style={S.section}>
          <span style={S.sectionLabel}>Mode</span>
          <div style={S.modeRow}>
            <button style={modeBtnStyle(config.mode === "simple")} onClick={() => onUpdate("mode", "simple")}>
              Simple
            </button>
            <button style={modeBtnStyle(config.mode === "advanced")} onClick={() => onUpdate("mode", "advanced")}>
              Advanced
            </button>
          </div>
        </div>

        <div style={S.divider} />

        <div style={S.section}>
          <span style={S.sectionLabel}>Modules</span>
          <ToggleRow label="Katana Crawler" desc="Deep URL discovery" checked={config.enableCrawler} onChange={(v) => onUpdate("enableCrawler", v)} />
          <ToggleRow label="Nuclei Scanner" desc="CVE template matching" checked={config.enableNuclei} onChange={(v) => onUpdate("enableNuclei", v)} />
          <ToggleRow label="JS Endpoint Analysis" desc="Hidden API endpoints in JS" checked={config.enableJsAnalysis} onChange={(v) => onUpdate("enableJsAnalysis", v)} />
          <ToggleRow label="Parameter Fuzzing" desc="Contextual payload per param" checked={config.enableParamFuzz} onChange={(v) => onUpdate("enableParamFuzz", v)} />
          <ToggleRow label="Smart Payloads" desc="Priority by param name" checked={config.enableSmartPayloads} onChange={(v) => onUpdate("enableSmartPayloads", v)} />
          <ToggleRow label="Fingerprinting" checked={config.enableFingerprint} onChange={(v) => onUpdate("enableFingerprint", v)} />
        </div>

        <div style={S.divider} />

        <div style={S.section}>
          <span style={S.sectionLabel}>Performance</span>
          <NumberRow label="Threads" value={config.threads} onChange={(v) => onUpdate("threads", v)} min={1} max={500} />
          <NumberRow label="Timeout (s)" value={config.timeout} onChange={(v) => onUpdate("timeout", v)} min={1} max={120} />
          <NumberRow label="Rate Limit (req/s)" value={config.rateLimit} onChange={(v) => onUpdate("rateLimit", v)} min={1} max={5000} />
        </div>

        {config.enableCrawler && (
          <>
            <div style={S.divider} />
            <div style={S.section}>
              <span style={S.sectionLabel}>Crawler</span>
              <NumberRow label="Depth" value={config.crawlerDepth} onChange={(v) => onUpdate("crawlerDepth", v)} min={1} max={10} />
              <NumberRow label="Timeout (s)" value={config.crawlerTimeout} onChange={(v) => onUpdate("crawlerTimeout", v)} min={10} max={300} />
              <NumberRow label="Max URLs" value={config.crawlerMaxUrls} onChange={(v) => onUpdate("crawlerMaxUrls", v)} min={5} max={1000} />
            </div>
          </>
        )}

        {config.mode === "advanced" && (
          <>
            <div style={S.divider} />
            <div style={S.section}>
              <span style={S.sectionLabel}>Advanced</span>
              <div style={{ marginBottom: 8 }}>
                <div style={S.rowLabel}>Proxy</div>
                <input style={S.input} type="text" value={config.proxy} placeholder="http://127.0.0.1:8080" onChange={(e) => onUpdate("proxy", e.target.value)} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={S.rowLabel}>Custom Headers</div>
                <input style={S.input} type="text" value={config.headers} placeholder="Auth: Bearer token" onChange={(e) => onUpdate("headers", e.target.value)} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={S.rowLabel}>Nuclei Tags</div>
                <input style={S.input} type="text" value={config.tags} placeholder="sqli,xss,lfi" onChange={(e) => onUpdate("tags", e.target.value)} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={S.rowLabel}>Output File</div>
                <input style={S.input} type="text" value={config.output} placeholder="scan_results.json" onChange={(e) => onUpdate("output", e.target.value)} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={S.rowLabel}>Scope Regex</div>
                <input style={S.input} type="text" value={config.scopeRegex} placeholder="^https?://target\.com" onChange={(e) => onUpdate("scopeRegex", e.target.value)} />
              </div>
              {config.enableNuclei && (
                <div style={{ marginBottom: 8 }}>
                  <div style={S.rowLabel}>Nuclei Templates Dir</div>
                  <input style={S.input} type="text" value={config.nucleiTemplatesDir} placeholder="~/.arkenar/plugins/nuclei" onChange={(e) => onUpdate("nucleiTemplatesDir", e.target.value)} />
                </div>
              )}
            </div>
          </>
        )}

        <div style={S.divider} />

        <div style={S.section}>
          <span style={S.sectionLabel}>Options</span>
          <ToggleRow label="Same-domain scope" checked={config.scope} onChange={(v) => onUpdate("scope", v)} />
          <ToggleRow label="Verbose" checked={config.verbose} onChange={(v) => onUpdate("verbose", v)} />
          <ToggleRow label="Dry Run" desc="No real requests sent" checked={config.dryRun} onChange={(v) => onUpdate("dryRun", v)} />
        </div>
      </div>
    </div>
  );
}

const scrollbarStyle: React.CSSProperties = {
  scrollbarWidth: "thin",
  scrollbarColor: "#333 #0d0d0d",
} as React.CSSProperties;
