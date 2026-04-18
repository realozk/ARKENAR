use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use crate::utils;
use crate::SinkRef;

#[derive(Deserialize)]
struct SubfinderOut {
    host: Option<String>,
}

pub async fn run_subfinder(
    domain: &str,
    sink: SinkRef,
    abort: Arc<AtomicBool>,
) -> anyhow::Result<Vec<String>> {
    // Flag-injection guard: reject domains that would become CLI flags.
    if domain.starts_with('-') {
        sink.on_log("error", &format!(
            "[!] Refusing to pass '{}' to subfinder — starts with '-' (flag-injection guard).",
            domain
        ));
        return Ok(Vec::new());
    }

    let binary = match utils::get_binary_path("subfinder") {
        Some(p) => p,
        None => anyhow::bail!("'subfinder' binary not found. Run the scanner once to auto install, or use the CLI to trigger auto installation."),
    };

    sink.on_log("info", &format!("[*] Starting subfinder on domain: {}", domain));

    let mut std_cmd = std::process::Command::new(&binary);
    std_cmd.args(["-d", domain, "-silent", "-oJ"])
           .stdout(Stdio::piped())
           .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000);
    }

    let mut child = Command::from(std_cmd).spawn()?;

    let stdout = child.stdout.take()
        .ok_or_else(|| anyhow::anyhow!("Failed to capture stdout from subfinder"))?;
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut hosts: Vec<String> = Vec::new();

    while let Ok(Some(raw_line)) = lines.next_line().await {
        if abort.load(Ordering::Relaxed) {
            child.kill().await.ok();
            break;
        }

        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(out) = serde_json::from_str::<SubfinderOut>(line) {
            if let Some(host) = out.host {
                if !host.is_empty() {
                    hosts.push(host);
                }
            }
        }
    }

    let _ = child.wait().await;
    sink.on_log("info", &format!("[*] Subfinder finished. Total subdomains: {}", hosts.len()));

    Ok(hosts)
}
