//! Native async crawler. Same-origin BFS over `href`/`src` links plus forced
//! browsing of sensitive paths. Every fetch goes through [`HttpClient::send`], so
//! the global secret filter runs on every body and findings are emitted via the sink.
//! Keeps the single sovereign binary (no external `katana` process).

use crate::core::result_aggregator::ScanResult;
use crate::http::HttpClient;
use crate::SinkRef;
use futures::{stream, StreamExt};
use regex::Regex;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::OnceLock;
use url::Url;

const CONCURRENCY: usize = 10;

/// Files probed in every discovered directory.
const SENSITIVE_FILES: &[&str] = &[".env", ".env.local", ".git/config", "config.json", ".DS_Store"];

pub async fn run_native_crawler(
    target: &str,
    max_depth: u32,
    max_urls: usize,
    same_origin: bool,
    client: Arc<HttpClient>,
    sink: SinkRef,
    abort: Arc<AtomicBool>,
) -> anyhow::Result<Vec<String>> {
    let base = Url::parse(target)?;
    let host = base.host_str().map(|h| h.to_lowercase());

    let mut visited: HashSet<String> = HashSet::new();
    let mut discovered: Vec<String> = Vec::new();
    visited.insert(target.to_string());
    let mut frontier = vec![target.to_string()];

    sink.on_log("info", &format!("[*] Native crawler on: {}", target));

    for _ in 0..=max_depth {
        if frontier.is_empty() || discovered.len() >= max_urls || abort.load(Ordering::Relaxed) {
            break;
        }

        let batches = stream::iter(frontier.drain(..).map(|u| {
            let client = Arc::clone(&client);
            let sink = sink.clone();
            async move { fetch_links(&client, &u, &sink).await }
        }))
        .buffer_unordered(CONCURRENCY)
        .collect::<Vec<_>>()
        .await;

        let mut next = Vec::new();
        for links in batches {
            for link in links {
                if discovered.len() >= max_urls {
                    break;
                }
                if !in_scope(&link, &host, same_origin) {
                    continue;
                }
                if visited.insert(link.clone()) {
                    discovered.push(link.clone());
                    next.push(link);
                }
            }
        }
        frontier = next;
    }

    if !abort.load(Ordering::Relaxed) {
        let probes = build_probes(&base, &discovered, &visited);
        let found = stream::iter(probes.into_iter().map(|u| {
            let client = Arc::clone(&client);
            let sink = sink.clone();
            async move { fetch_probe(&client, &u, &sink).await }
        }))
        .buffer_unordered(CONCURRENCY)
        .collect::<Vec<_>>()
        .await;

        for url in found.into_iter().flatten() {
            if !visited.contains(&url) {
                visited.insert(url.clone());
                discovered.push(url);
            }
        }
    }

    sink.on_log(
        "info",
        &format!("[*] Native crawler finished. URLs: {}", discovered.len()),
    );
    Ok(discovered)
}

async fn fetch_links(client: &HttpClient, url: &str, sink: &SinkRef) -> Vec<String> {
    let parsed = match Url::parse(url) {
        Ok(u) => u,
        Err(_) => return Vec::new(),
    };
    let req = crate::http::HttpRequest::new(
        reqwest::Method::GET,
        parsed,
        reqwest::header::HeaderMap::new(),
        String::new(),
    );
    match client.send(&req).await {
        Ok(cap) => {
            emit_secrets(sink, url, cap.status, &cap.secrets);
            extract_links(&cap.body, &cap.final_url)
        }
        Err(_) => Vec::new(),
    }
}

/// Fetches a forced-browse probe; emits secrets and returns the URL if it exists.
async fn fetch_probe(client: &HttpClient, url: &str, sink: &SinkRef) -> Option<String> {
    let parsed = Url::parse(url).ok()?;
    let req = crate::http::HttpRequest::new(
        reqwest::Method::GET,
        parsed,
        reqwest::header::HeaderMap::new(),
        String::new(),
    );
    let cap = client.send(&req).await.ok()?;
    emit_secrets(sink, url, cap.status, &cap.secrets);
    if cap.status < 400 {
        Some(url.to_string())
    } else {
        None
    }
}

fn emit_secrets(sink: &SinkRef, url: &str, status: u16, secrets: &[arkenar_secrets::Secret]) {
    for secret in secrets {
        sink.on_finding(&ScanResult {
            url: url.to_string(),
            vuln_type: format!("Sensitive Exposure [{}]", secret.kind),
            payload: secret.matched.clone(),
            timing_ms: 0,
            status_code: status,
            server: None,
            method: "GET".to_string(),
            request_headers: Vec::new(),
            request_body: None,
            tech_stack: Vec::new(),
            waf_detected: None,
            verified: true,
            notes: Some(format!("secret at line {}", secret.line)),
        });
    }
}

