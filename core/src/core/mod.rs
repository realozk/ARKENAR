pub mod engine;
pub mod mutator;
pub mod result_aggregator;
pub mod state;
pub mod target_manager;
pub mod throttle;

use serde::Serialize;

/// Vulnerability type classification for bug bounty reporting.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
pub enum VulnerabilityType {
    SqlInjection,
    BlindSqlInjection,
    Xss,
    SensitiveExposure,
    OpenRedirect,
    Ssrf,
    PathTraversal,
    CommandInjection,
    Rce,
    Safe,
}

impl std::fmt::Display for VulnerabilityType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VulnerabilityType::SqlInjection => write!(f, "SQLi"),
            VulnerabilityType::BlindSqlInjection => write!(f, "Blind SQLi"),
            VulnerabilityType::Xss => write!(f, "XSS"),
            VulnerabilityType::SensitiveExposure => write!(f, "Sensitive Exposure"),
            VulnerabilityType::OpenRedirect => write!(f, "Open Redirect"),
            VulnerabilityType::Ssrf => write!(f, "SSRF"),
            VulnerabilityType::PathTraversal => write!(f, "Path Traversal"),
            VulnerabilityType::CommandInjection => write!(f, "Command Injection"),
            VulnerabilityType::Rce => write!(f, "RCE"),
            VulnerabilityType::Safe => write!(f, "Safe"),
        }
    }
}
