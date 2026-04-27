use crate::SinkRef;
use regex::Regex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::OnceLock;

pub struct JsSecret {
    pub url: String,
    pub secret_type: String,
    pub matched_value: String,
    pub line_number: usize,
}

struct Pattern {
    name: &'static str,
    regex: Regex,
}

fn patterns() -> &'static Vec<Pattern> {
    static PATTERNS: OnceLock<Vec<Pattern>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        vec![
            Pattern {
                name: "AWS Access Key",
                regex: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
            },
            Pattern {
                name: "GitHub Token",
                regex: Regex::new(r"ghp_[a-zA-Z0-9]{36}").unwrap(),
            },
            Pattern {
                name: "Google API Key",
                regex: Regex::new(r"AIza[0-9A-Za-z\-_]{35}").unwrap(),
            },
            Pattern {
                name: "Private Key",
                regex: Regex::new(r"-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----").unwrap(),
            },
            Pattern {
                name: "Generic Password",
                regex: Regex::new(
                    r#"(?i)(password|passwd|secret|api_key|apikey)\s*[:=]\s*["'][^"']{8,}["']"#,
                )
                .unwrap(),
            },
            Pattern {
                name: "JWT Token",
                regex: Regex::new(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}").unwrap(),
            },
        ]
    })
}

pub async fn scan_js_secrets(
    js_urls: Vec<String>,
    abort: Arc<AtomicBool>,
    sink: SinkRef,
) -> anyhow::Result<Vec<JsSecret>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .danger_accept_invalid_certs(true)
        .build()?;

    let filtered: Vec<String> = js_urls.into_iter().filter(|u| u.ends_with(".js")).collect();

    let mut results: Vec<JsSecret> = Vec::new();
    let pats = patterns();

    for (idx, url) in filtered.iter().enumerate() {
        if idx % 5 == 0 && abort.load(Ordering::Relaxed) {
            break;
        }

        sink.on_log("info", &format!("[*] JS secrets scan: {}", url));

        let body = match client.get(url).send().await {
            Ok(resp) => {
                let bytes = resp.bytes().await.unwrap_or_default();
                let truncated = if bytes.len() > 2 * 1024 * 1024 {
                    &bytes[..2 * 1024 * 1024]
                } else {
                    &bytes
                };
                String::from_utf8_lossy(truncated).into_owned()
            }
            Err(_) => continue,
        };

        for (line_number, line) in body.lines().enumerate() {
            for pat in pats {
                if let Some(m) = pat.regex.find(line) {
                    let raw = m.as_str();
                    let matched_value = if raw.len() > 80 {
                        raw[..80].to_string()
                    } else {
                        raw.to_string()
                    };
                    results.push(JsSecret {
                        url: url.clone(),
                        secret_type: pat.name.to_string(),
                        matched_value,
                        line_number: line_number + 1,
                    });
                }
            }
        }
    }

    Ok(results)
}
