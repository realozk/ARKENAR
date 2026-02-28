use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use crate::utils;
use crate::SinkRef;

pub async fn run_nuclei_scan(
    target: &str,
    mode: &str,
    verbose: bool,
    custom_tags: Option<&str>,
    sink: &SinkRef,
) -> anyhow::Result<()> {
    let binary = match utils::get_binary_path("nuclei") {
        Some(path) => path,
        None => {
            sink.on_log("error", "[!] Error: 'nuclei' binary not found.");
            return Ok(());
        }
    };

    let is_simple = mode != "advanced";

    let timeout = if is_simple { "5" } else { "10" };
    let concurrency = if is_simple { "25" } else { "50" };

    sink.on_log("phase", &format!("[*] Launching Nuclei on: {}", target));

    if verbose {
        sink.on_log("info", &format!("[DEBUG] concurrency: {}", concurrency));
    }

    let mut args = vec![
        "-u", target,
        "-jsonl", "-silent",
        "-severity",
        "-timeout", timeout,
        "-rate-limit", "50",
        "-c", concurrency,
    ];

    if let Some(tags) = custom_tags {
        if verbose {
            sink.on_log("info", &format!("[*] Custom tags active: {}", tags));
        }
        args.extend_from_slice(&["-tags", tags]);
    } else {
        if is_simple {
            args.extend_from_slice(&["-type", "dns,http"]);
            args.extend_from_slice(&["-severity", "high,critical"]);
        } else {
            args.extend_from_slice(&["-severity", "low,medium,high,critical"]);
        }
    }

    let mut child = match Command::new(binary)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            sink.on_log("error", &format!("[!] Failed to start Nuclei (is it installed?): {}", e));
            return Ok(());
        }
    };

    let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("Failed to capture stdout from nuclei"))?;
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut count: u32 = 0;

    while let Ok(Some(raw_line)) = lines.next_line().await {
        let line = raw_line.trim().to_string();
        if line.is_empty() { continue; }

        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let name = v.get("info")
            .and_then(|i| i.get("name"))
            .and_then(|n| n.as_str());

        let severity_str = v.get("info")
            .and_then(|i| i.get("severity"))
            .and_then(|s| s.as_str())
            .unwrap_or("unknown");

        let matched_at = v.get("matched-at")
            .or_else(|| v.get("matched_at"))
            .or_else(|| v.get("host"))
            .and_then(|m| m.as_str())
            .unwrap_or("N/A");

        let template_id = v.get("template-id")
            .or_else(|| v.get("template_id"))
            .and_then(|t| t.as_str())
            .unwrap_or("");

        if let Some(vuln_name) = name {
            count += 1;
            sink.on_log("success", &format!(
                "[+] NUCLEI: {} [{}] @ {}",
                vuln_name, severity_str.to_uppercase(), matched_at
            ));
            if verbose && !template_id.is_empty() {
                sink.on_log("info", &format!("    [DEBUG] Template: {}", template_id));
            }
        }
    }

    let _ = child.wait().await;

    if count > 0 {
        sink.on_log("success", &format!("[*] Nuclei finished. {} finding(s).", count));
    } else {
        sink.on_log("info", "[*] Nuclei finished. No findings.");
    }

    Ok(())
}