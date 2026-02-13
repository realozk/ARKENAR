use std::collections::HashSet;
use std::io::Write;
use colored::*;
use serde::Serialize;
use tokio::sync::mpsc;
use url::Url;

#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub url: String,
    pub vuln_type: String,
    pub payload: String,
    pub timing_ms: u128,
    pub status_code: u16,
    pub server: Option<String>,
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

/// Prints a line with explicit `\r\n` to prevent staircase effect
/// when external tools (Katana/Nuclei) leave the terminal in raw mode.
fn safe_println(text: &str) {
    print!("{}\r\n", text);
    std::io::stdout().flush().ok();
}

/// Collects, deduplicates, and reports scan results.
pub struct ResultAggregator;

impl ResultAggregator {
    /// Receives scan results from the channel, deduplicates, prints, and saves to file.
    pub async fn run(mut receiver: mpsc::Receiver<ScanResult>, output_path: &str) -> Vec<ScanResult> {
        let mut file = match std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(output_path)
        {
            Ok(f) => f,
            Err(e) => {
                eprint!("{}\r\n", format!("[!] Failed to open output file '{}': {}", output_path, e).red());
                std::process::exit(1);
            }
        };

        let mut results = Vec::new();
        let mut seen = HashSet::new();

        while let Some(result) = receiver.recv().await {
            if result.vuln_type == "Safe" { continue; }

            let key = build_dedup_key(&result.url, &result.vuln_type);
            if !seen.insert(key) { continue; }

            safe_println(&format!(
                "\n{} {} detected!",
                "[+]".green().bold(),
                result.vuln_type.red().bold()
            ));

            safe_println(&format!(
                "    Target:  {}",
                result.url.white()
            ));

            safe_println(&format!(
                "    Payload: {}",
                result.payload.bright_yellow()
            ));

            safe_println(&format!(
                "    Info:    Status [{}] | Server [{}] | Time [{}ms]",
                result.status_code.to_string().cyan(),
                result.server.as_deref().unwrap_or("N/A").blue(),
                result.timing_ms.to_string().dimmed()
            ));

            safe_println(&"──────────────────────────────────────────".dimmed().to_string());

            if let Ok(line) = serde_json::to_string(&result) {
                let _ = writeln!(file, "{}", line);
            }

            results.push(result);
        }
        results
    }

    /// Prints a summary of all findings after the scan completes.
    pub fn print_summary_report(results: &[ScanResult]) {
        let vulns: Vec<&ScanResult> = results.iter().filter(|r| r.vuln_type != "Safe").collect();

        safe_println(&format!("\n{}", "SCAN SUMMARY :".yellow().bold()));

        if vulns.is_empty() {
            safe_println(&format!("{}", "  No vulnerabilities found.".green()));
        } else {
            safe_println(&format!("  {} finding(s):\n", vulns.len().to_string().white().bold()));
            for (i, v) in vulns.iter().enumerate() {
                safe_println(&format!(
                    "  #{} {} → {}",
                    i + 1,
                    v.vuln_type.red().bold(),
                    v.url.white()
                ));
                safe_println(&format!(
                    "     Payload: {}",
                    v.payload.bright_yellow()
                ));
            }
        }
    }
}