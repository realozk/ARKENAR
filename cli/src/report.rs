//! CI reporting: severity classification, the merge gate, and SARIF output.

use arkenar_core::ScanResult;
use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    None,
    Low,
    Medium,
    High,
    Critical,
}

impl Severity {
    pub fn parse(s: &str) -> Option<Severity> {
        match s.to_lowercase().as_str() {
            "none" => Some(Severity::None),
            "low" => Some(Severity::Low),
            "medium" => Some(Severity::Medium),
            "high" => Some(Severity::High),
            "critical" => Some(Severity::Critical),
            _ => None,
        }
    }

    fn sarif_level(self) -> &'static str {
        match self {
            Severity::Critical | Severity::High => "error",
            Severity::Medium => "warning",
            Severity::Low => "note",
            Severity::None => "none",
        }
    }
}

pub fn severity_of(vuln_type: &str) -> Severity {
    let v = vuln_type.to_lowercase();
    if v.contains("rce") || v.contains("command injection") || v.contains("sqli") || v.contains("sql injection") {
        Severity::Critical
    } else if v.contains("sensitive exposure") || v.contains("ssrf") || v.contains("path traversal") {
        Severity::High
    } else if v.contains("xss") || v.contains("open redirect") {
        Severity::Medium
    } else {
        Severity::Low
    }
}

/// `true` if any finding meets or exceeds `threshold` (so the CI run should fail).
pub fn gate(results: &[ScanResult], threshold: Severity) -> bool {
    threshold != Severity::None && results.iter().any(|r| severity_of(&r.vuln_type) >= threshold)
}

pub fn to_sarif(results: &[ScanResult]) -> Value {
    let findings: Vec<Value> = results
        .iter()
        .map(|r| {
            json!({
                "ruleId": r.vuln_type,
                "level": severity_of(&r.vuln_type).sarif_level(),
                "message": { "text": format!("{} — {}", r.vuln_type, r.payload) },
                "locations": [{
                    "physicalLocation": { "artifactLocation": { "uri": r.url } }
                }]
            })
        })
        .collect();

    json!({
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": { "driver": {
                "name": "Arkenar",
                "informationUri": "https://github.com/RealOzk/ARKENAR",
                "rules": []
            }},
            "results": findings
        }]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(vuln: &str) -> ScanResult {
        ScanResult {
            url: "https://t/".into(),
            vuln_type: vuln.into(),
            payload: "x".into(),
            timing_ms: 0,
            status_code: 200,
            server: None,
            method: "GET".into(),
            request_headers: vec![],
            request_body: None,
            tech_stack: vec![],
            waf_detected: None,
            verified: true,
            notes: None,
        }
    }

    #[test]
    fn severity_ranks() {
        assert_eq!(severity_of("SQLi"), Severity::Critical);
        assert_eq!(severity_of("Sensitive Exposure [OpenAI API Key]"), Severity::High);
        assert_eq!(severity_of("XSS"), Severity::Medium);
    }

    #[test]
    fn gate_fires_at_or_above_threshold() {
        let high = vec![r("Sensitive Exposure [OpenAI API Key]")];
        assert!(gate(&high, Severity::High));
        assert!(!gate(&high, Severity::Critical));
        assert!(!gate(&high, Severity::None));
        assert!(!gate(&[], Severity::Low));
    }

    #[test]
    fn sarif_shape() {
        let v = to_sarif(&[r("SQLi")]);
        assert_eq!(v["version"], "2.1.0");
        assert_eq!(v["runs"][0]["results"][0]["level"], "error");
    }
}
