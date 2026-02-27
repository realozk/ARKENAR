use std::io::Write;
use std::process::Stdio;
use colored::*;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use crate::utils;

pub async fn run_nuclei_scan(target: &str, mode: &str, verbose: bool , custom_tags: Option<&str>) -> anyhow::Result<()> {
    let binary = match utils::get_binary_path("nuclei") {
        Some(path) => path,
        None => {
            eprint!("{}\r\n", "[!] Error: 'nuclei' binary not found.".red());
            return Ok(());
        }
    };

    let is_simple = mode != "advanced";

    let timeout = if is_simple { "5" } else { "10" };
    let concurrency = if is_simple { "25" } else { "50" };

    print!("{}\r\n", format!("[*] Launching Nuclei on: {}", target).bright_cyan());
    std::io::stdout().flush().ok();

    if verbose {
        print!("{}\r\n", format!("[DEBUG] , concurrency: {}",  concurrency).dimmed());
        std::io::stdout().flush().ok();
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
            print!("{}\r\n", format!("[*] Custom tags active: {}", tags).yellow());
            std::io::stdout().flush().ok();
        }
        args.extend_from_slice(&["-tags", tags]);
    } else {
        // No tags provided -> Apply Default Modes
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
            eprint!("{}\r\n", format!("[!] Failed to start Nuclei (is it installed?): {}", e).red().bold());
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
            let severity_colored = colorize_severity(severity_str);
            print!(
                "{} {} {} {} {}\r\n",
                "[+]".green().bold(),
                "NUCLEI:".white().bold(),
                vuln_name.yellow().bold(),
                severity_colored,
                format!("@ {}", matched_at).dimmed()
            );
            if verbose && !template_id.is_empty() {
                print!("{}\r\n", format!("    [DEBUG] Template: {}", template_id).dimmed());
            }
            std::io::stdout().flush().ok();
        }
    }

    let _ = child.wait().await;

    if count > 0 {
        print!("{}\r\n", format!("[*] Nuclei finished. {} finding(s).", count).green().bold());
    } else {
        print!("{}\r\n", "[*] Nuclei finished. No findings.".dimmed());
    }
    std::io::stdout().flush().ok();

    Ok(())
}

fn colorize_severity(severity: &str) -> ColoredString {
    match severity.to_lowercase().as_str() {
        "critical" => format!("[{}]", severity.to_uppercase()).red().bold(),
        "high" => format!("[{}]", severity.to_uppercase()).red(),
        "medium" => format!("[{}]", severity.to_uppercase()).yellow(),
        "low" => format!("[{}]", severity.to_uppercase()).blue(),
        _ => format!("[{}]", severity.to_uppercase()).dimmed(),
    }
}