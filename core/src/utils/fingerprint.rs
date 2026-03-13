use reqwest::header::HeaderMap;


#[derive(Debug, Clone, Default)]
pub struct TechProfile  {
   pub server: Option<String>,
   pub language: Option<String>,
   pub framework: Option<String>,
   pub cms: Option<String>,
   pub waf: Option<String>,
}

impl TechProfile {
    pub fn is_empty(&self) -> bool {
        self.server.is_none() &&
        self.language.is_none() &&
        self.framework.is_none() &&
        self.cms.is_none() &&
        self.waf.is_none()
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


/// Inspects response headers and body, returns a populated `TechProfile`.
/// Called once per target, after the canary reflection check passes.

pub fn fingerprint_response(headers: &HeaderMap, body: &str) -> TechProfile {
    let mut profile = TechProfile::default();

    // ── Server header ─────────────────────────────────────────────────────────
    if let Some(server) = headers.get("server").and_then(|v| v.to_str().ok()) {
        profile.server = Some(server.to_string());
        if server.to_lowercase().contains("cloudflare") {
            profile.waf = Some("Cloudflare".to_string());
        }
    }

    // ── Language via X-Powered-By ─────────────────────────────────────────────
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

    // ── Language via Set-Cookie session token ─────────────────────────────────
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

    // ── WAF detection via known headers ──────────────────────────────────────
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

    // ── CMS detection via body patterns ──────────────────────────────────────
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

    // ── Framework detection via body patterns ─────────────────────────────────
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