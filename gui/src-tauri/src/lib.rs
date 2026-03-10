use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use arkenar_core::{
    HttpClient, ResultAggregator, ScanConfig, ScanEngine, ScanEventSink, ScanResult,
    SinkRef, TargetManager, installer, read_lines,
    run_katana_crawler, run_nuclei_scan,
};

mod reporting;
mod notifications;


#[derive(Clone, Serialize)]
struct ScanLogEvent {
    level: String,
    message: String,
}

#[derive(Clone, Serialize)]
struct ScanStatsEvent {
    targets: usize,
    urls: usize,
    critical: usize,
    medium: usize,
    safe: usize,
    elapsed: String,
}

#[derive(Clone, Serialize, serde::Deserialize)]
pub struct ScanFindingEvent {
    pub url: String,
    pub vuln_type: String,
    pub payload: String,
    pub status_code: u16,
    pub timing_ms: u128,
    pub server: Option<String>,
    pub curl_cmd: String,
}


/// Sink implementation that emits Tauri events to the React frontend.
struct TauriSink {
    app: AppHandle,
    webhook_url: Option<String>,
}

impl TauriSink {
    fn new_ref(app: AppHandle, webhook_url: Option<String>) -> SinkRef {
        Arc::new(Self { app, webhook_url })
    }
}

impl ScanEventSink for TauriSink {
    fn on_log(&self, level: &str, message: &str) {
        let _ = self.app.emit("scan-log", ScanLogEvent {
            level: level.to_string(),
            message: message.to_string(),
        });
    }

    fn on_finding(&self, result: &ScanResult) {
        let _ = self.app.emit("scan-finding", ScanFindingEvent {
            url: result.url.clone(),
            vuln_type: result.vuln_type.clone(),
            payload: result.payload.clone(),
            status_code: result.status_code,
            timing_ms: result.timing_ms,
            server: result.server.clone(),
            curl_cmd: result.to_curl(),
        });
        self.on_log("error", &format!(
            "{} detected → {} (payload: {})",
            result.vuln_type, result.url, result.payload
        ));

        if let Some(ref url) = self.webhook_url {
            let url = url.clone();
            let r = result.clone();
            tokio::spawn(async move {
                crate::notifications::send_webhook(&url, &r).await;
            });
        }
    }

    fn on_progress(&self, phase: &str, current: usize, total: usize) {
        if total > 0 {
            self.on_log("phase", &format!("{} ({}/{})", phase, current, total));
        } else {
            self.on_log("phase", phase);
        }
    }
}


static SCAN_RUNNING: AtomicBool = AtomicBool::new(false);

/// Per-scan abort flag held in an Arc so the scan task and stop_scan both
/// operate on the same value. Replaced atomically at the start of each scan.
static CURRENT_ABORT: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

/// RAII guard that always resets SCAN_RUNNING when it is dropped, even if the
/// scan task panics. Also clears the per-scan abort Arc so it can be GC'd.
struct ScanGuard;
impl Drop for ScanGuard {
    fn drop(&mut self) {
        if let Ok(mut guard) = CURRENT_ABORT.lock() {
            *guard = None;
        }
        SCAN_RUNNING.store(false, Ordering::SeqCst);
    }
}

/// Returns an error if `val` contains shell metacharacters or path-traversal.
fn validate_text_field(name: &str, val: &str) -> Result<(), String> {
    const FORBIDDEN: &[char] = &[';', '|', '&', '$', '>', '<', '`', '(', ')', '{', '}', '\n', '\r', '\0'];
    if val.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err(format!("Field '{}' contains forbidden characters.", name));
    }
    if val.contains("../") || val.contains("..\\") {
        return Err(format!("Field '{}' contains a path-traversal sequence.", name));
    }
    Ok(())
}

/// Validates the `tags` field to prevent flag injection (e.g. `-exec`, `--config`).
fn validate_tags_field(tags: &str) -> Result<(), String> {
    if tags.is_empty() {
        return Ok(());
    }
    for segment in tags.split(',') {
        let s = segment.trim();
        if s.starts_with('-') {
            return Err("Tags must not contain CLI flags (e.g. -exec, --config).".to_string());
        }
    }
    if !tags.chars().all(|c| c.is_alphanumeric() || matches!(c, ',' | '-' | '_' | ' ')) {
        return Err("Field 'tags' contains invalid characters.".to_string());
    }
    Ok(())
}

