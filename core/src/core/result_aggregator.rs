use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use url::Url;

use crate::SinkRef;

/// Bump when the serialized shape of a finding changes (the `--json` shape is a contract).
pub const SCHEMA_VERSION: u32 = 1;

/// How strongly a finding is proven.
/// * `Unverified` — detected only; surfaced as "potential." Injection stays here until 1.5.
/// * `Reachable`  — live `200`, not a soft-404, content-type sane.
/// * `Live`       — proven against the provider (`--verify-live`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Verification {
    #[default]
    Unverified,
    Reachable,
    Live,
}

impl Verification {
    pub fn is_verified(self) -> bool {
        !matches!(self, Verification::Unverified)
    }
}

/// Verification tier for a detected secret. `Reachable` needs a live `200`, a non-soft-404
/// host, and — for forced-browse config files — a non-HTML body (an HTML page is an
/// error/login stand-in, not the artifact). Anything else stays `Unverified`.
pub fn classify_exposure(
    status: u16,
    content_type: Option<&str>,
    forced_browse_file: bool,
    host_serves_soft_404: bool,
) -> Verification {
    if status != 200 || host_serves_soft_404 {
        return Verification::Unverified;
    }
    if forced_browse_file {
        // A real .env / .git/config is text/plain or octet-stream — not an HTML page.
        if let Some(ct) = content_type {
            if ct.to_ascii_lowercase().contains("text/html") {
                return Verification::Unverified;
            }
        }
    }
    Verification::Reachable
}

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
    #[serde(default)]
    pub tech_stack: Vec<String>,
    #[serde(default)]
    pub waf_detected: Option<String>,
    #[serde(default)]
    pub verification: Verification,
    #[serde(default)]
    pub notes: Option<String>,
    /// Captured evidence for a proven finding (e.g. the fetched `.env` / config body).
    #[serde(default)]
    pub loot: Option<String>,
}

impl ScanResult {
    pub fn is_verified(&self) -> bool {
        self.verification.is_verified()
    }

    /// A JSON line for `--json` / file output, with `schema_version` injected.
    pub fn to_json_line(&self) -> serde_json::Result<String> {
        let mut value = serde_json::to_value(self)?;
        if let serde_json::Value::Object(ref mut map) = value {
            map.insert(
                "schema_version".to_string(),
                serde_json::Value::from(SCHEMA_VERSION),
            );
        }
        serde_json::to_string(&value)
    }

