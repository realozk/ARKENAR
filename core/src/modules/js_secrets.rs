use crate::SinkRef;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct JsSecret {
    pub url: String,
    pub secret_type: String,
    pub matched_value: String,
    pub line_number: usize,
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

    for (idx, url) in filtered.iter().enumerate() {
        if idx % 5 == 0 && abort.load(Ordering::Relaxed) {
            break;
        }

        sink.on_log("info", &format!("[*] JS secrets scan: {}", url));

        let resp = match client.get(url).send().await {
            Ok(r) => r,
            Err(_) => continue,
        };
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let bytes = resp.bytes().await.unwrap_or_default();
        let truncated = if bytes.len() > 2 * 1024 * 1024 {
            &bytes[..2 * 1024 * 1024]
        } else {
            &bytes
        };

        for secret in arkenar_secrets::scan_bytes(truncated, content_type.as_deref()) {
            results.push(JsSecret {
                url: url.clone(),
                secret_type: secret.kind,
                matched_value: secret.matched,
                line_number: secret.line,
            });
        }
    }

    Ok(results)
}