/// Validates all user-supplied string fields in `ScanConfig` before any
/// subprocess is spawned or network call is made.
fn validate_scan_config(config: &ScanConfig) -> Result<(), String> {
    validate_text_field("proxy",    &config.proxy)?;
    validate_text_field("headers",  &config.headers)?;
    validate_text_field("payloads", &config.payloads)?;
    validate_text_field("output",   &config.output)?;
    // Target is a URL: only block chars that cause header injection or null-byte
    // issues. Parentheses and other URL-legal characters must be permitted.
    if config.target.chars().any(|c| matches!(c, '\n' | '\r' | '\0')) {
        return Err("Field 'target' contains forbidden characters.".to_string());
    }
    if config.target.contains("../") || config.target.contains("..\\") {
        return Err("Field 'target' contains a path-traversal sequence.".to_string());
    }
    validate_text_field("listFile", &config.list_file)?;

    if !config.target.is_empty() {
        let lower = config.target.to_lowercase();
        if !lower.starts_with("http://") && !lower.starts_with("https://") {
            return Err("Target must start with http:// or https://.".to_string());
        }
    }

    if !config.list_file.is_empty() {
        if config.list_file.starts_with('/') || config.list_file.starts_with('~') || config.list_file.starts_with('\\') {
            return Err("Target list path must be relative (no leading /, ~, or backslash).".to_string());
        }
        // Block Windows absolute paths (e.g. C:\path)
        if config.list_file.len() >= 2
            && config.list_file.chars().nth(1) == Some(':')
        {
            return Err("Target list path must be relative (no drive letters).".to_string());
        }
    }

    if config.mode != "simple" && config.mode != "advanced" {
        return Err("Invalid scan mode.".to_string());
    }

    if config.threads < 1 || config.threads > 500 {
        return Err("Threads must be between 1 and 500.".to_string());
    }
    if config.timeout < 1 || config.timeout > 120 {
        return Err("Timeout must be between 1 and 120 seconds.".to_string());
    }
    if config.rate_limit < 1 || config.rate_limit > 5000 {
        return Err("Rate limit must be between 1 and 5000.".to_string());
    }

    validate_tags_field(&config.tags)?;

    if let Some(ref wh) = config.webhook_url {
        if !wh.is_empty() {
            validate_webhook_url(wh)?;
        }
    }
    Ok(())
}

