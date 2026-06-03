use arkenar_core::{run_native_crawler, HttpClient, HttpRequest, ScanEventSink, ScanResult, SinkRef};
use sha2::{Digest, Sha256};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use url::Url;

#[derive(Default)]
struct CollectSink {
    items: Mutex<Vec<ScanResult>>,
}

impl ScanEventSink for CollectSink {
    fn on_log(&self, _level: &str, _msg: &str) {}
    fn on_finding(&self, r: &ScanResult) {
        self.items.lock().unwrap().push(r.clone());
    }
    fn on_progress(&self, _phase: &str, _cur: usize, _total: usize) {}
}

/// Passive scan: a same-origin crawl whose bodies pass through the global secret
/// filter. Returns `(reachable, findings)` — `reachable` is `false` when the base
/// fetch fails, so the caller can skip resolution and avoid false "fixed!" alerts.
pub async fn passive_scan(
    target: &str,
    client: Arc<HttpClient>,
    depth: u32,
    max_urls: usize,
    same_origin: bool,
    abort: Arc<AtomicBool>,
) -> (bool, Vec<ScanResult>) {
    let url = match Url::parse(target) {
        Ok(u) => u,
        Err(_) => return (false, Vec::new()),
    };
    if client.send(&HttpRequest::get(url)).await.is_err() {
        return (false, Vec::new());
    }

    let sink = Arc::new(CollectSink::default());
    let sink_ref: SinkRef = sink.clone();
    let _ = run_native_crawler(target, depth, max_urls, same_origin, client, sink_ref, abort).await;

    let items = std::mem::take(&mut *sink.items.lock().unwrap());
    (true, items)
}

/// Stable identity for diffing.
///
/// Secrets are keyed by `hash(value)` only — a leaked key is the same leak even when
/// the bundle is renamed on the next deploy (`main.4f3a.js → main.9b2c.js`). Other
/// findings key on canonical URL + base type.
pub fn identity(r: &ScanResult) -> String {
    if r.vuln_type.starts_with("Sensitive Exposure") {
        format!("secret:{}", sha256hex(&r.payload))
    } else {
        let base = r.vuln_type.split('[').next().unwrap_or(&r.vuln_type).trim();
        format!("vuln:{}|{}", canonical_url(&r.url), base)
    }
}

/// Redaction for the stored finding — shares the one implementation in core.
pub fn redact(s: &str) -> String {
    arkenar_core::notify::redact_secret(s)
}

fn sha256hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    h.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

fn canonical_url(u: &str) -> String {
    match Url::parse(u) {
        Ok(p) => format!(
            "{}://{}{}",
            p.scheme(),
            p.host_str().unwrap_or("").to_lowercase(),
            p.path()
        ),
        Err(_) => u.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret_at(url: &str, value: &str) -> ScanResult {
        ScanResult {
            url: url.to_string(),
            vuln_type: "Sensitive Exposure [OpenAI API Key]".to_string(),
            payload: value.to_string(),
            timing_ms: 0,
            status_code: 200,
            server: None,
            method: "GET".to_string(),
            request_headers: vec![],
            request_body: None,
            tech_stack: vec![],
            waf_detected: None,
            verified: true,
            notes: None,
        }
    }

    #[test]
    fn secret_identity_is_value_based_not_url() {
        // Same key in two differently-named bundles → same identity (no false NEW).
        let a = identity(&secret_at("https://x/main.4f3a.js", "sk-proj-SAMEKEY"));
        let b = identity(&secret_at("https://x/main.9b2c.js", "sk-proj-SAMEKEY"));
        assert_eq!(a, b);
    }

    #[test]
    fn different_secrets_differ() {
        let a = identity(&secret_at("https://x/a.js", "sk-proj-ONE"));
        let b = identity(&secret_at("https://x/a.js", "sk-proj-TWO"));
        assert_ne!(a, b);
    }

    #[test]
    fn redact_hides_middle() {
        let r = redact("sk-proj-AbCdEfGh0123456789wxyz");
        assert!(r.starts_with("sk-proj-"));
        assert!(r.ends_with("wxyz"));
        assert!(r.contains('…'));
    }
}
