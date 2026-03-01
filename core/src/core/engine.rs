use std::sync::Arc;
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

/// Smart mutation-based vulnerability scanner engine
///
/// The engine:
/// 1. Takes targets from TargetManager or HttpRequest directly
/// 2. Extracts all injection points using the mutator
/// 3. Gets context-aware payloads for each injection point
/// 4. Mutates requests and sends them concurrently with precise timing
/// 5. Passes responses to the detector for vulnerability classification
pub struct ScanEngine {
    target_manager: TargetManager,
    client: Arc<HttpClient>,
    payload_loader: Arc<PayloadLoader>,
    detector: Arc<VulnerabilityDetector>,
    throttle: Arc<ThrottleController>,
    concurrency_limit: usize,
}

impl ScanEngine {
    /// Creates a new `ScanEngine` with target manager
    pub fn new(
        target_manager: TargetManager,
        client: Arc<HttpClient>,
        concurrency_limit: usize,
    ) -> Self {
        Self {
            target_manager,
            client,
            payload_loader: Arc::new(PayloadLoader::load()),
            detector: Arc::new(VulnerabilityDetector::new()),
            throttle: Arc::new(ThrottleController::new()),
            concurrency_limit,
        }
    }

    /// Runs the scan engine on all targets from the target manager
    pub async fn run(mut self, result_tx: mpsc::Sender<ScanResult>) {
        let semaphore = Arc::new(Semaphore::new(self.concurrency_limit));
        let mut tasks = Vec::new();

        while let Some(target_url) = self.target_manager.next() {
            let permit = semaphore
                .clone()
                .acquire_owned()
                .await
                .expect("semaphore closed unexpectedly");

            let client = Arc::clone(&self.client);
            let payload_loader = Arc::clone(&self.payload_loader);
            let detector = Arc::clone(&self.detector);
            let throttle = Arc::clone(&self.throttle);
            let tx = result_tx.clone();
            let concurrency = self.concurrency_limit;

            let handle = tokio::spawn(async move {
                let _permit = permit;

                let request = match create_request_from_url(&target_url) {
                    Ok(req) => req,
                    Err(e) => {
                        warn!("Failed to parse URL {}: {}", target_url, e);
                        return;
                    }
                };

                scan_single_request(
                    request,
                    client,
                    payload_loader,
                    detector,
                    throttle,
                    tx,
                    concurrency,
                ).await;
            });

            tasks.push(handle);
        }

        drop(result_tx);

        for task in tasks {
            let _ = task.await;
        }
    }

    /// Scans a single HTTP request directly
    pub async fn scan_request(&self, request: HttpRequest, result_tx: mpsc::Sender<ScanResult>) {
        scan_single_request(
            request,
            Arc::clone(&self.client),
            Arc::clone(&self.payload_loader),
            Arc::clone(&self.detector),
            Arc::clone(&self.throttle),
            result_tx,
            self.concurrency_limit,
        ).await;
    }
}

/// Creates an HttpRequest from a URL string
fn create_request_from_url(url_str: &str) -> Result<HttpRequest, url::ParseError> {
    let url = Url::parse(url_str)?;
    let headers = HeaderMap::new();
    let body = String::new();

    Ok(HttpRequest::new(Method::GET, url, headers, body))
}

/// Extracts server name from response headers
fn extract_server(response: &reqwest::Response) -> Option<String> {
    response.headers()
        .get("server")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

fn headers_to_vec(headers: &HeaderMap) -> Vec<(String, String)> {
    headers.iter().map(|(k, v)| {
        (k.to_string(), v.to_str().unwrap_or("").to_string())
    }).collect()
}

/// Scans a single HTTP request using mutation-based injection.
/// All results are sent via `result_tx` for the aggregator to handle.
async fn scan_single_request(
    request: HttpRequest,
    client: Arc<HttpClient>,
    payload_loader: Arc<PayloadLoader>,
    detector: Arc<VulnerabilityDetector>,
    throttle: Arc<ThrottleController>,
    result_tx: mpsc::Sender<ScanResult>,
    concurrency_limit: usize,
) {
    let injection_points = mutator::extract_injection_points(&request);

    if injection_points.is_empty() {
        let _ = basic_scan(&request, &client, &detector, &result_tx).await;
        return;
    }

    let mut scan_tasks: Vec<(InjectionPoint, String)> = Vec::new();

    for point in &injection_points {
        let payloads = payload_loader.get_payloads_for_point(point);
        for payload in payloads {
            scan_tasks.push((point.clone(), payload));
        }
    }

    let request = Arc::new(request);

    stream::iter(scan_tasks)
        .map(|(point, payload)| {
            let request = Arc::clone(&request);
            let client = Arc::clone(&client);
            let detector = Arc::clone(&detector);
            let throttle = Arc::clone(&throttle);
            let result_tx = result_tx.clone();
            let payload_clone = payload.clone();

            async move {
                let mutated_request = mutator::mutate_request(&request, &point, &payload);

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

                        if let Ok(body) = response.text().await {
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
                    }
                    Err(_) => {
                    }
                }
            }
        })
        .buffer_unordered(concurrency_limit)
        .collect::<Vec<()>>()
        .await;
}

/// Format vulnerability type with injection point context
fn format_vuln_type(vuln: &VulnerabilityType, point: &InjectionPoint) -> String {
    let type_str = vuln.to_string();
    match point {
        InjectionPoint::UrlParam(param) => format!("{} [param: {}]", type_str, param),
        InjectionPoint::Header(header) => format!("{} [header: {}]", type_str, header),
        InjectionPoint::JsonField(field) => format!("{} [json: {}]", type_str, field),
        InjectionPoint::FormParam(param) => format!("{} [form: {}]", type_str, param),
    }
}

/// Performs a basic scan for URLs without structured injection points 
async fn basic_scan(
    request: &HttpRequest,
    client: &HttpClient,
    detector: &VulnerabilityDetector,
    result_tx: &mpsc::Sender<ScanResult>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let start = Instant::now();
    let response = client.send_request(request).await?;
    let duration_ms = start.elapsed().as_millis();

    let status_code = response.status().as_u16();
    let server = extract_server(&response);
    let content_type = response.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let body = response.text().await?;

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
        let client = Arc::new(HttpClient::new(10, None, &vec![]));
        let engine = ScanEngine::new(target_manager, client, 10);

        assert_eq!(engine.concurrency_limit, 10);
    }

    #[test]
    fn test_create_request_from_url() {
        let request = create_request_from_url("https://example.com/test?id=123").unwrap();
        assert_eq!(request.method, Method::GET);
        assert!(request.url.query().unwrap().contains("id=123"));
    }
}
