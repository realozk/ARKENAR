pub mod core;
pub mod http;
pub mod modules;
pub mod utils;

use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub use crate::core::engine::ScanEngine;
pub use crate::core::result_aggregator::{ResultAggregator, ScanResult};
pub use crate::core::target_manager::TargetManager;
pub use crate::http::HttpClient;
pub use crate::modules::crawler::run_katana_crawler;
pub use crate::modules::nuclei::run_nuclei_scan;
pub use crate::utils::installer;
pub use crate::utils::read_lines;
pub use crate::core::state::ScanState;

/// Shared scan configuration used by both CLI and GUI.
///
/// Fields are grouped into logical tiers:
/// - Core (original v1.x fields)
/// - Auth (v1.3 — Deep Authentication & State Management)
/// - Discovery (v1.3 — JS Static Analysis & Dynamic Parameter Fuzzing)
/// - OAST (Market-Killer — Interactsh / Out-of-Band callbacks)
/// - Evasion (Market-Killer — Dynamic WAF Evasion Engine)
///
/// All new fields carry `#[serde(default)]` via the outer attribute.
/// Fields not sent by the GUI or CLI fall back to their `Default` value
/// without any breaking change to existing callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScanConfig {
    // ── Core ──────────────────────────────────────────────────────────────
    pub target: String,
    pub list_file: String,
    pub mode: String,
    pub threads: usize,
    pub timeout: u64,
    pub rate_limit: u64,
    pub output: String,
    pub proxy: String,
    pub headers: String,
    pub tags: String,
    pub payloads: String,
    pub verbose: bool,
    pub scope: bool,
    pub dry_run: bool,
    pub enable_crawler: bool,
    pub enable_nuclei: bool,
    pub crawler_depth: u32,
    pub crawler_max_urls: usize,
    pub crawler_timeout: u64,
    pub webhook_url: Option<String>,
    pub html_report: bool,
    pub resume: bool,

    // ── Auth (v1.3) ───────────────────────────────────────────────────────
    /// How to authenticate: "none" | "bearer" | "cookie" | "custom"
    pub auth_type: String,
    /// Bearer token value (used when auth_type = "bearer").
    pub auth_token: Option<String>,
    /// Raw Cookie header string (used when auth_type = "cookie").
    pub auth_cookies: Option<String>,

    // ── Discovery (v1.3) ──────────────────────────────────────────────────
    /// Enable JavaScript static analysis to extract hidden endpoints.
    pub enable_js_analysis: bool,
    /// Enable dynamic parameter fuzzing on discovered endpoints.
    pub enable_param_fuzz: bool,

    // ── OAST (Market-Killer) ──────────────────────────────────────────────
    /// Interactsh-compatible OAST server URL (e.g. "https://oast.pro").
    pub oast_server: Option<String>,
    /// API token for authenticated Interactsh servers.
    pub oast_token: Option<String>,

    // ── Evasion (Market-Killer) ───────────────────────────────────────────
    /// Activate WAF evasion mutation layer on consecutive 403 responses.
    pub enable_waf_evasion: bool,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            // Core
            target: String::new(),
            list_file: String::new(),
            mode: "simple".to_string(),
            threads: 50,
            timeout: 5,
            rate_limit: 100,
            output: "scan_results.json".to_string(),
            proxy: String::new(),
            headers: String::new(),
            tags: String::new(),
            payloads: String::new(),
            verbose: false,
            scope: false,
            dry_run: false,
            enable_crawler: true,
            enable_nuclei: true,
            crawler_depth: 3,
            crawler_max_urls: 50,
            crawler_timeout: 60,
            webhook_url: None,
            html_report: false,
            resume: false,
            // Auth
            auth_type: "none".to_string(),
            auth_token: None,
            auth_cookies: None,
            // Discovery
            enable_js_analysis: false,
            enable_param_fuzz: false,
            // OAST
            oast_server: None,
            oast_token: None,
            // Evasion
            enable_waf_evasion: false,
        }
    }
}

impl ScanConfig {
    pub fn header_list(&self) -> Vec<String> {
        if self.headers.is_empty() {
            Vec::new()
        } else {
            self.headers
                .split(';')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        }
    }

