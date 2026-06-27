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
pub use crate::core::result_aggregator::{
    classify_exposure, ResultAggregator, ScanResult, Verification, SCHEMA_VERSION,
};
pub use crate::core::state::ScanState;
pub use crate::core::target_manager::TargetManager;
pub use crate::http::{HttpClient, HttpRequest};
pub use crate::notify::{CompositeSink, TelegramNotifier, WebhookNotifier};
pub use crate::modules::crawler_native::run_native_crawler;
pub use crate::modules::key_verifier::{verify_live, VerifyStats};
pub use crate::modules::dns_lookup::{resolve_domain, DnsResult};
pub use crate::modules::port_scanner::scan_ports;
pub use crate::modules::subfinder::run_subfinder;
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
    pub payloads: String,
    pub verbose: bool,
    pub scope: bool,
    pub dry_run: bool,
    pub enable_crawler: bool,
    pub crawler_depth: u32,
    pub crawler_max_urls: usize,
    pub crawler_timeout: u64,
    pub webhook_url: Option<String>,
    pub html_report: bool,
    pub resume: bool,
    pub enable_fingerprint: bool,
    pub scope_regex: String,
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

    // ── Live verification (1.3) ───────────────────────────────────────────
    /// Opt-in: probe each detected key against its provider's auth endpoint.
    pub verify_live: bool,
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
            payloads: String::new(),
            verbose: false,
            scope: false,
            dry_run: false,
            enable_crawler: true,
            crawler_depth: 3,
            crawler_max_urls: 50,
            crawler_timeout: 60,
            webhook_url: None,
            html_report: false,
            resume: false,
            enable_fingerprint: true,
            scope_regex: String::new(),
            enable_smart_payloads: true,
            allow_insecure_tls: false,
            // Auth
            auth_type: "none".to_string(),
            auth_token: None,
            auth_cookies: None,
            // Discovery
            enable_js_analysis: false,
            enable_param_fuzz: false,
            // Live verification
            verify_live: false,
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
    /// Called once when all scanning is complete, so renderers can tear down any
    /// live progress UI before the summary prints. Default no-op for headless sinks.
    fn finish(&self) {}
    /// Called once after all scanning completes, with the full result set, so a
    /// renderer can print a final summary. Default no-op for headless sinks.
    fn on_complete(&self, _results: &[ScanResult], _elapsed: std::time::Duration) {}
}

pub type SinkRef = Arc<dyn ScanEventSink>;

pub use crate::notify::console::{ConsoleSink, RenderMode};

#[cfg(test)]
mod auth_header_tests {
    use super::ScanConfig;

    fn cfg(auth_type: &str) -> ScanConfig {
        ScanConfig {
            auth_type: auth_type.to_string(),
            auth_token: Some("TKN123".to_string()),
            auth_cookies: Some("session=abc".to_string()),
            ..ScanConfig::default()
        }
    }

    #[test]
    fn bearer_emits_authorization() {
        let h = cfg("bearer").auth_headers();
        assert_eq!(h, vec![("Authorization".into(), "Bearer TKN123".into())]);
    }

    #[test]
    fn cookie_emits_cookie_header() {
        let h = cfg("cookie").auth_headers();
        assert_eq!(h, vec![("Cookie".into(), "session=abc".into())]);
    }

    #[test]
    fn none_emits_nothing() {
        assert!(cfg("none").auth_headers().is_empty());
    }

    #[test]
    fn empty_token_is_not_emitted() {
        let c = ScanConfig {
            auth_type: "bearer".into(),
            auth_token: Some(String::new()),
            ..ScanConfig::default()
        };
        assert!(c.auth_headers().is_empty());
    }
}