fn extract_links(body: &str, base: &Url) -> Vec<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r#"(?i)(?:href|src)\s*=\s*["']([^"'#]+)["']"#).expect("valid link regex")
    });

    let mut out = Vec::new();
    for caps in re.captures_iter(body) {
        let raw = caps[1].trim();
        if raw.is_empty()
            || raw.starts_with("javascript:")
            || raw.starts_with("mailto:")
            || raw.starts_with("data:")
            || raw.starts_with("tel:")
        {
            continue;
        }
        if let Ok(u) = base.join(raw) {
            if matches!(u.scheme(), "http" | "https") {
                out.push(u.to_string());
            }
        }
    }
    out
}

fn in_scope(url: &str, host: &Option<String>, same_origin: bool) -> bool {
    if !same_origin {
        return true;
    }
    match (Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.to_lowercase())), host) {
        (Some(h), Some(base_host)) => &h == base_host,
        _ => false,
    }
}

/// Builds the forced-browse probe set: sensitive files per discovered directory,
/// plus `*.js.map` for every discovered `.js` URL.
fn build_probes(base: &Url, discovered: &[String], visited: &HashSet<String>) -> Vec<String> {
    let mut dirs: HashSet<String> = HashSet::new();
    dirs.insert(dir_of(base));
    for u in discovered {
        if let Ok(parsed) = Url::parse(u) {
            dirs.insert(dir_of(&parsed));
        }
    }

    let mut probes: HashSet<String> = HashSet::new();
    for dir in &dirs {
        if let Ok(d) = Url::parse(dir) {
            for file in SENSITIVE_FILES {
                if let Ok(p) = d.join(file) {
                    probes.insert(p.to_string());
                }
            }
        }
    }
    for u in discovered {
        if u.ends_with(".js") {
            probes.insert(format!("{}.map", u));
        }
    }

    probes.retain(|p| !visited.contains(p));
    probes.into_iter().collect()
}

fn dir_of(u: &Url) -> String {
    let mut d = u.clone();
    d.set_query(None);
    d.set_fragment(None);
    let path = u.path();
    let dir = match path.rfind('/') {
        Some(i) => &path[..=i],
        None => "/",
    };
    d.set_path(dir);
    d.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ScanEventSink, ScanResult};
    use std::sync::Mutex;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[derive(Default)]
    struct CaptureSink {
        findings: Mutex<Vec<ScanResult>>,
    }
    impl ScanEventSink for CaptureSink {
        fn on_log(&self, _l: &str, _m: &str) {}
        fn on_finding(&self, r: &ScanResult) {
            self.findings.lock().unwrap().push(r.clone());
        }
        fn on_progress(&self, _p: &str, _c: usize, _t: usize) {}
    }

    fn respond(path: &str) -> String {
        let (status, ct, body) = match path {
            "/" => ("200 OK", "text/html", "<a href=\"/page2\">x</a>".to_string()),
            "/.env" => (
                "200 OK",
                "text/plain",
                "OPENAI_KEY=sk-proj-AbCd012345EfGh_QwErTyUiOp6789".to_string(),
            ),
            _ => ("404 Not Found", "text/plain", String::new()),
        };
        format!(
            "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            status,
            ct,
            body.len(),
            body
        )
    }

    #[tokio::test]
    async fn forced_browsing_finds_env_secret() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            loop {
                if let Ok((mut sock, _)) = listener.accept().await {
                    tokio::spawn(async move {
                        let mut buf = [0u8; 1024];
                        let n = sock.read(&mut buf).await.unwrap_or(0);
                        let req = String::from_utf8_lossy(&buf[..n]);
                        let path = req
                            .lines()
                            .next()
                            .and_then(|l| l.split_whitespace().nth(1))
                            .unwrap_or("/")
                            .to_string();
                        let _ = sock.write_all(respond(&path).as_bytes()).await;
                        let _ = sock.flush().await;
                    });
                }
            }
        });

        let client = Arc::new(HttpClient::new(5, None, &[], false).unwrap());
        let sink = Arc::new(CaptureSink::default());
        let target = format!("http://{}/", addr);

        let urls = run_native_crawler(
            &target,
            1,
            50,
            true,
            client,
            sink.clone(),
            Arc::new(AtomicBool::new(false)),
        )
        .await
        .unwrap();

        assert!(urls.iter().any(|u| u.ends_with("/page2")));

        let findings = sink.findings.lock().unwrap();
        assert!(findings
            .iter()
            .any(|f| f.vuln_type.contains("OpenAI") && f.url.ends_with("/.env")));
    }
}
