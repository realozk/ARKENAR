//! studio.rs – Smart Auto-Login engine for Arkenar Exploit Studio.
//!
//! Security guarantees:
//!   - Credentials and tokens are NEVER printed to stdout/stderr.
//!   - All user input is validated before any network call.
//!   - A fresh cookie jar is created per-request (no cross-session leakage).

use reqwest::cookie::{Jar, CookieStore};
use reqwest::redirect::Policy;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// ─── Input / Output types ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AutoLoginRequest {
    pub login_url: String,
    pub username: String,
    pub password: String,
    pub username_field: Option<String>,
    pub password_field: Option<String>,
    pub token_field: Option<String>,
}

#[derive(Serialize)]
pub struct AutoLoginResult {
    pub cookie_header: String,
    pub status_code: u16,
}

// ─── Validation ──────────────────────────────────────────────────────────────

fn validate_request(req: &AutoLoginRequest) -> Result<(), String> {
    let parsed = url::Url::parse(&req.login_url)
        .map_err(|_| "Login URL is not valid.".to_string())?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("Login URL must begin with http:// or https://".to_string());
    }
    if parsed.host_str().is_none() {
        return Err("Login URL has no hostname.".to_string());
    }
    if req.login_url.contains('\0')
        || req.username.contains('\0')
        || req.password.contains('\0')
    {
        return Err("Input contains forbidden characters.".to_string());
    }
    if req.username.trim().is_empty() {
        return Err("Username must not be empty.".to_string());
    }
    if req.password.is_empty() {
        return Err("Password must not be empty.".to_string());
    }
    Ok(())
}

// ─── HTML parsing ────────────────────────────────────────────────────────────

const CSRF_HINTS: &[&str] = &[
    "csrf",
    "token",
    "user_token",
    "_token",
    "authenticity",
    "__requestverificationtoken",
    "nonce",
];

/// Returns all `(name, value)` pairs of `<input type="hidden">` elements that
/// look like CSRF tokens.  If `preferred` is given, only that exact name is
/// returned (ignoring CSRF heuristics).
fn extract_hidden_tokens(doc: &Html, preferred: Option<&str>) -> Vec<(String, String)> {
    // Parse once; unwrap is safe — this is a compile-time-checked literal.
    let selector = Selector::parse("input[type='hidden']").unwrap();
    let mut results = Vec::new();

    for el in doc.select(&selector) {
        let name = match el.attr("name") {
            Some(n) if !n.is_empty() => n.to_string(),
            _ => continue,
        };
        let value = el.attr("value").unwrap_or("").to_string();

        if let Some(pref) = preferred {
            if name.eq_ignore_ascii_case(pref) {
                results.push((name, value));
                return results; 
            }
            continue; 
        }

       
        let name_lower = name.to_lowercase();
        if CSRF_HINTS.iter().any(|hint| name_lower.contains(hint)) {
            results.push((name, value));
        }
    }
    results
}

/// Tries to find the `action` attribute of the login form (the `<form>` that
/// contains a `<input type="password">`).  Falls back to `login_url`.
fn resolve_form_action(doc: &Html, base_url: &url::Url) -> String {
    let form_sel = Selector::parse("form").unwrap();
    let pass_sel = Selector::parse("input[type='password']").unwrap();

    for form in doc.select(&form_sel) {
        if form.select(&pass_sel).next().is_none() {
            continue;
        }
        if let Some(action) = form.attr("action") {
            if let Ok(resolved) = base_url.join(action) {
                return resolved.to_string();
            }
        }
    }
    base_url.to_string()
}

// ─── Tauri command ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn studio_auto_login(req: AutoLoginRequest) -> Result<AutoLoginResult, String> {
    validate_request(&req)?;

    let jar = Arc::new(Jar::default());

    let client = reqwest::Client::builder()
        .cookie_provider(Arc::clone(&jar))
        .redirect(Policy::limited(5))
        .user_agent("Mozilla/5.0 (compatible; Arkenar Security Scanner)")
        .timeout(std::time::Duration::from_secs(20))
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let base_url = url::Url::parse(&req.login_url)
        .map_err(|_| "Could not parse login URL.".to_string())?;

    // ── Step 1: GET the login page ────────────────────────────────────────────
    // This populates the jar with any pre-session cookies and lets us read
    // the CSRF token from the rendered HTML.
    let get_resp = client
        .get(&req.login_url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("GET request failed: {}", e))?;

    if !get_resp.status().is_success() && !get_resp.status().is_redirection() {
        return Err(format!(
            "GET {} returned HTTP {} — the target may be unreachable.",
            req.login_url,
            get_resp.status().as_u16()
        ));
    }

    let html_body = get_resp
        .text()
        .await
        .map_err(|e| format!("Failed to read login page body: {}", e))?;

    // ── Step 2: Parse CSRF tokens + form action ───────────────────────────────
    let (csrf_tokens, post_url) = {
    let doc = Html::parse_document(&html_body);
    let tokens   = extract_hidden_tokens(&doc, req.token_field.as_deref());
    let form_url = resolve_form_action(&doc, &base_url);
    (tokens, form_url)
};

    // ── Step 3: Build POST form data ──────────────────────────────────────────
    let username_field = req
        .username_field
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "username".to_string());

    let password_field = req
        .password_field
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "password".to_string());

    let mut form: Vec<(String, String)> = vec![
        (username_field, req.username.clone()),
        (password_field, req.password.clone()),
    ];

    // Append all detected/requested CSRF tokens
    for (name, value) in csrf_tokens {
        form.push((name, value));
    }

    let post_resp = client
        .post(&post_url)
        .header("Referer", &req.login_url)
        .header("Origin", format!("{}://{}", base_url.scheme(), base_url.host_str().unwrap_or("")))
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("POST request failed: {}", e))?;

    let status_code = post_resp.status().as_u16();

    // ── Step 5: Extract cookies from the jar ─────────────────────────────────
    // Query the origin (scheme+host) so the jar returns all domain cookies.
    let origin_str = format!(
        "{}://{}",
        base_url.scheme(),
        base_url.host_str().unwrap_or("")
    );
    let origin_url = url::Url::parse(&origin_str)
        .map_err(|e| format!("Could not build origin URL: {}", e))?;

    let cookie_header = jar
        .cookies(&origin_url)
        .and_then(|hv| hv.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default();

    if cookie_header.is_empty() {
        return Err(format!(
            "No session cookies were set after POST (HTTP {status_code}). \
             Verify your credentials and the correct CSRF field name."
        ));
    }

    Ok(AutoLoginResult {
        cookie_header,
        status_code,
    })
}
