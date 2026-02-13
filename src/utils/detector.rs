use crate::core::VulnerabilityType;

/// Strict vulnerability detector that minimizes false positives
/// Only flags actual vulnerabilities based on concrete evidence
pub struct VulnerabilityDetector;

impl VulnerabilityDetector {
    pub fn new() -> Self {
        Self
    }

    /// Main detection method with STRICT logic.
    /// Returns the VulnerabilityType if found, None if safe
    /// 
    /// Arguments:
    /// - body: Response body text
    /// - payload: The payload that was sent
    /// - content_type: Optional content-type header value
    /// - duration_ms: Response time in milliseconds (for blind detection)
    pub fn detect(
        &self,
        body: &str,
        payload: &str,
        content_type: Option<&str>,
        duration_ms: u128,
    ) -> Option<VulnerabilityType> {
        if duration_ms > 5000 {
            let blind_indicators = ["sleep", "waitfor", "pg_sleep", "benchmark"];
            let payload_lower = payload.to_lowercase();
            for indicator in blind_indicators {
                if payload_lower.contains(indicator) {
                    return Some(VulnerabilityType::BlindSqlInjection);
                }
            }
        }

        let db_errors = [
            "SQL syntax",
            "mysql_fetch",
            "ORA-01756",
            "ORA-00933",
            "SQLite Error",
            "syntax error",
            "You have an error in your SQL",
            "Warning: mysql_",
            "Warning: pg_",
            "SQLSTATE[",
            "Unclosed quotation mark",
            "Microsoft OLE DB Provider",
            "ODBC SQL Server Driver",
        ];
        for error in db_errors {
            if body.contains(error) {
                return Some(VulnerabilityType::SqlInjection);
            }
        }

        if self.is_xss_payload(payload) && body.contains(payload) {
            if let Some(ct) = content_type {
                if ct.contains("text/html") {
                    return Some(VulnerabilityType::Xss);
                }
            }
        }

        if self.has_sensitive_patterns(body) {
            return Some(VulnerabilityType::SensitiveExposure);
        }

        // Default: Safe
        None
    }

    /// Check if payload looks like an XSS attempt
    fn is_xss_payload(&self, payload: &str) -> bool {
        let xss_indicators = [
            "<script", "<img", "<svg", "<iframe", "<body",
            "onerror=", "onload=", "onclick=", "onmouseover=",
            "javascript:", "alert(", "prompt(", "confirm(",
        ];
        let payload_lower = payload.to_lowercase();
        for indicator in xss_indicators {
            if payload_lower.contains(indicator) {
                return true;
            }
        }
        false
    }

    /// Check for sensitive file patterns in response body
    fn has_sensitive_patterns(&self, body: &str) -> bool {
        let sensitive_patterns = [
            "DB_PASSWORD",
            "DB_USERNAME",
            "API_KEY=",
            "SECRET_KEY=",
            "-----BEGIN RSA PRIVATE KEY-----",
            "-----BEGIN PRIVATE KEY-----",
            "root:x:0:0",           // /etc/passwd
            "aws_access_key_id",
            "aws_secret_access_key",
        ];
        for pattern in sensitive_patterns {
            if body.contains(pattern) {
                return true;
            }
        }
        false
    }

    /// Legacy method - checks for SQL errors only
    pub fn is_sql_vulnerable(&self, body: &str) -> bool {
        let db_errors = [
            "SQL syntax",
            "mysql_fetch",
            "ORA-01756",
            "SQLite Error",
            "syntax error",
            "You have an error in your SQL",
            "Warning: mysql_",
            "Warning: pg_",
        ];
        for error in db_errors {
            if body.contains(error) {
                return true;
            }
        }
        false
    }

    /// Legacy method - checks for XSS reflection with content-type validation
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

    /// Legacy method - STRICT sensitive file detection
    pub fn is_sensitive_file_found(&self, _status_code: Option<u16>, body: &str) -> bool {
        self.has_sensitive_patterns(body)
    }
}

impl Default for VulnerabilityDetector {
    fn default() -> Self {
        Self::new()
    }
}
