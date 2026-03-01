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
    pub fn to_curl(&self) -> String {
        let mut parts = vec![format!("curl -X {} '{}'", self.method, self.url)];
        for (k, v) in &self.request_headers {
            parts.push(format!("-H '{}: {}'", k, v));
        }
        if let Some(ref body) = self.request_body {
            if !body.is_empty() {
                parts.push(format!("-d '{}'", body));
            }
        }
        parts.push("--insecure".to_string());
        parts.join(" ")
    }
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
        let mut file = match std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(output_path)
        {
            Ok(f) => f,
            Err(e) => {
                sink.on_log("error", &format!("[!] Failed to open output file '{}': {}", output_path, e));
                return Vec::new();
            }
        };

        let mut results = Vec::new();
        let mut seen = HashSet::new();

        while let Some(result) = receiver.recv().await {
            if result.vuln_type == "Safe" { continue; }

            let key = build_dedup_key(&result.url, &result.vuln_type);
            if !seen.insert(key) { continue; }

            sink.on_finding(&result);

            if let Ok(line) = serde_json::to_string(&result) {
                let _ = writeln!(file, "{}", line);
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
            sink.on_log("warn", &format!("[+] {} finding(s) discovered:", vulns.len()));
            for (i, v) in vulns.iter().enumerate() {
                sink.on_log("error", &format!(
                    "  #{} {} → {} (payload: {})",
                    i + 1, v.vuln_type, v.url, v.payload
                ));
            }
        }
    }
}