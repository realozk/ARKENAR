use regex::Regex;
use std::collections::HashSet;
use std::sync::OnceLock;
use url::Url;

static RE_JS_SRC: OnceLock<Regex> = OnceLock::new();
static RE_JS_IMPORT: OnceLock<Regex> = OnceLock::new();
static RE_FETCH: OnceLock<Regex> = OnceLock::new();
static RE_AXIOS: OnceLock<Regex> = OnceLock::new();
static RE_ROUTE: OnceLock<Regex> = OnceLock::new();

fn re_js_src() -> &'static Regex {
    RE_JS_SRC.get_or_init(|| {
        Regex::new(r#"src\s*=\s*["']([^"']+\.js[^"']*)["']"#).unwrap()
    })
}

fn re_js_import() -> &'static Regex {
    RE_JS_IMPORT.get_or_init(|| {
        Regex::new(r#"(?:import|require)\s*\(?["']([^"']+\.js[^"']*)["']\)?"#).unwrap()
    })
}

fn re_fetch() -> &'static Regex {
    RE_FETCH.get_or_init(|| {
        Regex::new(r#"fetch\s*\(\s*["'](/[^"'?\s]+)["']"#).unwrap()
    })
}

fn re_axios() -> &'static Regex {
    RE_AXIOS.get_or_init(|| {
        Regex::new(r#"axios\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*["'](/[^"'?\s]+)["']"#).unwrap()
    })
}

fn re_route() -> &'static Regex {
    RE_ROUTE.get_or_init(|| {
        Regex::new(r#"["'](/(?:api|v\d+)/[^"'?\s]{2,})["']"#).unwrap()
    })
}

pub struct JsAnalyzer;

impl JsAnalyzer {
    pub fn new() -> Self {
        Self
    }

    pub fn extract_js_urls(&self, body: &str, base_url: &str) -> Vec<String> {
        let base = match Url::parse(base_url) {
            Ok(u) => u,
            Err(_) => return vec![],
        };

        let mut seen: HashSet<String> = HashSet::new();
        let mut results: Vec<String> = Vec::new();

        let collect = |caps: regex::Captures, seen: &mut HashSet<String>, results: &mut Vec<String>, base: &Url| {
            let raw = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            if raw.starts_with("data:") || raw.contains("node_modules") {
                return;
            }
            let resolved = if raw.starts_with("http://") || raw.starts_with("https://") {
                raw.to_string()
            } else {
                match base.join(raw) {
                    Ok(u) => u.to_string(),
                    Err(_) => return,
                }
            };
            if seen.insert(resolved.clone()) {
                results.push(resolved);
            }
        };

        for caps in re_js_src().captures_iter(body) {
            collect(caps, &mut seen, &mut results, &base);
        }
        for caps in re_js_import().captures_iter(body) {
            collect(caps, &mut seen, &mut results, &base);
        }

        results
    }

    pub fn extract_endpoints(&self, js_body: &str) -> Vec<String> {
        let mut seen: HashSet<String> = HashSet::new();
        let mut results: Vec<String> = Vec::new();

        let mut push = |path: &str| {
            if seen.insert(path.to_string()) {
                results.push(path.to_string());
            }
        };

        for caps in re_fetch().captures_iter(js_body) {
            if let Some(m) = caps.get(1) {
                push(m.as_str());
            }
        }
        for caps in re_axios().captures_iter(js_body) {
            if let Some(m) = caps.get(1) {
                push(m.as_str());
            }
        }
        for caps in re_route().captures_iter(js_body) {
            if let Some(m) = caps.get(1) {
                push(m.as_str());
            }
        }

        results
    }
}

impl Default for JsAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}