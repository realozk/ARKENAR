//! Native async crawler. Same-origin BFS over `href`/`src` links plus forced
//! browsing of sensitive paths. Every fetch goes through [`HttpClient::send`], so
//! the global secret filter runs on every body and findings are emitted via the sink.
//! Keeps the single sovereign binary (no external `katana` process).

use crate::core::result_aggregator::{classify_exposure, ScanResult, Verification};
use crate::http::HttpClient;
use crate::SinkRef;
use futures::{stream, StreamExt};
use regex::Regex;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::mpsc;
use url::Url;

const CONCURRENCY: usize = 10;

/// Files probed in every discovered directory. Wildcard classes (`*.sql`, `*.bak`,
/// `*.zip`) use concrete names — the prober joins exact paths and can't expand globs.
const SENSITIVE_FILES: &[&str] = &[
    // ── Environment / dotenv variants ──
    ".env",
    ".env.local",
    ".env.dev",
    ".env.development",
    ".env.prod",
    ".env.production",
    ".env.staging",
    ".env.backup",
    ".env.bak",
    ".env.save",
    ".env.old",
    // ── Exposed git internals (full repo reconstruction is 1.4; these confirm exposure) ──
    ".git/config",
    ".git/HEAD",
    ".git/index",
    // ── App / framework config ──
    "config.json",
    "config.php",
    "wp-config.php",
    "wp-config.php.bak",
    "web.config",
    "appsettings.json",
    ".npmrc",
    // ── CI/CD & container config ──
    ".gitlab-ci.yml",
    ".travis.yml",
    "docker-compose.yml",
    "Dockerfile",
    // ── Database dumps & backups ──
    "backup.sql",
    "dump.sql",
    "database.sql",
    "db.sql",
    "backup.zip",
    "backup.tar.gz",
    "backup.bak",
    "www.zip",
    // ── Server / auth artifacts & debug ──
    ".htpasswd",
    "phpinfo.php",
    // ── Editor / OS leftovers ──
    ".DS_Store",
];

