pub mod engine;
pub mod target_manager;
pub mod result_aggregator;
pub mod mutator;

use serde::Serialize;

/// Vulnerability type classification for bug bounty reporting.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
pub enum VulnerabilityType {
    SqlInjection,
    BlindSqlInjection,
    Xss,
    SensitiveExposure,
    Safe,
}

impl std::fmt::Display for VulnerabilityType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VulnerabilityType::SqlInjection => write!(f, "SQLi"),
            VulnerabilityType::BlindSqlInjection => write!(f, "Blind SQLi"),
            VulnerabilityType::Xss => write!(f, "XSS"),
            VulnerabilityType::SensitiveExposure => write!(f, "Sensitive Exposure"),
            VulnerabilityType::Safe => write!(f, "Safe"),
        }
    }
}