    /// Builds a curl command that reproduces this finding.
    ///
    /// Values from external server responses (headers, body) are shell-quoted
    /// using POSIX single-quote escaping so the reproduce string is safe to
    /// copy-paste into a terminal without shell injection risk.
    pub fn to_curl(&self) -> String {
        let mut parts = vec![format!(
            "curl -X {} {}",
            self.method,
            shell_quote(&self.url)
        )];
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
    format!("'{}'", s.split('\'').collect::<Vec<_>>().join("'\\''"))
}

/// Builds a deduplication key from URL base path + vulnerability type.
fn build_dedup_key(url: &str, vuln_type: &str) -> String {
    let base_url = if let Ok(parsed) = Url::parse(url) {
        format!(
            "{}://{}{}",
            parsed.scheme(),
            parsed.host_str().unwrap_or(""),
            parsed.path()
        )
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
    /// Drains the result channel, deduplicates, and forwards each finding to the sink as a
    /// live preview. Persistence is deferred to [`write_results_file`](Self::write_results_file),
    /// run *after* the scan and any `--verify-live` pass — so the JSONL on disk reflects the
    /// final verification tier (a dead key dropped, a probed key marked `live`), not the
    /// mid-scan guess.
    pub async fn run(mut receiver: mpsc::Receiver<ScanResult>, sink: SinkRef) -> Vec<ScanResult> {
        let mut results = Vec::new();
        let mut seen = HashSet::new();

        while let Some(result) = receiver.recv().await {
            if result.vuln_type == "Safe" {
                continue;
            }

            let key = build_dedup_key(&result.url, &result.vuln_type);
            if !seen.insert(key) {
                continue;
            }

            sink.on_finding(&result);
            results.push(result);
        }
        results
    }

    /// Appends the final result set to the JSONL output file — one finding per line, each
    /// carrying `schema_version`. Called once the result set is final (post `--verify-live`),
    /// so what lands on disk matches the tiers shown in the summary.
    pub async fn write_results_file(output_path: &str, results: &[ScanResult], sink: &SinkRef) {
        if output_path.is_empty() || results.is_empty() {
            return;
        }
        let mut file = match tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(output_path)
            .await
        {
            Ok(f) => f,
            Err(e) => {
                sink.on_log("error", &format!("[!] Failed to open output file '{}': {} — results will not be persisted to disk.", output_path, e));
                return;
            }
        };
        for result in results {
            match result.to_json_line() {
                Ok(line) => {
                    if let Err(e) = file.write_all(format!("{}\n", line).as_bytes()).await {
                        sink.on_log(
                            "error",
                            &format!(
                                "[!] Failed to write result to '{}': {} — aborting further writes.",
                                output_path, e
                            ),
                        );
                        return;
                    }
                }
                Err(e) => sink.on_log(
                    "warn",
                    &format!("[!] Failed to serialize result for {}: {}", result.url, e),
                ),
            }
        }

        // tokio::fs::File does not flush on drop (unlike std), so an explicit flush is
        // required or buffered writes can be lost when this function returns.
        if let Err(e) = file.flush().await {
            sink.on_log(
                "error",
                &format!("[!] Failed to flush output file '{}': {}", output_path, e),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_exposure, ResultAggregator, ScanResult, Verification, SCHEMA_VERSION};

    /// Regression: the JSONL on disk must carry the *final* verification tier (what a
    /// post-scan `--verify-live` pass produced), not the mid-scan guess. Writing is
    /// deferred out of the aggregator loop precisely so this holds.
    #[tokio::test]
    async fn write_results_file_reflects_final_tier() {
        struct Noop;
        impl crate::ScanEventSink for Noop {
            fn on_log(&self, _l: &str, _m: &str) {}
            fn on_finding(&self, _r: &ScanResult) {}
            fn on_progress(&self, _p: &str, _c: usize, _t: usize) {}
        }
        let sink: crate::SinkRef = std::sync::Arc::new(Noop);

        let path = std::env::temp_dir().join(format!(
            "arkenar_write_test_{}_{}.jsonl",
            std::process::id(),
            SCHEMA_VERSION
        ));
        let path_str = path.to_str().unwrap();
        let _ = std::fs::remove_file(&path);

        let legacy = r#"{"url":"http://x/.env","vuln_type":"Sensitive Exposure [OpenAI API Key]","payload":"sk","timing_ms":1,"status_code":200,"server":null,"method":"GET","request_headers":[],"request_body":null}"#;
        let mut r: ScanResult = serde_json::from_str(legacy).unwrap();
        r.verification = Verification::Live; // the tier a post-scan probe assigned

        ResultAggregator::write_results_file(path_str, std::slice::from_ref(&r), &sink).await;

        let contents = std::fs::read_to_string(&path).unwrap();
        let v: serde_json::Value = serde_json::from_str(contents.lines().next().unwrap()).unwrap();
        assert_eq!(v["verification"], "live");
        assert_eq!(v["schema_version"], SCHEMA_VERSION);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_legacy_scan_result_deserializes() {
        let json = r#"{"url":"http://x.com","vuln_type":"SQLi","payload":"'","timing_ms":10,"status_code":200,"server":null,"method":"GET","request_headers":[],"request_body":null}"#;
        let r: ScanResult = serde_json::from_str(json).unwrap();
        assert!(r.tech_stack.is_empty());
        // Legacy JSON has no `verification` field → serde default → Unverified.
        assert_eq!(r.verification, Verification::Unverified);
        assert!(!r.is_verified());
        assert!(r.loot.is_none());
    }

    #[test]
    fn json_line_carries_schema_version() {
        let json = r#"{"url":"http://x.com","vuln_type":"SQLi","payload":"'","timing_ms":10,"status_code":200,"server":null,"method":"GET","request_headers":[],"request_body":null}"#;
        let r: ScanResult = serde_json::from_str(json).unwrap();
        let line = r.to_json_line().unwrap();
        let v: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["schema_version"], SCHEMA_VERSION);
        assert_eq!(v["verification"], "unverified");
    }

    #[test]
    fn classify_exposure_tiers() {
        // Live 200, non-soft-404, sane content → Reachable.
        assert_eq!(
            classify_exposure(200, Some("text/plain"), true, false),
            Verification::Reachable
        );
        // A config file served as HTML is an error/login page, not the artifact.
        assert_eq!(
            classify_exposure(200, Some("text/html"), true, false),
            Verification::Unverified
        );
        // Host that 200s everything — a 200 means nothing.
        assert_eq!(
            classify_exposure(200, Some("text/plain"), true, true),
            Verification::Unverified
        );
        // Non-200 is never reachable.
        assert_eq!(
            classify_exposure(404, Some("text/plain"), true, false),
            Verification::Unverified
        );
        // An inline secret in a normal served page (not forced-browse) — HTML is fine.
        assert_eq!(
            classify_exposure(200, Some("text/html"), false, false),
            Verification::Reachable
        );
    }
}
