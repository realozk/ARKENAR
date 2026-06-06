pub mod core;
#[path = "deep-hunter/brain.rs"]
pub mod deep_hunter;
pub mod http;
pub mod modules;
pub mod notify;
pub mod utils;
pub mod validation;

use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub use crate::core::engine::ScanEngine;
pub use crate::core::result_aggregator::{ResultAggregator, ScanResult};
pub use crate::core::state::ScanState;
pub use crate::core::target_manager::TargetManager;
pub use crate::http::{HttpClient, HttpRequest};
pub use crate::notify::{CompositeSink, TelegramNotifier, WebhookNotifier};
pub use crate::modules::crawler::run_katana_crawler;
pub use crate::modules::crawler_native::run_native_crawler;
pub use crate::modules::nuclei::run_nuclei_scan;
pub use crate::utils::installer;
pub use crate::utils::read_lines;

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
    pub enable_fingerprint: bool,
    pub scope_regex: String,
    pub nuclei_templates_dir: String,
    pub enable_smart_payloads: bool,

    /// If true, accept invalid TLS certificates. Defaults to false.
    /// Enable only when explicitly opted in by the user — MITM-able when true.
    pub allow_insecure_tls: bool,

    // ── Auth (v1.3) ───────────────────────────────────────────────────────
    pub auth_type: String,
    pub auth_token: Option<String>,
    pub auth_cookies: Option<String>,

    // ── Discovery (v1.3) ──────────────────────────────────────────────────
    pub enable_js_analysis: bool,
    pub enable_param_fuzz: bool,

    // ── OAST (Market-Killer) ──────────────────────────────────────────────
    pub oast_server: Option<String>,
    pub oast_token: Option<String>,

    // ── Evasion (Market-Killer) ───────────────────────────────────────────
    pub enable_waf_evasion: bool,
    pub waf_evasion_threshold: u32,
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
            enable_fingerprint: true,
            scope_regex: String::new(),
            nuclei_templates_dir: String::new(),
            enable_smart_payloads: true,
            allow_insecure_tls: false,
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
            waf_evasion_threshold: 5,
        }
    }
}

impl ScanConfig {
    pub fn header_list(&self) -> Vec<String> {
        if self.headers.is_empty() {
            Vec::new()
        } else {
            self.headers
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        }
    }

    pub fn parsed_headers(&self) -> Vec<(String, String)> {
        parse_custom_headers(&self.header_list())
    }

    pub fn proxy_ref(&self) -> Option<&str> {
        if self.proxy.is_empty() {
            None
        } else {
            Some(&self.proxy)
        }
    }

    pub fn tags_ref(&self) -> Option<&str> {
        if self.tags.is_empty() {
            None
        } else {
            Some(&self.tags)
        }
    }

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
    raw.iter()
        .filter_map(|h| {
            let mut parts = h.splitn(2, ':');
            let key = parts.next()?.trim().to_string();
            let val = parts.next().unwrap_or("").trim().to_string();
            if key.is_empty() {
                return None;
            }

            // Strict validation on key
            const KEY_FORBIDDEN: &[char] = &[
                ';', '&', '|', '`', '$', '>', '<', '\\', '(', ')', '{', '}', '\0', '=', ',',
            ];
            if key.chars().any(|c| KEY_FORBIDDEN.contains(&c)) {
                return None;
            }

            // Loose validation on value (allow =, ;, , space)
            const VAL_FORBIDDEN: &[char] =
                &['&', '|', '`', '$', '>', '<', '\\', '(', ')', '{', '}', '\0'];
            if val.chars().any(|c| VAL_FORBIDDEN.contains(&c)) {
                return None;
            }

            Some((key, val))
        })
        .collect()
}

pub trait ScanEventSink: Send + Sync {
    fn on_log(&self, level: &str, message: &str);
    fn on_finding(&self, result: &ScanResult);
    fn on_progress(&self, phase: &str, current: usize, total: usize);
}

pub type SinkRef = Arc<dyn ScanEventSink>;

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
        let already_tagged = message.starts_with('[') || message.starts_with("──");
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
        let vuln_lower = result.vuln_type.to_lowercase();
        let colored_vuln = if vuln_lower.contains("sql")
            || vuln_lower.contains("rce")
            || vuln_lower.contains("command")
        {
            result.vuln_type.red().bold().to_string()
        } else if vuln_lower.contains("xss")
            || vuln_lower.contains("ssrf")
            || vuln_lower.contains("path traversal")
        {
            result.vuln_type.yellow().to_string()
        } else if vuln_lower.contains("open redirect") || vuln_lower.contains("sensitive") {
            result.vuln_type.bright_yellow().to_string()
        } else {
            result.vuln_type.cyan().to_string()
        };
        out(&format!(
            "\n{} {} detected!",
            "[+]".green().bold(),
            colored_vuln
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
        out(&"──────────────────────────────────────────"
            .dimmed()
            .to_string());
    }

    fn on_progress(&self, phase: &str, current: usize, total: usize) {
        use colored::*;
        use std::io::Write;
        if total > 0 {
            print!(
                "{}\r\n",
                format!("[*] {} ({}/{})", phase, current, total).bright_cyan()
            );
        } else {
            print!("{}\r\n", format!("[*] {}", phase).bright_cyan());
        }
        std::io::stdout().flush().ok();
    }
}
