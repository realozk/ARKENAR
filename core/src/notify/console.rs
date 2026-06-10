//! Terminal rendering — the human / quiet / JSON faces of a scan.
//!
//! The engine never prints; it only calls the sink. All presentation lives here.
//! Chrome (logs, progress) goes to stderr; findings go to stdout, so `--json`
//! and `--quiet` pipe cleanly (`arkenar … --json | jq`).

use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use colored::*;
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};

use crate::{ScanEventSink, ScanResult, SinkRef};

/// How a scan renders its output. Chosen once from CLI flags.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderMode {
    /// Default: colors, a live spinner, full finding detail.
    Rich,
    /// Findings only — no banner, config, progress, or logs.
    Quiet,
    /// One JSON object per finding to stdout; everything else suppressed.
    Json,
}

pub struct ConsoleSink {
    mode: RenderMode,
    verified_only: bool,
    mp: MultiProgress,
    spinner: Mutex<Option<ProgressBar>>,
}

impl ConsoleSink {
    pub fn new_ref(mode: RenderMode, verified_only: bool) -> SinkRef {
        Arc::new(Self {
            mode,
            verified_only,
            mp: MultiProgress::new(),
            spinner: Mutex::new(None),
        })
    }

    /// Updates (creating if needed) the single activity spinner. Rich mode only.
    fn spinner_set(&self, msg: &str) {
        if self.mode != RenderMode::Rich {
            return;
        }
        let mut guard = self.spinner.lock().unwrap();
        let pb = guard.get_or_insert_with(|| {
            let pb = self.mp.add(ProgressBar::new_spinner());
            pb.set_style(
                ProgressStyle::with_template("  {spinner:.cyan} {msg}")
                    .unwrap()
                    .tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ "),
            );
            pb.enable_steady_tick(Duration::from_millis(90));
            pb
        });
        pb.set_message(msg.to_string());
    }

    /// Chrome line (logs/phases) to stderr. Always written (even when stderr is
    /// not a TTY, where indicatif would silently drop `println`); the spinner is
    /// suspended around the write so it can't clash on a terminal.
    fn chrome(&self, line: String) {
        let active = self.spinner.lock().unwrap().is_some();
        if active {
            self.mp.suspend(|| eprintln!("{}", line));
        } else {
            eprintln!("{}", line);
        }
    }

    /// Data line (findings) to stdout, suspending the spinner so it can't clash.
    fn data(&self, text: String) {
        if self.mode == RenderMode::Rich {
            self.mp.suspend(|| {
                println!("{}", text);
                let _ = std::io::stdout().flush();
            });
        } else {
            println!("{}", text);
            let _ = std::io::stdout().flush();
        }
    }
}

impl ScanEventSink for ConsoleSink {
    fn on_log(&self, level: &str, message: &str) {
        match self.mode {
            RenderMode::Json => {
                if level == "error" || level == "warn" {
                    eprintln!("{}", message);
                }
            }
            RenderMode::Quiet => {
                if level == "error" {
                    eprintln!("{}", message);
                }
            }
            RenderMode::Rich => {
                let already_tagged = message.starts_with('[')
                    || message.starts_with("──")
                    || message.starts_with("━");
                let prefix = match level {
                    "success" if !already_tagged => "[+] ",
                    "error" if !already_tagged => "[!] ",
                    "warn" if !already_tagged => "[~] ",
                    "phase" if !already_tagged => "[*] ",
                    _ => "",
                };
                let combined = format!("{}{}", prefix, message);
                let colored = match level {
                    "success" => combined.green().to_string(),
                    "error" => combined.red().to_string(),
                    "warn" => combined.yellow().to_string(),
                    "phase" => combined.bright_cyan().bold().to_string(),
                    _ => combined,
                };
                // A phase line both stays in scrollback and drives the spinner.
                if level == "phase" && !message.trim().is_empty() {
                    self.spinner_set(message.trim_start_matches("[*] ").trim());
                }
                self.chrome(colored);
            }
        }
    }

    fn on_finding(&self, result: &ScanResult) {
        if self.verified_only && !result.verified {
            return;
        }

        match self.mode {
            RenderMode::Json => {
                if let Ok(line) = serde_json::to_string(result) {
                    self.data(line);
                }
            }
            RenderMode::Quiet => {
                let marker = if result.verified { "VERIFIED" } else { "potential" };
                self.data(format!("{}  {}  {}", marker, result.vuln_type, result.url));
            }
            RenderMode::Rich => {
                let marker = if result.verified {
                    "  ✓ VERIFIED".green().bold().to_string()
                } else {
                    "  ~ potential".bright_black().to_string()
                };
                let vl = result.vuln_type.to_lowercase();
                let colored_vuln = if vl.contains("sql") || vl.contains("rce") || vl.contains("command") {
                    result.vuln_type.red().bold().to_string()
                } else if vl.contains("xss") || vl.contains("ssrf") || vl.contains("path traversal") {
                    result.vuln_type.yellow().to_string()
                } else if vl.contains("open redirect") || vl.contains("sensitive") {
                    result.vuln_type.bright_yellow().to_string()
                } else {
                    result.vuln_type.cyan().to_string()
                };

                let mut block = String::new();
                block.push_str(&format!("\n{}  {}\n", marker, colored_vuln));
                block.push_str(&format!("    Target:  {}\n", result.url.white()));
                block.push_str(&format!("    Payload: {}\n", result.payload.bright_yellow()));
                block.push_str(&format!(
                    "    Info:    Status [{}] | Server [{}] | Time [{}ms]\n",
                    result.status_code.to_string().cyan(),
                    result.server.as_deref().unwrap_or("N/A").blue(),
                    result.timing_ms.to_string().dimmed()
                ));
                block.push_str(&format!("    curl:    {}\n", result.to_curl().dimmed()));
                block.push_str(
                    &"  ──────────────────────────────────────────"
                        .dimmed()
                        .to_string(),
                );
                self.data(block);
            }
        }
    }

    fn on_progress(&self, phase: &str, current: usize, total: usize) {
        if self.mode != RenderMode::Rich {
            return;
        }
        let msg = if total > 0 {
            format!("{} ({}/{})", phase, current, total)
        } else {
            phase.to_string()
        };
        self.spinner_set(&msg);
    }

    fn finish(&self) {
        if let Some(pb) = self.spinner.lock().unwrap().take() {
            pb.finish_and_clear();
        }
    }
}