/// Blocks SSRF by requiring HTTPS and rejecting RFC-1918 / loopback hosts.
/// Uses the `url` crate for proper parsing instead of manual string splitting.
fn validate_webhook_url(raw: &str) -> Result<(), String> {
    let parsed = url::Url::parse(raw)
        .map_err(|_| "Webhook URL is not a valid URL.".to_string())?;

    if parsed.scheme() != "https" {
        return Err("Webhook URL must use HTTPS.".to_string());
    }

    let host = parsed.host_str()
        .ok_or_else(|| "Webhook URL has no hostname.".to_string())?
        .to_lowercase();

    if host == "localhost"
        || host == "ip6-localhost"
        || host == "::1"
        || host.ends_with(".local")
        || host.ends_with(".internal")
    {
        return Err("Webhook URL cannot target a local network address.".to_string());
    }

    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        let is_private = match ip {
            std::net::IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
            std::net::IpAddr::V6(v6) => v6.is_loopback(),
        };
        if is_private {
            return Err("Webhook URL cannot target a private/loopback address.".to_string());
        }
    } else {
        for prefix in &["127.", "10.", "0.", "169.254."] {
            if host.starts_with(prefix) {
                return Err("Webhook URL cannot target a private address.".to_string());
            }
        }
        if host.starts_with("192.168.") {
            return Err("Webhook URL cannot target a private address.".to_string());
        }
        if host.starts_with("172.") {
            let second: Option<u8> = host.split('.').nth(1).and_then(|s| s.parse().ok());
            if matches!(second, Some(16..=31)) {
                return Err("Webhook URL cannot target a private address.".to_string());
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn start_scan(app: AppHandle, config: ScanConfig) -> Result<(), String> {
    if SCAN_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err("A scan is already running.".to_string());
    }

    if let Err(e) = validate_scan_config(&config) {
        SCAN_RUNNING.store(false, Ordering::SeqCst);
        return Err(e);
    }

    let abort_flag = Arc::new(AtomicBool::new(false));
    {
        let mut guard = CURRENT_ABORT.lock()
            .map_err(|_| "Internal lock error.".to_string())?;
        *guard = Some(Arc::clone(&abort_flag));
    }

    let sink = TauriSink::new_ref(app.clone(), config.webhook_url.clone());

    let mut targets: Vec<String> = Vec::new();

    if !config.list_file.is_empty() {
        match read_lines(&config.list_file) {
            Ok(lines) => {
                sink.on_log("success", &format!("Loaded {} target(s) from {}", lines.len(), config.list_file));
                targets.extend(lines);
            }
            Err(e) => {
                SCAN_RUNNING.store(false, Ordering::SeqCst);
                return Err(format!("Failed to read '{}': {}", config.list_file, e));
            }
        }
    }

    if !config.target.is_empty() {
        targets.push(config.target.clone());
    }

    if targets.is_empty() {
        SCAN_RUNNING.store(false, Ordering::SeqCst);
        return Err("No targets specified.".to_string());
    }

    tokio::spawn(async move {
        let _guard = ScanGuard; // resets SCAN_RUNNING on ANY exit path (including panics)
        let start_time = Instant::now();
        let total_targets = targets.len();

        sink.on_log("phase", &format!("── Scan started: {} target(s)", total_targets));
        sink.on_log("info", &format!(
            "Mode: {} | Threads: {} | Timeout: {}s | Rate Limit: {} req/s",
            config.mode, config.threads, config.timeout, config.rate_limit
        ));

        if config.dry_run {
            for t in &targets {
                sink.on_log("warn", &format!("[DRY RUN] Would scan target: {}", t));
            }
            sink.on_log("info", "Dry run complete. No requests were sent.");
            let _ = app.emit("scan-complete", ScanStatsEvent {
                targets: total_targets, urls: 0, critical: 0, medium: 0, safe: 0,
                elapsed: format!("{:.1}s", start_time.elapsed().as_secs_f64()),
            });
            return;
        }

        let custom_headers = config.parsed_headers();

        let mut total_urls: usize = 0;
        let mut total_critical: usize = 0;
        let mut total_medium: usize = 0;
        let mut total_safe: usize = 0;

        for (i, target) in targets.iter().enumerate() {
            if abort_flag.load(Ordering::SeqCst) {
                sink.on_log("warn", "Scan aborted by user.");
                break;
            }

            if total_targets > 1 {
                sink.on_log("phase", &format!("━━━ Target {}/{}: {} ━━━", i + 1, total_targets, target));
            }

            let mut target_manager = TargetManager::new();
            target_manager.add_target(target.to_string());

            if config.enable_crawler {
                sink.on_log("phase", "── Phase 1: Katana Crawler");

                match run_katana_crawler(target, &config, &sink).await {
                    Ok(crawled) => {
                        sink.on_log("success", &format!("Discovered {} URL(s).", crawled.len()));
                        total_urls += crawled.len();
                        for u in crawled {
                            target_manager.add_target(u);
                        }
                    }
                    Err(e) => {
                        sink.on_log("error", &format!("Crawler error: {}", e));
                    }
                }
            } else {
                sink.on_log("info", "Katana crawler disabled, skipping Phase 1.");
            }

            if abort_flag.load(Ordering::SeqCst) {
                sink.on_log("warn", "Scan aborted by user.");
                break;
            }

            if config.enable_nuclei {
                sink.on_log("phase", "── Phase 2: Nuclei Scanner");

                if let Err(e) = run_nuclei_scan(target, &config.mode, config.verbose, config.tags_ref(), config.crawler_timeout, &sink).await {
                    sink.on_log("error", &format!("Nuclei error: {}", e));
                } else {
                    sink.on_log("success", "Nuclei scan completed.");
                }
            } else {
                sink.on_log("info", "Nuclei scanner disabled, skipping Phase 2.");
            }

            if abort_flag.load(Ordering::SeqCst) {
                sink.on_log("warn", "Scan aborted by user.");
                break;
            }

            sink.on_log("phase", "── Phase 3: ARKENAR Engine");
            sink.on_log("info", &format!("Scanning with {} threads...", config.threads));

            let proxy_ref = config.proxy_ref().map(|s| s.to_string());
            let proxy_opt = proxy_ref.as_deref();
            let http_client = match HttpClient::new(config.timeout, proxy_opt, &custom_headers) {
                Ok(c) => Arc::new(c),
                Err(e) => {
                    sink.on_log("error", &format!("Failed to build HTTP client: {}", e));
                    break;
                }
            };

            let (result_tx, result_rx) = mpsc::channel::<ScanResult>(200);
            let scanned_count = target_manager.len();
            let engine = ScanEngine::new(
                target_manager,
                Arc::clone(&http_client),
                config.threads,
                config.rate_limit,
                if config.payloads.is_empty() { None } else { Some(&config.payloads) },
            );

            let sink_agg = sink.clone();
            let output_path = config.output.clone();
            let abort_for_engine = Arc::clone(&abort_flag);

            let engine_handle = tokio::spawn(async move {
                engine.run(result_tx, abort_for_engine).await;
            });

            let aggregator_handle = tokio::spawn(async move {
                ResultAggregator::run(result_rx, &output_path, sink_agg).await
            });

            let _ = engine_handle.await;
            if let Ok(results) = aggregator_handle.await {
                let mut vulnerable_urls = std::collections::HashSet::new();
                for r in &results {
                    let vl = r.vuln_type.to_lowercase();
                    if vl.contains("sqli") || vl.contains("sql injection") {
                        total_critical += 1;
                    } else {
                        total_medium += 1;
                    }
                    vulnerable_urls.insert(r.url.clone());
                }
                // Safe = scanned URLs that had no findings.
                total_safe += scanned_count.saturating_sub(vulnerable_urls.len());
            }
        }  // end target loop

        let elapsed = format!("{:.1}s", start_time.elapsed().as_secs_f64());
        sink.on_log("phase", &format!("── Scan Complete ({})", elapsed));

        if total_critical > 0 {
            sink.on_log("error", &format!("{} critical vulnerability(ies) found!", total_critical));
        }
        if total_medium > 0 {
            sink.on_log("warn", &format!("{} medium-severity issue(s) found.", total_medium));
        }
        if total_critical == 0 && total_medium == 0 {
            sink.on_log("success", "No vulnerabilities detected.");
        }

        let _ = app.emit("scan-complete", ScanStatsEvent {
            targets: total_targets,
            urls: total_urls,
            critical: total_critical,
            medium: total_medium,
            safe: total_safe,
            elapsed,
        });
        // _guard drops here — ScanGuard resets SCAN_RUNNING and clears CURRENT_ABORT
    });

    Ok(())
}

#[tauri::command]
async fn stop_scan() -> Result<(), String> {
    if SCAN_RUNNING.load(Ordering::SeqCst) {
        if let Ok(guard) = CURRENT_ABORT.lock() {
            if let Some(ref flag) = *guard {
                flag.store(true, Ordering::SeqCst);
            }
        }
        Ok(())
    } else {
        Err("No scan is currently running.".to_string())
    }
}

#[tauri::command]
async fn check_tools() -> Result<String, String> {
    installer::check_and_install_tools().await;
    Ok("Tools verified.".to_string())
}

#[tauri::command]
async fn test_webhook(url: String) -> Result<(), String> {
    validate_webhook_url(&url)?;

    let is_discord = url::Url::parse(&url)
        .map(|p| {
            let h = p.host_str().unwrap_or("").to_lowercase();
            h == "discord.com" || h.ends_with(".discord.com")
        })
        .unwrap_or(false);
    let is_slack = url::Url::parse(&url)
        .map(|p| p.host_str().unwrap_or("").to_lowercase() == "hooks.slack.com")
        .unwrap_or(false);

    let payload = if is_discord {
        serde_json::json!({
            "embeds": [{
                "title": "\u{2705} Arkenar is connected!",
                "description": "Your webhook is configured correctly. You will receive alerts here when vulnerabilities are found.",
                "color": 52158,
                "footer": { "text": "Arkenar Scanner" }
            }]
        })
    } else if is_slack {
        serde_json::json!({ "text": "\u{2705} *Arkenar is connected!* Your webhook is working correctly." })
    } else {
        serde_json::json!({ "event": "test", "message": "Arkenar is connected!" })
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let resp = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Webhook test failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Webhook returned HTTP {}", resp.status().as_u16()));
    }

    Ok(())
}





#[tauri::command]
async fn export_report(
    findings: Vec<ScanFindingEvent>,
    config: arkenar_core::ScanConfig,
    elapsed: String,
    output_path: String,
) -> Result<String, String> {
    if output_path.is_empty() {
        return Err("Output path must not be empty.".to_string());
    }
    // Prevent path traversal and restrict to .html / .htm outputs.
    if output_path.contains("..") {
        return Err("Report path must not contain '..'.".to_string());
    }
    let lower = output_path.to_lowercase();
    if !lower.ends_with(".html") && !lower.ends_with(".htm") {
        return Err("Report path must end with .html or .htm.".to_string());
    }
    let html = reporting::generate_html_report(&findings, &config, &elapsed);
    std::fs::write(&output_path, html)
        .map_err(|e| format!("Failed to write report: {}", e))?;
    Ok(output_path)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![start_scan, stop_scan, check_tools, test_webhook, export_report])
        .setup(|app| {
            let handle = app.handle().clone();
            let setup_sink = TauriSink::new_ref(handle.clone(), None);
            tauri::async_runtime::spawn(async move {
                setup_sink.on_log("info", "Checking dependencies (Katana, Nuclei)...");
                installer::check_and_install_tools().await;
                setup_sink.on_log("success", "Dependencies verified. Ready to scan.");
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