#[allow(clippy::too_many_arguments)]
pub async fn run_native_crawler(
    target: &str,
    max_depth: u32,
    max_urls: usize,
    same_origin: bool,
    client: Arc<HttpClient>,
    sink: SinkRef,
    result_tx: mpsc::Sender<ScanResult>,
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
            let tx = result_tx.clone();
            async move { fetch_links(&client, &u, &tx).await }
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
        // Learn whether the host is a soft-404 sink before trusting any forced-browse 200.
        let soft_404 = host_serves_soft_404(&client, &base).await;
        if soft_404 {
            sink.on_log(
                "warn",
                "[~] Host answers success to unknown paths (soft-404 sink) — forced-browse hits downgraded to potential.",
            );
        }

        let probes = build_probes(&base, &discovered, &visited);
        let found = stream::iter(probes.into_iter().map(|u| {
            let client = Arc::clone(&client);
            let tx = result_tx.clone();
            async move { fetch_probe(&client, &u, soft_404, &tx).await }
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

async fn fetch_links(client: &HttpClient, url: &str, tx: &mpsc::Sender<ScanResult>) -> Vec<String> {
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
            // Inline secret in a crawled page — not a forced-browse artifact.
            let ct = content_type_of(&cap.headers);
            let verification = classify_exposure(cap.status, ct.as_deref(), false, false);
            emit_secrets(tx, url, cap.status, verification, None, &cap.secrets).await;
            extract_links(&cap.body, &cap.final_url)
        }
        Err(_) => Vec::new(),
    }
}

/// Probe a path that shouldn't exist. If the host answers `< 400`, it's a soft-404 sink
/// and a 200 on a sensitive path proves nothing.
async fn host_serves_soft_404(client: &HttpClient, base: &Url) -> bool {
    let nonce = format!("arkenar-soft404-probe-{:016x}", rand::random::<u64>());
    let probe = match base.join(&nonce) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let req = crate::http::HttpRequest::new(
        reqwest::Method::GET,
        probe,
        reqwest::header::HeaderMap::new(),
        String::new(),
    );
    match client.send(&req).await {
        Ok(cap) => cap.status < 400,
        Err(_) => false,
    }
}

/// Fetches a forced-browse probe; emits secrets and returns the URL if it exists.
/// `host_soft_404` downgrades every hit to "potential" when the host 200s everything.
async fn fetch_probe(
    client: &HttpClient,
    url: &str,
    host_soft_404: bool,
    tx: &mpsc::Sender<ScanResult>,
) -> Option<String> {
    let parsed = Url::parse(url).ok()?;
    let req = crate::http::HttpRequest::new(
        reqwest::Method::GET,
        parsed,
        reqwest::header::HeaderMap::new(),
        String::new(),
    );
    let cap = client.send(&req).await.ok()?;
    let ct = content_type_of(&cap.headers);
    let verification = classify_exposure(cap.status, ct.as_deref(), true, host_soft_404);
    // Capture the fetched artifact as evidence when the hit is verified.
    let loot = if verification.is_verified() && !cap.body.is_empty() {
        Some(truncate_loot(&cap.body))
    } else {
        None
    };
    emit_secrets(tx, url, cap.status, verification, loot, &cap.secrets).await;
    if cap.status < 400 {
        Some(url.to_string())
    } else {
        None
    }
}

/// Forwards each detected secret to the aggregator with its tier and any captured loot.
async fn emit_secrets(
    tx: &mpsc::Sender<ScanResult>,
    url: &str,
    status: u16,
    verification: Verification,
    loot: Option<String>,
    secrets: &[arkenar_secrets::Secret],
) {
    for secret in secrets {
        let _ = tx
            .send(ScanResult {
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
                verification,
                notes: Some(format!("secret at line {}", secret.line)),
                loot: loot.clone(),
            })
            .await;
    }
}

fn content_type_of(headers: &reqwest::header::HeaderMap) -> Option<String> {
    headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

/// Cap a captured artifact so a finding stays a reasonable size on disk / in the UI.
fn truncate_loot(body: &str) -> String {
    const MAX: usize = 4096;
    if body.len() <= MAX {
        return body.to_string();
    }
    let mut end = MAX;
    while !body.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &body[..end])
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
    match (
        Url::parse(url)
            .ok()
            .and_then(|u| u.host_str().map(|h| h.to_lowercase())),
        host,
    ) {
        (Some(h), Some(base_host)) => &h == base_host,
        _ => false,
    }
}

/// Builds the forced-browse probe set: sensitive files per discovered directory,
/// plus `*.js.map` for every discovered `.js` URL.
fn build_probes(base: &Url, discovered: &[String], visited: &HashSet<String>) -> Vec<String> {
    let mut dirs: HashSet<String> = HashSet::new();
    dirs.insert(dir_of(base));
    // Always probe the origin root, even when seeded at a deep path. Exposed config
    // (.env / .git/config / backups) almost always sits at the domain root, not the
    // sub-path the user happened to point at — and on a JS SPA the crawler discovers no
    // links, so the seed directory would otherwise be the *only* thing probed.
    if let Ok(root) = base.join("/") {
        dirs.insert(root.to_string());
    }
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
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// Crawler findings now flow through the result channel, so the sink only needs
    /// to absorb logs.
    #[derive(Default)]
    struct CaptureSink;
    impl ScanEventSink for CaptureSink {
        fn on_log(&self, _l: &str, _m: &str) {}
        fn on_finding(&self, _r: &ScanResult) {}
        fn on_progress(&self, _p: &str, _c: usize, _t: usize) {}
    }

    #[test]
    fn probe_set_covers_high_value_classes() {
        let base = Url::parse("http://h/app/").unwrap();
        let probes = build_probes(&base, &[], &HashSet::new());
        let has = |suffix: &str| probes.iter().any(|p| p.ends_with(suffix));
        // Each named class from the Phase 5 broadening is actually probed.
        assert!(has("/app/.env"), "dotenv");
        assert!(has("/app/.env.production"), "env variant");
        assert!(has("/app/.git/HEAD"), "git internals");
        assert!(has("/app/.git/index"), "git internals");
        assert!(has("/app/wp-config.php"), "wp-config");
        assert!(has("/app/backup.sql"), "db dump");
        assert!(has("/app/backup.zip"), "backup archive");
        assert!(has("/app/.gitlab-ci.yml"), "ci/cd config");
        assert!(has("/app/.htpasswd"), "auth artifact");
    }

    #[test]
    fn probes_origin_root_from_deep_path() {
        // Seeded at a deep SPA path, the prober must still hit the domain root — that's
        // where exposed config usually lives, and the crawler finds no links on an SPA.
        let base = Url::parse("http://h/ui/students/").unwrap();
        let probes = build_probes(&base, &[], &HashSet::new());
        assert!(probes.iter().any(|p| p == "http://h/.env"), "root .env");
        assert!(
            probes.iter().any(|p| p == "http://h/.git/config"),
            "root .git/config"
        );
        // …and the seed directory is still probed.
        assert!(
            probes.iter().any(|p| p == "http://h/ui/students/.env"),
            "seed-dir .env"
        );
    }

    fn respond(path: &str) -> String {
        let (status, ct, body) = match path {
            "/" => (
                "200 OK",
                "text/html",
                "<a href=\"/page2\">x</a>".to_string(),
            ),
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
                        // A single read() can return a partial segment (notably on
                        // macOS loopback), so loop until the request line is complete.
                        let mut buf = Vec::new();
                        let mut chunk = [0u8; 1024];
                        loop {
                            match sock.read(&mut chunk).await {
                                Ok(0) | Err(_) => break,
                                Ok(n) => {
                                    buf.extend_from_slice(&chunk[..n]);
                                    if buf.contains(&b'\n') {
                                        break;
                                    }
                                }
                            }
                        }
                        let req = String::from_utf8_lossy(&buf);
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
        let sink = Arc::new(CaptureSink);
        let (tx, mut rx) = mpsc::channel::<ScanResult>(100);
        let target = format!("http://{}/", addr);

        let urls = run_native_crawler(
            &target,
            1,
            50,
            true,
            client,
            sink.clone(),
            tx,
            Arc::new(AtomicBool::new(false)),
        )
        .await
        .unwrap();

        assert!(urls.iter().any(|u| u.ends_with("/page2")));

        // The crawler dropped its sender on return; drain the buffered findings.
        let mut findings = Vec::new();
        while let Ok(f) = rx.try_recv() {
            findings.push(f);
        }
        let env = findings
            .iter()
            .find(|f| f.vuln_type.contains("OpenAI") && f.url.ends_with("/.env"))
            .expect("the .env secret should be found");
        // Reachable 200, host is NOT a soft-404 sink (unknown paths 404), content is
        // text/plain — so the finding is verified and the artifact is captured.
        assert_eq!(env.verification, Verification::Reachable);
        assert!(env.is_verified());
        assert!(env.loot.as_deref().unwrap_or("").contains("OPENAI_KEY="));
    }

    /// A host that answers 200 to *every* path (a soft-404 sink) must have its
    /// forced-browse hits downgraded to "potential" — a 200 proves nothing there.
    fn respond_soft404(path: &str) -> String {
        let (ct, body) = if path == "/.env" {
            (
                "text/plain",
                "OPENAI_KEY=sk-proj-AbCd012345EfGh_QwErTyUiOp6789".to_string(),
            )
        } else {
            (
                "text/html",
                "<html>everything is fine here</html>".to_string(),
            )
        };
        // 200 for EVERYTHING, including unknown paths.
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            ct,
            body.len(),
            body
        )
    }

    #[tokio::test]
    async fn forced_browse_downgraded_on_soft_404_host() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            loop {
                if let Ok((mut sock, _)) = listener.accept().await {
                    tokio::spawn(async move {
                        // A single read() can return a partial segment (notably on
                        // macOS loopback), so loop until the request line is complete.
                        let mut buf = Vec::new();
                        let mut chunk = [0u8; 1024];
                        loop {
                            match sock.read(&mut chunk).await {
                                Ok(0) | Err(_) => break,
                                Ok(n) => {
                                    buf.extend_from_slice(&chunk[..n]);
                                    if buf.contains(&b'\n') {
                                        break;
                                    }
                                }
                            }
                        }
                        let req = String::from_utf8_lossy(&buf);
                        let path = req
                            .lines()
                            .next()
                            .and_then(|l| l.split_whitespace().nth(1))
                            .unwrap_or("/")
                            .to_string();
                        let _ = sock.write_all(respond_soft404(&path).as_bytes()).await;
                        let _ = sock.flush().await;
                    });
                }
            }
        });

        let client = Arc::new(HttpClient::new(5, None, &[], false).unwrap());
        let sink = Arc::new(CaptureSink);
        let (tx, mut rx) = mpsc::channel::<ScanResult>(100);
        let target = format!("http://{}/", addr);

        run_native_crawler(
            &target,
            1,
            50,
            true,
            client,
            sink.clone(),
            tx,
            Arc::new(AtomicBool::new(false)),
        )
        .await
        .unwrap();

        let mut findings = Vec::new();
        while let Ok(f) = rx.try_recv() {
            findings.push(f);
        }
        let env = findings
            .iter()
            .find(|f| f.vuln_type.contains("OpenAI") && f.url.ends_with("/.env"))
            .expect("the .env secret is still detected");
        // Detected, but the host 200s everything — so it is NOT verified, and no loot.
        assert_eq!(env.verification, Verification::Unverified);
        assert!(!env.is_verified());
        assert!(env.loot.is_none());
    }
}
