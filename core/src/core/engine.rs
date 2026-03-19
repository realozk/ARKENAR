use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use futures::{stream, StreamExt};
use log::warn;
use tokio::sync::{mpsc, Semaphore};
use reqwest::Method;
use reqwest::header::HeaderMap;
use url::Url;

use crate::core::throttle::ThrottleController;
use crate::core::mutator::{self, InjectionPoint};
use crate::core::result_aggregator::ScanResult;
use crate::core::target_manager::TargetManager;
use crate::core::VulnerabilityType;
use crate::http::{HttpClient, HttpRequest};
use crate::utils::detector::VulnerabilityDetector;
use crate::utils::payload_loader::PayloadLoader;
use crate::utils::fingerprint::{fingerprint_response, TechProfile};

pub struct ScanEngine {
    target_manager: TargetManager,
    client: Arc<HttpClient>,
    payload_loader: Arc<PayloadLoader>,
    detector: Arc<VulnerabilityDetector>,
    throttle: Arc<ThrottleController>,
    concurrency_limit: usize,
}

impl ScanEngine {
    pub fn new(
        target_manager: TargetManager,
        client: Arc<HttpClient>,
        concurrency_limit: usize,
        rate_limit: u64,
        custom_payloads: Option<&str>,
    ) -> Self {
        Self {
            target_manager,
            client,
            payload_loader: Arc::new(PayloadLoader::load_with_extra(custom_payloads)),
            detector: Arc::new(VulnerabilityDetector::new()),
            throttle: Arc::new(ThrottleController::new(rate_limit)),
            concurrency_limit,
        }
    }

    pub async fn run(mut self, result_tx: mpsc::Sender<ScanResult>, abort: Arc<AtomicBool>) {
        let network_semaphore = Arc::new(Semaphore::new(self.concurrency_limit));
        let target_semaphore = Arc::new(Semaphore::new(100));
        let mut tasks = Vec::new();

        while let Some(target_url) = self.target_manager.next() {
            if abort.load(Ordering::Relaxed) {
                break;
            }

            let permit = match target_semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => {
                    warn!("Target semaphore closed — stopping engine.");
                    break;
                }
            };

            let client = Arc::clone(&self.client);
            let payload_loader = Arc::clone(&self.payload_loader);
            let detector = Arc::clone(&self.detector);
            let throttle = Arc::clone(&self.throttle);
            let tx = result_tx.clone();
            let network_sem = Arc::clone(&network_semaphore);
            let abort_task = Arc::clone(&abort);

            let handle = tokio::spawn(async move {
                let _permit = permit;

                let request = match create_request_from_url(&target_url) {
                    Ok(req) => req,
                    Err(e) => {
                        warn!("Failed to parse URL {}: {}", target_url, e);
                        return;
                    }
                };

                if abort_task.load(Ordering::Relaxed) {
                    return;
                }

                let canary_req = mutator::build_canary_request(&request);

                let reflects = {
                    let _net_permit = network_sem.acquire().await.ok();
                    throttle.wait().await;
                    match client.send_request(&canary_req).await {
                        Ok(resp) => {
                            let status = resp.status().as_u16();
                            throttle.record_response(status);
                            let bytes = resp.bytes().await.unwrap_or_default();
                            let body = String::from_utf8_lossy(&bytes);
                            body.contains(mutator::CANARY_TOKEN)
                        }
                        Err(_) => false,
                    }
                };

                let skip_xss = !reflects; // ← defined here, passed below

                let fp_req = match create_request_from_url(&target_url) {
                    Ok(r) => r,
                    Err(_) => request.clone(),
                };

                let tech_profile = {
                    let _net_permit = network_sem.acquire().await.ok();
                    throttle.wait().await;
                    match client.send_request(&fp_req).await {
                        Ok(resp) => {
                            throttle.record_response(resp.status().as_u16());
                            let headers = resp.headers().clone();
                            let bytes = resp.bytes().await.unwrap_or_default();
                            let body = String::from_utf8_lossy(&bytes);
                            fingerprint_response(&headers, &body)
                        }
                        Err(_) => TechProfile::default(),
                    }
                };

                let tech_profile = Arc::new(tech_profile);

                scan_single_request(
                    Arc::new(request),
                    client,
                    payload_loader,
                    detector,
                    throttle,
                    tx,
                    network_sem,
                    abort_task,
                    tech_profile,
                    skip_xss, // ← passed here
                ).await;
            });

            tasks.push(handle);
        }

        drop(result_tx);

