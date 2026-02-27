pub mod core;
pub mod http;
pub mod modules;
pub mod utils;

// Re-export frequently used types for convenience
pub use crate::core::engine::ScanEngine;
pub use crate::core::result_aggregator::{ResultAggregator, ScanResult};
pub use crate::core::target_manager::TargetManager;
pub use crate::http::HttpClient;
pub use crate::modules::crawler::run_katana_crawler;
pub use crate::modules::nuclei::run_nuclei_scan;
pub use crate::utils::installer;
pub use crate::utils::read_lines;

/// Parses raw `Key: Value` header strings into (key, value) tuples.
pub fn parse_custom_headers(raw: &[String]) -> Vec<(String, String)> {
    raw.iter().filter_map(|h| {
        let mut parts = h.splitn(2, ':');
        let key = parts.next()?.trim().to_string();
        let val = parts.next().unwrap_or("").trim().to_string();
        if key.is_empty() { return None; }
        Some((key, val))
    }).collect()
}
