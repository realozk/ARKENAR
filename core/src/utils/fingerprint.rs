//! Tech-stack and WAF fingerprinting.
//! `TechProfile` has been removed — use `TechFingerprinter::analyze` instead.
use reqwest::header::HeaderMap;

#[derive(Debug, Clone, Default)]
pub struct FingerprintResult {
    pub tech_stack: Vec<String>,
    pub waf_detected: Option<String>,
}

impl FingerprintResult {
    pub fn summary(&self) -> String {
        let mut parts = self.tech_stack.clone();
        if let Some(ref waf) = self.waf_detected {
            parts.push(format!("WAF: {}", waf));
        }
        if parts.is_empty() { "unknown".to_string() } else { parts.join(", ") }
    }

    pub fn is_empty(&self) -> bool {
        self.tech_stack.is_empty() && self.waf_detected.is_none()
    }
}

#[derive(Debug, Clone, Default)]
pub struct TechFingerprinter;

impl TechFingerprinter {
    pub fn new() -> Self { Self }

    pub fn analyze(&self, _status_code: u16, headers: &HeaderMap, body: &str) -> FingerprintResult {
        let mut tech: Vec<String> = Vec::new();
        let mut waf: Option<String> = None;

        if let Some(server) = headers.get("server").and_then(|v| v.to_str().ok()) {
            tech.push(server.to_string());
            let sl = server.to_lowercase();
            if sl.contains("cloudflare")    { waf = Some("Cloudflare".into()); }
            else if sl.contains("modsecurity") { waf = Some("ModSecurity".into()); }
        }

        if let Some(xpb) = headers.get("x-powered-by").and_then(|v| v.to_str().ok()) {
            tech.push(xpb.to_string());
            let x = xpb.to_lowercase();
            if x.contains("php")           { push_unique(&mut tech, "PHP"); }
            else if x.contains("asp.net")  { push_unique(&mut tech, "ASP.NET"); }
            else if x.contains("express")  { push_unique(&mut tech, "Node.js"); push_unique(&mut tech, "Express"); }
        }

        if waf.is_none() {
            if headers.contains_key("cf-ray")       { waf = Some("Cloudflare".into()); }
            else if headers.contains_key("x-sucuri-id") { waf = Some("Sucuri".into()); }
        }

        'cookie: for val in headers.get_all("set-cookie").iter() {
            if let Ok(cookie) = val.to_str() {
                let c = cookie.to_lowercase();
                if      c.contains("phpsessid")        { push_unique(&mut tech, "PHP");     break 'cookie; }
                else if c.contains("jsessionid")       { push_unique(&mut tech, "Java");    break 'cookie; }
                else if c.contains("asp.net_sessionid"){ push_unique(&mut tech, "ASP.NET"); break 'cookie; }
            }
        }

        if body.contains("wp-content") || body.contains("wp-includes") {
            push_unique(&mut tech, "WordPress"); push_unique(&mut tech, "PHP");
        } else if body.contains("sites/default/files") || body.contains("Drupal.settings") {
            push_unique(&mut tech, "Drupal"); push_unique(&mut tech, "PHP");
        } else if body.contains("Joomla") || body.contains("/administrator") {
            push_unique(&mut tech, "Joomla"); push_unique(&mut tech, "PHP");
        }

        if body.contains("csrfmiddlewaretoken") {
            push_unique(&mut tech, "Django"); push_unique(&mut tech, "Python");
        } else if body.contains("authenticity_token") {
            push_unique(&mut tech, "Rails"); push_unique(&mut tech, "Ruby");
        } else if body.contains("laravel_session") || body.contains("Laravel") {
            push_unique(&mut tech, "Laravel"); push_unique(&mut tech, "PHP");
        }

        tech.sort(); tech.dedup();
        FingerprintResult { tech_stack: tech, waf_detected: waf }
    }
}

fn push_unique(vec: &mut Vec<String>, value: &str) {
    if !vec.iter().any(|s| s == value) { vec.push(value.to_string()); }
}