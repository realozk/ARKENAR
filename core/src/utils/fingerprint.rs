use reqwest::header::HeaderMap;

#[derive(Debug, Clone, Default)]
pub struct TechProfile {
    pub server: Option<String>,
    pub language: Option<String>,
    pub framework: Option<String>,
    pub cms: Option<String>,
    pub waf: Option<String>,
}

impl TechProfile {
    pub fn is_empty(&self) -> bool {
        self.server.is_none()
            && self.language.is_none()
            && self.framework.is_none()
            && self.cms.is_none()
            && self.waf.is_none()
    }

    pub fn summary(&self) -> String {
        let mut parts = Vec::new();
        if let Some(ref s) = self.server    { parts.push(s.clone()); }
        if let Some(ref s) = self.language  { parts.push(s.clone()); }
        if let Some(ref s) = self.framework { parts.push(s.clone()); }
        if let Some(ref s) = self.cms       { parts.push(s.clone()); }
        if let Some(ref s) = self.waf       { parts.push(format!("WAF:{}", s)); }
        if parts.is_empty() { "unknown".to_string() } else { parts.join(", ") }
    }
}

pub fn fingerprint_response(headers: &HeaderMap, body: &str) -> TechProfile {
    let mut profile = TechProfile::default();

    if let Some(server) = headers.get("server").and_then(|v| v.to_str().ok()) {
        profile.server = Some(server.to_string());
        if server.to_lowercase().contains("cloudflare") {
            profile.waf = Some("Cloudflare".to_string());
        }
    }

    if let Some(xpb) = headers.get("x-powered-by").and_then(|v| v.to_str().ok()) {
        let x = xpb.to_lowercase();
        if x.contains("php") {
            profile.language = Some("PHP".to_string());
        } else if x.contains("asp.net") {
            profile.language = Some("ASP.NET".to_string());
        } else if x.contains("express") {
            profile.language  = Some("Node.js".to_string());
            profile.framework = Some("Express".to_string());
        }
    }

    if profile.language.is_none() {
        for val in headers.get_all("set-cookie").iter() {
            if let Ok(cookie) = val.to_str() {
                let c = cookie.to_lowercase();
                if c.contains("phpsessid") {
                    profile.language = Some("PHP".to_string()); break;
                } else if c.contains("jsessionid") {
                    profile.language = Some("Java".to_string()); break;
                } else if c.contains("asp.net_sessionid") {
                    profile.language = Some("ASP.NET".to_string()); break;
                }
            }
        }
    }

    if profile.waf.is_none() {
        if headers.contains_key("cf-ray") {
            profile.waf = Some("Cloudflare".to_string());
        } else if headers.contains_key("x-sucuri-id") {
            profile.waf = Some("Sucuri".to_string());
        } else if headers.get("server")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_lowercase().contains("mod_security"))
            .unwrap_or(false)
        {
            profile.waf = Some("ModSecurity".to_string());
        }
    }

    if body.contains("/wp-content/") || body.contains("/wp-includes/") {
        profile.cms = Some("WordPress".to_string());
        if profile.language.is_none() { profile.language = Some("PHP".to_string()); }
    } else if body.contains("/sites/default/files/") || body.contains("Drupal.settings") {
        profile.cms = Some("Drupal".to_string());
        if profile.language.is_none() { profile.language = Some("PHP".to_string()); }
    } else if body.contains("Joomla") && body.contains("/administrator/") {
        profile.cms = Some("Joomla".to_string());
        if profile.language.is_none() { profile.language = Some("PHP".to_string()); }
    }

    if profile.framework.is_none() {
        if body.contains("csrfmiddlewaretoken") {
            profile.framework = Some("Django".to_string());
            if profile.language.is_none() { profile.language = Some("Python".to_string()); }
        } else if body.contains("authenticity_token") {
            profile.framework = Some("Rails".to_string());
            if profile.language.is_none() { profile.language = Some("Ruby".to_string()); }
        } else if body.contains("laravel_session") || body.contains("Laravel") {
            profile.framework = Some("Laravel".to_string());
            if profile.language.is_none() { profile.language = Some("PHP".to_string()); }
        }
    }

    profile
}

// ── New fingerprinting surface ────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct FingerprintResult {
    pub tech_stack: Vec<String>,
    pub waf_detected: Option<String>,
}

pub struct TechFingerprinter;

impl TechFingerprinter {
    pub fn new() -> Self {
        Self
    }

    pub fn analyze(&self, _status_code: u16, headers: &HeaderMap, body: &str) -> FingerprintResult {
        let mut tech_stack: Vec<String> = Vec::new();
        let mut waf_detected: Option<String> = None;

        if let Some(server) = headers.get("server").and_then(|v| v.to_str().ok()) {
            tech_stack.push(server.to_string());
            let sl = server.to_lowercase();
            if sl.contains("cloudflare") {
                waf_detected = Some("Cloudflare".to_string());
            } else if sl.contains("mod_security") || sl.contains("modsecurity") {
                waf_detected = Some("ModSecurity".to_string());
            }
        }

        if let Some(xpb) = headers.get("x-powered-by").and_then(|v| v.to_str().ok()) {
            tech_stack.push(xpb.to_string());
        }

        if waf_detected.is_none() {
            if headers.contains_key("cf-ray") {
                waf_detected = Some("Cloudflare".to_string());
            } else if headers.contains_key("x-sucuri-id") {
                waf_detected = Some("Sucuri".to_string());
            }
        }

        if body.contains("/wp-content/") || body.contains("/wp-includes/") {
            tech_stack.push("WordPress".to_string());
        }
        if body.contains("/sites/default/files/") || body.contains("Drupal.settings") {
            tech_stack.push("Drupal".to_string());
        }
        if body.contains("Joomla") {
            tech_stack.push("Joomla".to_string());
        }

        tech_stack.sort();
        tech_stack.dedup();

        FingerprintResult { tech_stack, waf_detected }
    }
}

impl Default for TechFingerprinter {
    fn default() -> Self {
        Self::new()
    }
}