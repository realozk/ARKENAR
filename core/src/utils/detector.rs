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

        // Sensitive exposure (root:x:0:0 removed — now PathTraversal)
        if self.has_sensitive_patterns(body) {
            return Some(VulnerabilityType::SensitiveExposure);
        }

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

    fn has_sensitive_patterns(&self, body: &str) -> bool {
        const PATTERNS: &[&str] = &[
            "DB_PASSWORD",
            "DB_USERNAME",
            "API_KEY=",
            "SECRET_KEY=",
            "-----BEGIN RSA PRIVATE KEY-----",
            "-----BEGIN PRIVATE KEY-----",
            "aws_access_key_id",
            "aws_secret_access_key",
        ];
        PATTERNS.iter().any(|p| body.contains(p))
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

    pub fn is_sensitive_file_found(&self, _status_code: Option<u16>, body: &str) -> bool {
        self.has_sensitive_patterns(body)
    }
}

impl Default for VulnerabilityDetector {
    fn default() -> Self {
        Self::new()
    }
}