        for result in futures::future::join_all(tasks).await {
            if let Err(e) = result {
                warn!("Scan task panicked: {}", e);
            }
        }
    }

    pub async fn scan_request(&self, request: HttpRequest, result_tx: mpsc::Sender<ScanResult>) {
        let no_abort = Arc::new(AtomicBool::new(false));
        let network_semaphore = Arc::new(Semaphore::new(self.concurrency_limit));

        scan_single_request(
            Arc::new(request),
            Arc::clone(&self.client),
            Arc::clone(&self.payload_loader),
            Arc::clone(&self.detector),
            Arc::clone(&self.throttle),
            result_tx,
            network_semaphore,
            no_abort,
            Arc::new(crate::utils::fingerprint::TechProfile::default()),
            false, // manual studio scan — run all payloads including XSS
        ).await;
    }
}

fn create_request_from_url(url_str: &str) -> Result<HttpRequest, url::ParseError> {
    let url = Url::parse(url_str)?;
    let headers = HeaderMap::new();
    let body = String::new();
    Ok(HttpRequest::new(Method::GET, url, headers, body))
}

fn extract_server(response: &reqwest::Response) -> Option<String> {
    response.headers()
        .get("server")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

fn headers_to_vec(headers: &HeaderMap) -> Vec<(String, String)> {
    headers.iter().map(|(k, v)| {
        (k.to_string(), v.to_str().unwrap_or_default().to_string())
    }).collect()
}

async fn scan_single_request(
    request: Arc<HttpRequest>,
    client: Arc<HttpClient>,
    payload_loader: Arc<PayloadLoader>,
    detector: Arc<VulnerabilityDetector>,
    throttle: Arc<ThrottleController>,
    result_tx: mpsc::Sender<ScanResult>,
    network_semaphore: Arc<Semaphore>,
    abort: Arc<AtomicBool>,
    tech_profile: Arc<TechProfile>,
    skip_xss: bool, // ← correctly named now
) {
    let injection_points = mutator::extract_injection_points(&request);

    if injection_points.is_empty() {
        let _ = basic_scan(&request, &client, &detector, &result_tx, &network_semaphore).await;
        return;
    }

    let mut scan_tasks: Vec<(InjectionPoint, String)> = Vec::new();

    for point in &injection_points {
        let payloads = payload_loader.get_payloads_for_point_tech_aware(point, &tech_profile);
        for payload in payloads {
            if skip_xss {
                let p = payload.to_lowercase();
                if p.contains("script") || p.contains("alert") || p.contains("onerror")
                    || p.contains("onload") || p.contains("svg") || p.contains("img")
                    || p.contains("iframe") || p.contains("javascript")
                {
                    continue;
                }
            }
            scan_tasks.push((point.clone(), payload));
        }
    }

    stream::iter(scan_tasks)
        .map(|(point, payload)| {
            let request = Arc::clone(&request);
            let client = Arc::clone(&client);
            let detector = Arc::clone(&detector);
            let throttle = Arc::clone(&throttle);
            let result_tx = result_tx.clone();
            let payload_clone = payload.clone();
            let abort = Arc::clone(&abort);
            let network_sem = Arc::clone(&network_semaphore);

            async move {
                if abort.load(Ordering::Relaxed) { return; }

                let mutated_request = mutator::mutate_request(&request, &point, &payload);

                let _permit = match network_sem.acquire().await {
                    Ok(p) => p,
                    Err(_) => return,
                };

                throttle.wait().await;

                let start = Instant::now();
                let response_result = client.send_request(&mutated_request).await;
                let duration_ms = start.elapsed().as_millis();

                match response_result {
                    Ok(response) => {
                        let status_code = response.status().as_u16();
                        throttle.record_response(status_code);
                        let server = extract_server(&response);
                        let content_type = response.headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .map(|s| s.to_string());

                        let bytes = response.bytes().await.unwrap_or_default();
                        let body = String::from_utf8_lossy(&bytes);

                        let vuln = detector.detect(
                            &body,
                            &payload,
                            content_type.as_deref(),
                            duration_ms,
                        );

                        if let Some(vuln_type) = vuln {
                            let vuln_label = format_vuln_type(&vuln_type, &point);
                            let result = ScanResult {
                                url: mutated_request.url.to_string(),
                                vuln_type: vuln_label,
                                payload: payload_clone,
                                timing_ms: duration_ms,
                                status_code,
                                server,
                                method: mutated_request.method.to_string(),
                                request_headers: headers_to_vec(&mutated_request.headers),
                                request_body: if mutated_request.body.is_empty() { None } else { Some(mutated_request.body.clone()) },
                            };
                            let _ = result_tx.send(result).await;
                        }
                    }

                    Err(e) => {
                        if e.is_timeout() {
                            let p_lower = payload_clone.to_lowercase();
                            if p_lower.contains("sleep")
                                || p_lower.contains("waitfor")
                                || p_lower.contains("pgsleep")
                                || p_lower.contains("benchmark")
                            {
                                let vuln_label = format_vuln_type(&VulnerabilityType::BlindSqlInjection, &point);
                                let result = ScanResult {
                                    url: mutated_request.url.to_string(),
                                    vuln_type: vuln_label,
                                    payload: payload_clone,
                                    timing_ms: duration_ms,
                                    status_code: 0,
                                    server: None,
                                    method: mutated_request.method.to_string(),
                                    request_headers: headers_to_vec(&mutated_request.headers),
                                    request_body: if mutated_request.body.is_empty() { None } else { Some(mutated_request.body.clone()) },
                                };
                                let _ = result_tx.send(result).await;
                            }
                        }
                    }
                }
            }
        })
        .buffer_unordered(1000)
        .collect::<Vec<()>>()
        .await;
}

fn format_vuln_type(vuln: &VulnerabilityType, point: &InjectionPoint) -> String {
    let type_str = vuln.to_string();
    match point {
        InjectionPoint::UrlParam(param) => format!("{} [param: {}]", type_str, param),
        InjectionPoint::Header(header) => format!("{} [header: {}]", type_str, header),
        InjectionPoint::JsonField(field) => format!("{} [json: {}]", type_str, field),
        InjectionPoint::FormParam(param) => format!("{} [form: {}]", type_str, param),
    }
}

async fn basic_scan(
    request: &HttpRequest,
    client: &HttpClient,
    detector: &VulnerabilityDetector,
    result_tx: &mpsc::Sender<ScanResult>,
    network_semaphore: &Arc<Semaphore>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let _permit = network_semaphore.acquire().await.ok();

    let start = Instant::now();
    let response = client.send_request(request).await?;
    let duration_ms = start.elapsed().as_millis();

    let status_code = response.status().as_u16();
    let server = extract_server(&response);
    let content_type = response.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let bytes = response.bytes().await?;
    let body = String::from_utf8_lossy(&bytes);

    let vuln = detector.detect(&body, "", content_type.as_deref(), duration_ms);

    if let Some(vuln_type) = vuln {
        let result = ScanResult {
            url: request.url.to_string(),
            vuln_type: vuln_type.to_string(),
            payload: String::new(),
            timing_ms: duration_ms,
            status_code,
            server,
            method: request.method.to_string(),
            request_headers: headers_to_vec(&request.headers),
            request_body: if request.body.is_empty() { None } else { Some(request.body.clone()) },
        };
        let _ = result_tx.send(result).await;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
    use reqwest::Method;
    use url::Url;

    #[allow(dead_code)]
    fn create_test_request() -> HttpRequest {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        let url = Url::parse("https://example.com/api?id=123&name=test").unwrap();
        let body = r#"{"user":"john","active":true}"#.to_string();
        HttpRequest::new(Method::POST, url, headers, body)
    }

    #[test]
    fn test_engine_creation() {
        let target_manager = TargetManager::new();
        let client = Arc::new(HttpClient::new(10, None, &vec![]).expect("test: failed to build HTTP client"));
        let engine = ScanEngine::new(target_manager, client, 10, 0, None);
        assert_eq!(engine.concurrency_limit, 10);
    }

    #[test]
    fn test_create_request_from_url() {
        let request = create_request_from_url("https://example.com/test?id=123").unwrap();
        assert_eq!(request.method, Method::GET);
        assert!(request.url.query().unwrap().contains("id=123"));
    }
    
    #[test]
fn test_detects_sqli_error() {
    let detector = VulnerabilityDetector::new();
    let body = "You have an error in your SQL syntax near 'OR 1=1'";
    let result = detector.detect(body, "' OR 1=1--", Some("text/html"), 100);
    assert!(result.is_some());
    assert_eq!(result.unwrap(), VulnerabilityType::SqlInjection);
}

#[test]
fn test_detects_blind_sqli_on_timeout() {
    let detector = VulnerabilityDetector::new();
    // Simulate a 6 second response — above the 5000ms threshold
    let result = detector.detect("", "' OR SLEEP(5)--", Some("text/html"), 6000);
    assert!(result.is_some());
    assert_eq!(result.unwrap(), VulnerabilityType::BlindSqlInjection);
}

#[test]
fn test_no_false_positive_on_clean_response() {
    let detector = VulnerabilityDetector::new();
    let body = "<html><body>Welcome to our site</body></html>";
    let result = detector.detect(body, "' OR 1=1--", Some("text/html"), 100);
    assert!(result.is_none());
}

}
