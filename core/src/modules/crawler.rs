use std::collections::HashSet;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use serde::Deserialize;
use url::Url;
use crate::utils;
use crate::ScanConfig;
use crate::SinkRef;

#[derive(Deserialize, Debug)]
struct KatanaRequest {
    endpoint: Option<String>,
    url: Option<String>,
}

#[derive(Deserialize, Debug)]
struct KatanaOutput {
    endpoint: Option<String>,
    url: Option<String>,
    request: Option<KatanaRequest>,
}

impl KatanaOutput {
    fn extract_url(&self) -> Option<String> {
        if let Some(ref e) = self.endpoint { return Some(e.clone()); }
        if let Some(ref u) = self.url { return Some(u.clone()); }
        if let Some(ref req) = self.request {
            if let Some(ref e) = req.endpoint { return Some(e.clone()); }
            if let Some(ref u) = req.url { return Some(u.clone()); }
        }
        None
    }
}

fn katana_binary() -> anyhow::Result<String> {
    match utils::get_binary_path("katana") {
        Some(path) => Ok(path),
        None => {
            anyhow::bail!("'katana' binary not found. Run the scanner once to auto-install, or use the CLI to trigger auto-installation.");
        }
    }
}

pub async fn run_katana_crawler(
    target: &str,
    config: &ScanConfig,
    sink: &SinkRef,
    abort: Arc<AtomicBool>,
) -> anyhow::Result<Vec<String>> {
    let binary = katana_binary()?;
    let depth_str = config.crawler_depth.to_string();
    let timeout_str = format!("{}s", config.crawler_timeout); 
    let max_urls = config.crawler_max_urls;

    if config.verbose {
        sink.on_log("info", &format!("[*] Starting Katana on target: {} (depth: {}, timeout: {}, max: {})", target, depth_str, timeout_str, max_urls));
    } else {
        sink.on_log("info", &format!("[*] Starting Katana on target: {}", target));
    }

    let args = vec!["-u", target, "-jsonl", "-silent", "-d", &depth_str, "-crawl-duration", &timeout_str, "-timeout", "15", "-duc"];

    let mut std_cmd = std::process::Command::new(&binary);
    std_cmd.args(&args)
           .stdout(Stdio::piped())
           .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = Command::from(std_cmd).spawn()?;

    let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("Failed to capture stdout from katana"))?;
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut seen: HashSet<String> = HashSet::new();

    let target_domain = Url::parse(target)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()));

    while let Ok(Some(raw_line)) = lines.next_line().await {
        if abort.load(Ordering::Relaxed) {
            child.kill().await.ok();
            break;
        }

        let line = raw_line.trim();
        if line.is_empty() { continue; }

        let parsed: KatanaOutput = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if let Some(url_str) = parsed.extract_url() {
            if config.scope {
                if let Ok(parsed_url) = Url::parse(&url_str) {
                    let url_domain = parsed_url.host_str().map(|h| h.to_lowercase());
                    if url_domain != target_domain {
                        continue;
                    }
                }
            }

            if seen.insert(url_str.clone()) {
                if config.verbose {
                    sink.on_log("info", &format!("[+] Discovered: {}", url_str));
                }

                if seen.len() >= max_urls {
                    sink.on_log("warn", &format!("[*] Reached URL cap ({}). Stopping crawler.", max_urls));
                    child.kill().await.ok();
                    break;
                }
            }
        }
    }

    let _ = child.wait().await;
    sink.on_log("info", &format!("[*] Katana finished. Total unique URLs: {}", seen.len()));

    let has_injectable = seen.iter().any(|u| u.contains('?') && u.contains('='));
    if !has_injectable && !seen.is_empty() {
        sink.on_log("warn", "[!] No injection points (?key=value) discovered. Fuzzing engine may return 0 vulnerabilities.");
    }

    Ok(seen.into_iter().collect())
}