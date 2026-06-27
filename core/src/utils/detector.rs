use crate::core::VulnerabilityType;
use reqwest::header::HeaderMap;

const STRONG_SQL: &[&str] = &[
    "You have an error in your SQL",
    "SQL syntax",
    "mysql_fetch",
    "ORA-01756",
    "ORA-00933",
    "SQLSTATE[",
    "Unclosed quotation mark",
    "Microsoft OLE DB Provider",
    "ODBC SQL Server Driver",
    "Warning: mysql_",
    "Warning: pg_",
];

const WEAK_SQL: &[&str] = &[
    "SQLite Error",
    "syntax error",
    "unterminated quoted string",
    "pg_query()",
    "supplied argument is not a valid MySQL",
];

pub struct VulnerabilityDetector;

impl VulnerabilityDetector {
    pub fn new() -> Self {
        Self
    }

    pub fn detect(
        &self,
        body: &str,
        payload: &str,
        content_type: Option<&str>,
        duration_ms: u128,
        status_code: Option<u16>,
        headers: Option<&HeaderMap>,
    ) -> Option<VulnerabilityType> {
        // Blind SQL via timing
        if duration_ms > 5000 {
            let payload_lower = payload.to_lowercase();
            for indicator in &["sleep", "waitfor", "pg_sleep", "benchmark"] {
                if payload_lower.contains(indicator) {
                    return Some(VulnerabilityType::BlindSqlInjection);
                }
            }
        }

        // Path traversal (checked before sensitive exposure to claim root:x:0:0)
        if body.contains("root:x:0:0")
            || body.contains("[boot loader]")
            || body.contains("<b>Warning</b>: include(")
        {
            return Some(VulnerabilityType::PathTraversal);
        }

        // SQL injection — strong/weak split
        let strong_hits = STRONG_SQL.iter().filter(|p| body.contains(**p)).count();
        let weak_hits = WEAK_SQL.iter().filter(|p| body.contains(**p)).count();
        if strong_hits >= 1 || weak_hits >= 2 {
            return Some(VulnerabilityType::SqlInjection);
        }

        // XSS
        if self.is_xss_payload(payload) && body.contains(payload) {
            if let Some(ct) = content_type {
                if ct.contains("text/html") {
                    return Some(VulnerabilityType::Xss);
                }
            }
        }

        // Open redirect
        if self.is_open_redirect_payload(payload) {
            if let Some(code) = status_code {
                if matches!(code, 301 | 302 | 303 | 307 | 308) {
                    if let Some(hdrs) = headers {
                        if let Some(loc) = hdrs.get("location").and_then(|v| v.to_str().ok()) {
                            if loc.contains(
                                payload
                                    .trim_start_matches("https://")
                                    .trim_start_matches("http://")
                                    .trim_start_matches("//"),
                            ) {
                                return Some(VulnerabilityType::OpenRedirect);
                            }
                        }
                    }
                }
            }
        }

        // Secret detection is NOT here — it runs through `arkenar_secrets::scan_bytes`
        // at the `HttpClient::send` choke point. A second matcher would reintroduce FPs.
        None
    }

    fn is_xss_payload(&self, payload: &str) -> bool {
        let xss_indicators = [
            "<script",
            "<img",
            "<svg",
            "<iframe",
            "<body",
            "onerror=",
            "onload=",
            "onclick=",
            "onmouseover=",
            "javascript:",
            "alert(",
            "prompt(",
            "confirm(",
        ];
        let payload_lower = payload.to_lowercase();
        xss_indicators.iter().any(|ind| payload_lower.contains(ind))
    }

    fn is_open_redirect_payload(&self, payload: &str) -> bool {
        let pl = payload.to_lowercase();
        pl.starts_with("http://")
            || pl.starts_with("https://")
            || pl.starts_with("//")
            || pl.contains("169.254.169.254")
            || pl.contains("evil.arkenar")
            || pl.contains("example.com")
    }

    pub fn is_sql_vulnerable(&self, body: &str) -> bool {
        STRONG_SQL.iter().any(|p| body.contains(*p))
    }

    pub fn is_xss_vulnerable(&self, body: &str, payload: &str, content_type: Option<&str>) -> bool {
        if !self.is_xss_payload(payload) {
            return false;
        }
        if !body.contains(payload) {
            return false;
        }
        if let Some(ct) = content_type {
            if ct.contains("text/html") {
                return true;
            }
        }
        false
    }
}

impl Default for VulnerabilityDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `detect()` must not flag prose that merely mentions secret keywords — the FP the
    /// deleted substring matcher produced.
    #[test]
    fn detect_does_not_flag_substring_secrets() {
        let d = VulnerabilityDetector::new();
        let bodies = [
            "To authenticate, set API_KEY= from your dashboard before running.",
            "DB_PASSWORD and DB_USERNAME are read from the vault at boot.",
            "Configure aws_access_key_id and aws_secret_access_key in your profile.",
            "SECRET_KEY= <redacted in logs>",
        ];
        for body in bodies {
            assert_eq!(
                d.detect(body, "", Some("text/html"), 0, Some(200), None),
                None,
                "detect() must not flag a substring secret in: {body}"
            );
        }
    }

    /// The real vuln signals `detect()` still owns must keep working after the cut.
    #[test]
    fn detect_still_finds_sql_and_path_traversal() {
        let d = VulnerabilityDetector::new();
        assert_eq!(
            d.detect("root:x:0:0:root:/root:/bin/bash", "", None, 0, Some(200), None),
            Some(VulnerabilityType::PathTraversal),
        );
        assert_eq!(
            d.detect("You have an error in your SQL syntax", "'", None, 0, Some(200), None),
            Some(VulnerabilityType::SqlInjection),
        );
    }
}