    pub fn parsed_headers(&self) -> Vec<(String, String)> {
        parse_custom_headers(&self.header_list())
    }

    pub fn proxy_ref(&self) -> Option<&str> {
        if self.proxy.is_empty() { None } else { Some(&self.proxy) }
    }

    pub fn tags_ref(&self) -> Option<&str> {
        if self.tags.is_empty() { None } else { Some(&self.tags) }
    }

    /// Returns the appropriate auth header(s) based on `auth_type`.
    ///
    /// - `"bearer"` → `[("Authorization", "Bearer <token>")]`
    /// - `"cookie"` → `[("Cookie", "<cookie-string>")]`
    /// - `"custom"` → delegates to `parsed_headers()` (from the `headers` field)
    /// - `"none"` / anything else → empty vec
    pub fn auth_headers(&self) -> Vec<(String, String)> {
        match self.auth_type.as_str() {
            "bearer" => {
                if let Some(ref token) = self.auth_token {
                    if !token.is_empty() {
                        return vec![("Authorization".to_string(), format!("Bearer {}", token))];
                    }
                }
                vec![]
            }
            "cookie" => {
                if let Some(ref cookies) = self.auth_cookies {
                    if !cookies.is_empty() {
                        return vec![("Cookie".to_string(), cookies.clone())];
                    }
                }
                vec![]
            }
            "custom" => self.parsed_headers(),
            _ => vec![],
        }
    }
}

pub fn parse_custom_headers(raw: &[String]) -> Vec<(String, String)> {
    raw.iter().filter_map(|h| {
        let mut parts = h.splitn(2, ':');
        let key = parts.next()?.trim().to_string();
        let val = parts.next().unwrap_or("").trim().to_string();
        if key.is_empty() { return None; }
        Some((key, val))
    }).collect()
}

/// Output abstraction for the scan pipeline.
/// CLI implements this with colored terminal output, GUI with Tauri events.
pub trait ScanEventSink: Send + Sync {
    fn on_log(&self, level: &str, message: &str);
    fn on_finding(&self, result: &ScanResult);
    fn on_progress(&self, phase: &str, current: usize, total: usize);
}

pub type SinkRef = Arc<dyn ScanEventSink>;

/// Terminal output sink for CLI usage.
pub struct ConsoleSink;

impl ConsoleSink {
    pub fn new_ref() -> SinkRef {
        Arc::new(Self)
    }
}

impl ScanEventSink for ConsoleSink {
    fn on_log(&self, level: &str, message: &str) {
        use colored::*;
        use std::io::Write;
        let colored = match level {
            "success" => message.green().to_string(),
            "error"   => message.red().to_string(),
            "warn"    => message.yellow().to_string(),
            "phase"   => message.bright_cyan().bold().to_string(),
            _         => message.to_string(),
        };
        print!("{}\r\n", colored);
        std::io::stdout().flush().ok();
    }

    fn on_finding(&self, result: &ScanResult) {
        use colored::*;
        use std::io::Write;
        let out = |text: &str| {
            print!("{}\r\n", text);
            std::io::stdout().flush().ok();
        };
        out(&format!(
            "\n{} {} detected!",
            "[+]".green().bold(),
            result.vuln_type.red().bold()
        ));
        out(&format!("    Target:  {}", result.url.white()));
        out(&format!("    Payload: {}", result.payload.bright_yellow()));
        out(&format!(
            "    Info:    Status [{}] | Server [{}] | Time [{}ms]",
            result.status_code.to_string().cyan(),
            result.server.as_deref().unwrap_or("N/A").blue(),
            result.timing_ms.to_string().dimmed()
        ));
        out(&format!("    curl:    {}", result.to_curl().dimmed()));
        out(&"──────────────────────────────────────────".dimmed().to_string());
    }

    fn on_progress(&self, phase: &str, current: usize, total: usize) {
        use colored::*;
        use std::io::Write;
        if total > 0 {
            print!("{}\r\n", format!("[*] {} ({}/{})", phase, current, total).bright_cyan());
        } else {
            print!("{}\r\n", format!("[*] {}", phase).bright_cyan());
        }
        std::io::stdout().flush().ok();
    }
}
