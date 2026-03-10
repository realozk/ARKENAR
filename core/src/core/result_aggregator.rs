use std::collections::HashSet;
use std::io::Write;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use url::Url;

use crate::SinkRef;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub url: String,
    pub vuln_type: String,
    pub payload: String,
    pub timing_ms: u128,
    pub status_code: u16,
    pub server: Option<String>,
    pub method: String,
    pub request_headers: Vec<(String, String)>,
    pub request_body: Option<String>,
}

impl ScanResult {
    /// Builds a curl command that reproduces this finding.
    ///
    /// Values from external server responses (headers, body) are shell-quoted
    /// using POSIX single-quote escaping so the reproduce string is safe to
    /// copy-paste into a terminal without shell injection risk.
    pub fn to_curl(&self) -> String {
        let mut parts = vec![format!("curl -X {} {}", self.method, shell_quote(&self.url))];
        for (k, v) in &self.request_headers {
            parts.push(format!("-H {}", shell_quote(&format!("{}: {}", k, v))));
        }
        if let Some(ref body) = self.request_body {
            if !body.is_empty() {
                parts.push(format!("--data-raw {}", shell_quote(body)));
            }
        }
        parts.push("--insecure".to_string());
        parts.join(" ")
    }
}

/// POSIX single-quote escaping: wraps `s` in single-quotes and escapes any
/// embedded single-quotes as `'\''`.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.split('\'').collect::<Vec<_>>().join("'\\''" ))
}

/// Builds a deduplication key from URL base path + vulnerability type.
fn build_dedup_key(url: &str, vuln_type: &str) -> String {
    let base_url = if let Ok(parsed) = Url::parse(url) {
        format!("{}://{}{}", parsed.scheme(), parsed.host_str().unwrap_or(""), parsed.path())
    } else {
        url.to_string()
    };

    let base_type = if let Some(pos) = vuln_type.find('[') {
        &vuln_type[..pos]
    } else {
        vuln_type
    };

    format!("{}|{}", base_url, base_type)
}

/// Collects, deduplicates, and reports scan results.
pub struct ResultAggregator;

impl ResultAggregator {
    pub async fn run(
        mut receiver: mpsc::Receiver<ScanResult>,
        output_path: &str,
        sink: SinkRef,
    ) -> Vec<ScanResult> {
        // Open the output file once; if it fails, log the error but continue
        // collecting results in memory so no findings are silently discarded.
        let mut file = if !output_path.is_empty() {
            match std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(output_path)
            {
                Ok(f) => Some(f),
                Err(e) => {
                    sink.on_log("error", &format!("[!] Failed to open output file '{}': {} — results will not be persisted to disk.", output_path, e));
                    None
                }
            }
        } else {
            None
        };

        let mut results = Vec::new();
        let mut seen = HashSet::new();

        while let Some(result) = receiver.recv().await {
            if result.vuln_type == "Safe" { continue; }

            let key = build_dedup_key(&result.url, &result.vuln_type);
            if !seen.insert(key) { continue; }

            sink.on_finding(&result);

            if let Some(ref mut f) = file {
                if let Ok(line) = serde_json::to_string(&result) {
                    let _ = writeln!(f, "{}", line);
                }
            }

            results.push(result);
        }
        results
    }

    pub fn report_summary(results: &[ScanResult], sink: &SinkRef) {
        let vulns: Vec<&ScanResult> = results.iter().filter(|r| r.vuln_type != "Safe").collect();

        if vulns.is_empty() {
            sink.on_log("success", "[+] No vulnerabilities found.");
        } else {
            let critical: Vec<&&ScanResult> = vulns.iter().filter(|r| {
                let v = r.vuln_type.to_lowercase();
                v.contains("sqli") || v.contains("sql")
            }).collect();
            let medium_count = vulns.len() - critical.len();

            sink.on_log("phase", "");
            sink.on_log("phase", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            sink.on_log("phase", &format!("  SCAN RESULTS — {} finding(s)", vulns.len()));
            sink.on_log("phase", &format!("  {} Critical  |  {} Medium", critical.len(), medium_count));
            sink.on_log("phase", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            for (i, v) in vulns.iter().enumerate() {
                let severity = {
                    let vl = v.vuln_type.to_lowercase();
                    if vl.contains("sqli") || vl.contains("sql") { "CRITICAL" } else { "MEDIUM" }
                };
                let level = if severity == "CRITICAL" { "error" } else { "warn" };
                sink.on_log(level, &format!(
                    "  #{} [{}] {} → {}",
                    i + 1, severity, v.vuln_type, v.url
                ));
            }

            sink.on_log("phase", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            sink.on_log("phase", "");
        }
    }
}