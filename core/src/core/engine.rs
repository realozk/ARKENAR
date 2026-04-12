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
use crate::deep_hunter::JsAnalyzer;
use crate::http::{HttpClient, HttpRequest, MAX_RESPONSE_BODY};
use crate::utils::detector::VulnerabilityDetector;
use crate::utils::payload_loader::PayloadLoader;
use crate::utils::fingerprint::{fingerprint_response, TechFingerprinter, FingerprintResult, TechProfile};
use crate::ScanConfig;

pub struct ScanEngine {
    target_manager: TargetManager,
    client: Arc<HttpClient>,
    payload_loader: Arc<PayloadLoader>,
    detector: Arc<VulnerabilityDetector>,
    throttle: Arc<ThrottleController>,
    concurrency_limit: usize,
    enable_fingerprint: bool,
    enable_smart_payloads: bool,
    enable_js_analysis: bool,
    enable_param_fuzz: bool,
    scope_regex: Option<regex::Regex>,
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
            enable_fingerprint: true,
            enable_smart_payloads: true,
            enable_js_analysis: false,
            enable_param_fuzz: false,
            scope_regex: None,
        }
    }

    pub fn with_config(
        target_manager: TargetManager,
        client: Arc<HttpClient>,
        concurrency_limit: usize,
        rate_limit: u64,
        custom_payloads: Option<&str>,
        config: &ScanConfig,
    ) -> Self {
        Self {
            target_manager,
            client,
            payload_loader: Arc::new(PayloadLoader::load_with_extra(custom_payloads)),
            detector: Arc::new(VulnerabilityDetector::new()),
            throttle: Arc::new(ThrottleController::new(rate_limit)),
            concurrency_limit,
            enable_fingerprint: config.enable_fingerprint,
            enable_smart_payloads: config.enable_smart_payloads,
            enable_js_analysis: config.enable_js_analysis,
            enable_param_fuzz: config.enable_param_fuzz,
            scope_regex: if config.scope_regex.is_empty() {
                None
            } else {
                match regex::Regex::new(&config.scope_regex) {
                    Ok(r) => Some(r),
                    Err(e) => {
                        warn!("Invalid scope_regex '{}': {} — ignoring", config.scope_regex, e);
                        None
                    }
                }
            },
        }
    }

    pub async fn run(mut self, result_tx: mpsc::Sender<ScanResult>, abort: Arc<AtomicBool>) {
        let network_semaphore = Arc::new(Semaphore::new(self.concurrency_limit));
        let target_semaphore = Arc::new(Semaphore::new(100));
        let fingerprinter = Arc::new(TechFingerprinter::new());
        let js_analyzer = Arc::new(JsAnalyzer::new());

        let mut tasks = Vec::new();

        while let Some(target_url) = self.target_manager.next() {
            if let Some(ref re) = self.scope_regex {
                if !re.is_match(&target_url) {
                    continue;
                }
            }

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
            let fingerprinter = Arc::clone(&fingerprinter);
            let js_analyzer = Arc::clone(&js_analyzer);
            let enable_fingerprint = self.enable_fingerprint;
            let enable_smart_payloads = self.enable_smart_payloads;
            let enable_js_analysis = self.enable_js_analysis;
            let enable_param_fuzz = self.enable_param_fuzz;

            let handle = tokio::spawn(async move {
                let _permit = permit;

                let request = match create_request_from_url(&target_url) {
                    Ok(req) => req,
                    Err(e) => {
                        warn!("Failed to parse URL {}: {}", target_url, e);
                        return vec![];
                    }
                };

                if abort_task.load(Ordering::Relaxed) { return vec![]; }

                let canary_req = mutator::build_canary_request(&request);

                let (reflects, page_body) = {
                    let _net_permit = network_sem.acquire().await.ok();
                    throttle.wait().await;
                    match client.send_request(&canary_req).await {
                        Ok(resp) => {
                            let status = resp.status().as_u16();
                            throttle.record_response(status);
                            match read_body_capped(resp).await {
                                Ok(body) => {
                                    let r = body.contains(mutator::CANARY_TOKEN);
                                    (r, body)
                                }
                                Err(_) => (false, String::new()),
                            }
                        }
                        Err(_) => (false, String::new()),
                    }
                };

                let mut extra_targets: Vec<String> = Vec::new();

                if enable_js_analysis && !page_body.is_empty() {
                    let js_urls = js_analyzer.extract_js_urls(&page_body, &target_url);
                    for js_url in js_urls {
                        let js_req = match create_request_from_url(&js_url) {
                            Ok(r) => r,
                            Err(_) => continue,
                        };
                        let _net_permit = network_sem.acquire().await.ok();
                        throttle.wait().await;
                        if let Ok(js_resp) = client.send_request(&js_req).await {
                            throttle.record_response(js_resp.status().as_u16());
                            if let Ok(js_body) = read_body_capped(js_resp).await {
                                let endpoints = js_analyzer.extract_endpoints(&js_body);
                                for path in endpoints {
                                    if let Ok(base) = Url::parse(&target_url) {
                                        if let Ok(full) = base.join(&path) {
                                            extra_targets.push(full.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if !reflects {
                    return extra_targets;
                }

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
                            match read_body_capped(resp).await {
                                Ok(body) => fingerprint_response(&headers, &body),
                                Err(_) => TechProfile::default(),
                            }
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
                    fingerprinter,
                    enable_fingerprint,
                    enable_smart_payloads,
                    enable_param_fuzz,
                ).await;

                extra_targets
            });

            tasks.push(handle);
        }

        drop(result_tx);

        for result in futures::future::join_all(tasks).await {
            match result {
                Ok(extra) => {
                    for url in extra {
                        self.target_manager.add_target(url);
                    }
                }
                Err(e) => warn!("Scan task panicked: {}", e),
            }
        }
    }

    pub async fn scan_request(&self, request: HttpRequest, result_tx: mpsc::Sender<ScanResult>) {
        let no_abort = Arc::new(AtomicBool::new(false));
        let network_semaphore = Arc::new(Semaphore::new(self.concurrency_limit));
        let fingerprinter = Arc::new(TechFingerprinter::new());

        scan_single_request(
            Arc::new(request),
            Arc::clone(&self.client),
            Arc::clone(&self.payload_loader),
            Arc::clone(&self.detector),
            Arc::clone(&self.throttle),
            result_tx,
            network_semaphore,
            no_abort,
            Arc::new(TechProfile::default()),
            fingerprinter,
            self.enable_fingerprint,
            self.enable_smart_payloads,
            self.enable_param_fuzz,
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

async fn read_body_capped(resp: reqwest::Response) -> Result<String, reqwest::Error> {
    let bytes = resp.bytes().await?;
    let len = bytes.len().min(MAX_RESPONSE_BODY);
    Ok(String::from_utf8_lossy(&bytes[..len]).into_owned())
}

#[allow(clippy::too_many_arguments)]
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
    fingerprinter: Arc<TechFingerprinter>,
    enable_fingerprint: bool,
    enable_smart_payloads: bool,
    enable_param_fuzz: bool,
) {
    let injection_points = mutator::extract_injection_points(&request);

    if injection_points.is_empty() {
        let _ = basic_scan(
            &request,
            &client,
            &detector,
            &result_tx,
            &network_semaphore,
            &fingerprinter,
            enable_fingerprint,
        ).await;
        return;
    }

    let mut scan_tasks: Vec<(InjectionPoint, String)> = Vec::new();

    for point in &injection_points {
        let payloads = if enable_smart_payloads {
            match point {
                InjectionPoint::UrlParam(name) | InjectionPoint::FormParam(name) => {
                    payload_loader.contextual_payloads(name)
                }
                _ => payload_loader.get_payloads_for_point_tech_aware(point, &tech_profile),
            }
        } else {
            payload_loader.get_payloads_for_point_tech_aware(point, &tech_profile)
        };
        for payload in payloads {
            scan_tasks.push((point.clone(), payload));
        }
    }

    let concurrency = network_semaphore.available_permits().max(1);

    if enable_param_fuzz {
        if let Ok(parsed_url) = url::Url::parse(&request.url.to_string()) {
            let existing_params: std::collections::HashSet<String> = scan_tasks
                .iter()
                .filter_map(|(point, _)| match point {
                    InjectionPoint::UrlParam(n) | InjectionPoint::FormParam(n) => Some(n.clone()),
                    _ => None,
                })
                .collect();

            for (name, _value) in parsed_url.query_pairs() {
                let name = name.to_string();
                if existing_params.contains(&name) {
                    continue;
                }
                let payloads = payload_loader.contextual_payloads(&name);
                for payload in payloads {
                    scan_tasks.push((InjectionPoint::UrlParam(name.clone()), payload));
                }
            }
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
            let fingerprinter = Arc::clone(&fingerprinter);

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
                        let resp_headers = response.headers().clone();

                        let body = match read_body_capped(response).await {
                            Ok(b) => b,
                            Err(_) => return,
                        };

                        let fp_result: FingerprintResult = if enable_fingerprint {
                            fingerprinter.analyze(status_code, &resp_headers, &body)
                        } else {
                            FingerprintResult { tech_stack: vec![], waf_detected: None }
                        };

                        let vuln = detector.detect(
                            &body,
                            &payload,
                            content_type.as_deref(),
                            duration_ms,
                            Some(status_code),
                            Some(&resp_headers),
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
                                tech_stack: fp_result.tech_stack.clone(),
                                waf_detected: fp_result.waf_detected.clone(),
                                verified: false,
                                notes: None,
                            };
                            let _ = result_tx.send(result).await;
                        }
                    }
                    Err(_) => {}
                }
            }
        })
        .buffer_unordered(concurrency)
        .collect::<Vec<()>>()
        .await;
}

fn format_vuln_type(vuln: &VulnerabilityType, point: &InjectionPoint) -> String {
    let type_str = vuln.to_string();
    match point {
        InjectionPoint::UrlParam(param)  => format!("{} [param: {}]", type_str, param),
        InjectionPoint::Header(header)   => format!("{} [header: {}]", type_str, header),
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
    fingerprinter: &TechFingerprinter,
    enable_fingerprint: bool,
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
    let resp_headers = response.headers().clone();

    let body = read_body_capped(response).await?;

    let fp_result = if enable_fingerprint {
        fingerprinter.analyze(status_code, &resp_headers, &body)
    } else {
        FingerprintResult { tech_stack: vec![], waf_detected: None }
    };

    let vuln = detector.detect(
        &body,
        "",
        content_type.as_deref(),
        duration_ms,
        Some(status_code),
        Some(&resp_headers),
    );

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
            tech_stack: fp_result.tech_stack,
            waf_detected: fp_result.waf_detected,
            verified: false,
            notes: None,
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
}