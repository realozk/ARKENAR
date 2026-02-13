use std::collections::HashSet;
use std::io::Write;
use std::process::Stdio;
use colored::*;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use serde_json::Value;
use url::Url;
use crate::utils;

fn katana_binary() -> String {
    match utils::get_binary_path("katana") {
        Some(path) => path,
        None => {
            eprint!("{}\r\n", "Error: 'katana' binary not found. Run the scanner once to auto-install.".red());
            std::process::exit(1);
        }
    }
}

pub async fn run_katana_crawler(
    target: &str,
    mode: &str,
    verbose: bool,
    scope: bool,
) -> anyhow::Result<Vec<String>> {
    let binary = katana_binary();
    let is_simple = mode != "advanced";
    let depth = if is_simple { "2" } else { "5" };
    let max_urls: Option<usize> = if is_simple { Some(20) } else { None };

    if verbose {
        print!("[*] Starting Katana on target: {} (depth: {})\r\n", target, depth);
    } else {
        print!("[*] Starting Katana on target: {}\r\n", target);
    }
    std::io::stdout().flush().ok();

    let mut args = vec!["-u", target, "-jsonl", "-silent", "-d", depth];

    if is_simple {
        args.extend_from_slice(&["-crawl-duration", "30"]);
    }

    let mut child = Command::new(binary)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;

    let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("Failed to capture stdout from katana"))?;
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut seen: HashSet<String> = HashSet::new();

    let target_domain = Url::parse(target)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()));

    while let Ok(Some(raw_line)) = lines.next_line().await {
        let line = raw_line.trim().to_string();
        if line.is_empty() { continue; }

        let parsed: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let extracted = parsed
            .get("endpoint")
            .or_else(|| parsed.get("url"))
            .and_then(|val| val.as_str());

        let extracted = extracted.or_else(|| {
            parsed
                .get("request")
                .and_then(|req| req.get("endpoint").or_else(|| req.get("url")))
                .and_then(|val| val.as_str())
        });

        if let Some(url_str) = extracted {
            if scope {
                if let Ok(parsed_url) = Url::parse(url_str) {
                    let url_domain = parsed_url.host_str().map(|h| h.to_lowercase());
                    if url_domain != target_domain {
                        continue;
                    }
                }
            }

            if seen.insert(url_str.to_string()) {
                if verbose {
                    print!("[+] Discovered: {}\r\n", url_str);
                    std::io::stdout().flush().ok();
                }

                if let Some(limit) = max_urls {
                    if seen.len() >= limit {
                        print!("{}\r\n", format!("[*] Reached URL cap ({}) for simple mode. Stopping crawler.", limit).yellow());
                        std::io::stdout().flush().ok();
                        child.kill().await.ok();
                        break;
                    }
                }
            }
        }
    }

    let _ = child.wait().await;
    print!("[*] Katana finished. Total unique URLs: {}\r\n", seen.len());
    std::io::stdout().flush().ok();

    Ok(seen.into_iter().collect())
}