use clap::{CommandFactory, Parser};
use colored::*;
use std::io::Write;
use std::process;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::mpsc;
mod report;
mod validation;
use report::Severity;
use validation::{validate_text_field, validate_webhook_url};

use arkenar_core::{
    installer, read_lines, resolve_domain, run_native_crawler, run_subfinder, scan_ports,
    CompositeSink, ConsoleSink, HttpClient, RenderMode, ResultAggregator, ScanConfig, ScanEngine,
    ScanResult, ScanState, SinkRef, TargetManager, WebhookNotifier,
};

#[derive(Parser, Debug)]
#[command(
    name = "ARKENAR",
    author = "RealOzk",
    version,
    about = "Advanced Web Vulnerability Scanner",
    override_usage = "arkenar <target>  <options>",
    after_help = "\x1b[1;36mEXAMPLES:\x1b[0m
  Quick scan:                     arkenar http://target.com
  Verbose mode:                   arkenar http://target.com -v
  Advanced + verbose + threads:   arkenar http://target.com -m advanced -v -t 10
  With proxy (Burp):              arkenar http://target.com --proxy http://127.0.0.1:8080
  Custom headers:                 arkenar http://target.com -H \"Authorization: Bearer TOKEN\"
  Scope-limited + output:         arkenar http://target.com --scope -o results.json
  Rate-limited advanced:          arkenar http://target.com -m advanced --rate-limit 50
  Scan from file:                 arkenar -l targets.txt
  Dry-run test:                   arkenar http://target.com --dry-run
  Full combo:                     arkenar http://target.com -m advanced -v -t 10 --proxy http://127.0.0.1:8080 -H \"Cookie: sess=abc\" --scope --rate-limit 30 -o scan.json"
)]
pub struct Args {
    #[arg(required_unless_present_any = ["list", "update"])]
    pub target: Option<String>,

    #[arg(
        short = 't',
        long,
        default_value_t = 50,
        help = "Number of concurrent threads"
    )]
    pub threads: usize,

    #[arg(short = 'p', long, help = "Add a list of payloads from a file")]
    pub payloads: Option<String>,

    #[arg(long, default_value_t = 5, help = "Request timeout in seconds")]
    pub timeout: u64,

    #[arg(
        short = 'v',
        long,
        default_value_t = false,
        help = "Show the whole process (Verbose Mode)"
    )]
    pub verbose: bool,

    #[arg(short = 'm', long, default_value = "simple",
        value_parser = clap::builder::PossibleValuesParser::new(["simple", "advanced"]),
        help = "Scan mode: simple (fast) or advanced (deeper, slower)")]
    pub mode: String,

    #[arg(
        short = 'o',
        long,
        default_value = "scan_results.json",
        help = "Output file path for results"
    )]
    pub output: String,

    #[arg(long, help = "Proxy URL (e.g. http://127.0.0.1:8080)")]
    pub proxy: Option<String>,

    #[arg(
        short = 'H',
        long = "header",
        help = "Custom header (e.g. \"Authorization: Bearer TOKEN\")"
    )]
    pub headers: Vec<String>,

    #[arg(
        short = 'l',
        long = "list",
        help = "File containing target URLs (one per line)"
    )]
    pub list: Option<String>,

    #[arg(
        long,
        default_value_t = false,
        help = "Limit crawling to same domain only"
    )]
    pub scope: bool,

    #[arg(
        long,
        default_value_t = 100,
        help = "Max requests per second for ARKENAR Engine"
    )]
    pub rate_limit: u64,

    #[arg(long, help = "Update ARKENAR to the latest version")]
    pub update: bool,

    #[arg(long, help = "Simulate scan without sending real requests")]
    pub dry_run: bool,

    #[arg(long, default_value_t = 3, help = "Crawl depth")]
    pub crawler_depth: u32,

    #[arg(long, default_value_t = 60, help = "Crawl timeout in seconds")]
    pub crawler_timeout: u64,

    #[arg(long, default_value_t = 50, help = "Max URLs to discover during crawl")]
    pub crawler_max_urls: usize,

    #[arg(long, help = "Resume a previously interrupted scan")]
    pub resume: bool,

    // ── Auth (v1.3) ────────────────────────────────────────────────────────
    #[arg(long, help = "Bearer token (Authorization: Bearer …)")]
    pub auth_token: Option<String>,

    #[arg(long, help = "Raw cookie string (e.g. session=abc; csrf=xyz)")]
    pub auth_cookies: Option<String>,

    #[arg(long, default_value = "none",
        value_parser = clap::builder::PossibleValuesParser::new(["none", "bearer", "cookie", "custom"]),
        help = "Authentication type: none, bearer, cookie, custom")]
    pub auth_type: String,

    // ── OAST (Market-Killer) ───────────────────────────────────────────────
    #[arg(long, help = "Interactsh OAST server URL (e.g. https://oast.pro)")]
    pub oast_server: Option<String>,

    // ── Discovery (v1.3) ──────────────────────────────────────────────────
    #[arg(
        long,
        default_value_t = false,
        help = "Enable JavaScript static analysis"
    )]
    pub enable_js_analysis: bool,

    #[arg(
        long,
        help = "Webhook URL to send notifications to (block SSRF if private)"
    )]
    pub webhook_url: Option<String>,

    // ── Evasion (Market-Killer) ───────────────────────────────────────────
    #[arg(
        long,
        default_value_t = false,
        help = "Enable WAF evasion mutations on 403 responses"
    )]
    pub enable_waf_evasion: bool,

    // ── Fingerprint / Smart Payloads / Scope ──────────────────────────────
    #[arg(
        long,
        default_value_t = false,
        help = "Disable tech-stack fingerprinting"
    )]
    pub no_fingerprint: bool,

    #[arg(long, default_value_t = String::new(), help = "Regex to restrict scan scope (e.g. ^https://example\\.com)")]
    pub scope_regex: String,

    #[arg(
        long,
        default_value_t = 5u32,
        help = "Number of 403 responses before WAF evasion kicks in"
    )]
    pub waf_evasion_threshold: u32,

    #[arg(
        long,
        default_value_t = false,
        help = "Disable context-aware (smart) payload selection"
    )]
    pub no_smart_payloads: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Accept invalid TLS certificates (DANGEROUS — MITM-able). Only for testing broken internal targets."
    )]
    pub allow_insecure_tls: bool,

    // ── Module toggles ────────────────────────────────────────────────────
    #[arg(long, default_value_t = false, help = "Skip the native crawl / forced-browse phase")]
    pub no_crawler: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Enable experimental parameter fuzzing"
    )]
    pub enable_param_fuzz: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Recon mode: subdomain enumeration + port scan + DNS (instead of a vuln scan)"
    )]
    pub recon: bool,

    // ── CI / GitHub Action ────────────────────────────────────────────────
    #[arg(long, value_parser = ["none", "low", "medium", "high", "critical"],
        help = "Exit non-zero if a finding at/above this severity is found (CI gate)")]
    pub fail_on: Option<String>,

    #[arg(long, help = "Write a SARIF report to this path (for the GitHub Security tab)")]
    pub sarif: Option<String>,

    // ── Output mode ───────────────────────────────────────────────────────
    #[arg(long, default_value_t = false, help = "Stream findings as JSON to stdout (for | jq); chrome to stderr")]
    pub json: bool,

    #[arg(long, default_value_t = false, help = "Findings only — no banner, config, progress, or logs")]
    pub quiet: bool,

    #[arg(long, default_value_t = false, help = "Show only proven (verified) findings")]
    pub verified_only: bool,
}

#[tokio::main]
async fn main() {
    #[cfg(windows)]
    colored::control::set_virtual_terminal(true).ok();

    let args = Args::parse();

    // --json wins over --quiet if both are given; otherwise rich.
    let mode = if args.json {
        RenderMode::Json
    } else if args.quiet {
        RenderMode::Quiet
    } else {
        RenderMode::Rich
    };

    if mode == RenderMode::Rich {
        print_banner();
    }

    if args.update {
        installer::run_full_update().await;
        process::exit(0);
    }

    let sink = ConsoleSink::new_ref(mode, args.verified_only);

    if args.resume {
        match ScanState::load(ScanState::default_path()).await {
            Some(state) => {
                sink.on_log(
                    "success",
                    &format!(
                        "[+] Resuming scan with {} pending URL(s), {} prior result(s)",
                        state.pending_urls.len(),
                        state.completed_results.len()
                    ),
                );
                let config = state.config.clone();
                for target in &state.pending_urls {
                    run_scan_sequence(target, &config, &sink, mode).await;
                }
                ScanState::delete(ScanState::default_path()).await;
                sink.on_log("success", "[+] Resumed scan complete.");
            }
            None => {
                sink.on_log("error", "[!] No state file found. Nothing to resume.");
            }
        }
        process::exit(0);
    }

    // Validate free-text fields for shell metacharacters and path traversal
    for (name, val) in [
        ("target", args.target.as_deref().unwrap_or("")),
        ("proxy", args.proxy.as_deref().unwrap_or("")),
        ("scope-regex", args.scope_regex.as_str()),
        ("headers", &args.headers.join(";")),
        ("auth-token", args.auth_token.as_deref().unwrap_or("")),
        ("auth-cookies", args.auth_cookies.as_deref().unwrap_or("")),
        ("payloads", args.payloads.as_deref().unwrap_or("")),
        ("output", args.output.as_str()),
    ] {
        if !val.is_empty() {
            if let Err(e) = validate_text_field(name, val) {
                eprintln!("[!] {}", e);
                std::process::exit(1);
            }
        }
    }

    // Validate webhook URL (block SSRF)
    if let Some(ref webhook) = args.webhook_url {
        if !webhook.is_empty() {
            if let Err(e) = validate_webhook_url(webhook) {
                eprintln!("[!] {}", e);
                std::process::exit(1);
            }
        }
    }

    let config = ScanConfig {
        target: args.target.clone().unwrap_or_default(),
        list_file: args.list.clone().unwrap_or_default(),
        mode: args.mode.clone(),
        threads: args.threads,
        timeout: args.timeout,
        rate_limit: args.rate_limit,
        output: args.output.clone(),
        proxy: args.proxy.clone().unwrap_or_default(),
        headers: args.headers.join("\n"),
        payloads: args.payloads.clone().unwrap_or_default(),
        verbose: args.verbose,
        scope: args.scope,
        dry_run: args.dry_run,
        enable_crawler: !args.no_crawler,
        enable_param_fuzz: args.enable_param_fuzz,
        webhook_url: args.webhook_url.clone(),
        crawler_depth: args.crawler_depth,
        crawler_timeout: args.crawler_timeout,
        crawler_max_urls: args.crawler_max_urls,
        resume: args.resume,
        enable_fingerprint: !args.no_fingerprint,
        scope_regex: args.scope_regex.clone(),
        waf_evasion_threshold: args.waf_evasion_threshold,
        enable_smart_payloads: !args.no_smart_payloads,
        // Auth
        auth_token: args.auth_token.clone(),
        auth_cookies: args.auth_cookies.clone(),
        auth_type: args.auth_type.clone(),
        // OAST
        oast_server: args.oast_server.clone(),
        // Discovery
        enable_js_analysis: args.enable_js_analysis,
        // Evasion
        enable_waf_evasion: args.enable_waf_evasion,
        allow_insecure_tls: args.allow_insecure_tls,
        ..ScanConfig::default()
    };

    let mut targets: Vec<String> = Vec::new();

    if !config.list_file.is_empty() {
        match read_lines(&config.list_file) {
            Ok(lines) => {
                if mode == RenderMode::Rich {
                    print!(
                        "{}\r\n",
                        format!(
                            "[+] Loaded {} target(s) from {}",
                            lines.len(),
                            config.list_file
                        )
                        .green()
                        .bold()
                    );
                    std::io::stdout().flush().ok();
                }
                targets.extend(lines);
            }
            Err(e) => {
                eprint!(
                    "{}\r\n",
                    format!("[!] Failed to read '{}': {}", config.list_file, e).red()
                );
                process::exit(1);
            }
        }
    }

    if !config.target.is_empty() && !targets.iter().any(|t| t == &config.target) {
        targets.push(config.target.clone());
    }

    if targets.is_empty() {
        eprint!(
            "{}\r\n",
            "[!] No targets specified. Provide a URL or use -l <file>.".red()
        );
        let mut cmd = Args::command();
        cmd.print_help().unwrap();
        process::exit(1);
    }

    // Recon mode: subdomains + ports + DNS (the former GUI recon workspace, now CLI).
    if args.recon {
        for target in &targets {
            run_recon_sequence(target, &sink).await;
        }
        sink.finish();
        return;
    }

    // Console + optional webhook notifier (URL already SSRF-validated above).
    let notifier = config
        .webhook_url
        .as_ref()
        .filter(|u| !u.is_empty())
        .map(|u| WebhookNotifier::new(u.clone()));
    let scan_sink: SinkRef = match &notifier {
        Some(n) => CompositeSink::new_ref(vec![sink.clone(), n.clone() as SinkRef]),
        None => sink.clone(),
    };

    let total = targets.len();
    let scan_start = std::time::Instant::now();
    let mut all_results: Vec<ScanResult> = Vec::new();
    for (i, target) in targets.iter().enumerate() {
        if total > 1 && mode == RenderMode::Rich {
            print!(
                "\r\n{}\r\n",
                format!("━━━ Target {}/{}: {} ━━━", i + 1, total, target)
                    .bright_white()
                    .bold()
            );
            std::io::stdout().flush().ok();
        }
        all_results.extend(run_scan_sequence(target, &config, &scan_sink, mode).await);
    }

    // Make sure any live progress UI is torn down before the footer.
    scan_sink.finish();
    print_footer(&all_results, scan_start.elapsed(), mode);

    // Deliver queued alerts before exit.
    if let Some(n) = &notifier {
        scan_sink.on_log("info", "[*] Flushing webhook notifications…");
        n.flush().await;
    }

    if let Some(path) = &args.sarif {
        match serde_json::to_string_pretty(&report::to_sarif(&all_results)) {
            Ok(json) => {
                if let Err(e) = std::fs::write(path, json) {
                    scan_sink.on_log("error", &format!("[!] Failed to write SARIF: {}", e));
                } else {
                    scan_sink.on_log("success", &format!("[+] SARIF written to {}", path));
                }
            }
            Err(e) => scan_sink.on_log("error", &format!("[!] SARIF serialize failed: {}", e)),
        }
    }

    // CI gate: exit non-zero if findings meet the threshold.
    if let Some(level) = args.fail_on.as_deref().and_then(Severity::parse) {
        if report::gate(&all_results, level) {
            scan_sink.on_log(
                "error",
                &format!("[!] Gate failed: findings at/above '{}' severity.", args.fail_on.unwrap()),
            );
            process::exit(1);
        }
    }
}

fn print_banner() {
    let banner = r#"
             :::     :::::::::  :::    ::: :::::::::: ::::    :::     :::     :::::::::
          :+: :+:   :+:    :+: :+:   :+:  :+:        :+:+:   :+:   :+: :+:   :+:    :+:
        +:+   +:+  +:+    +:+ +:+  +:+   +:+        :+:+:+  +:+  +:+   +:+  +:+    +:+
      +#++:++#++: +#++:++#:  +#++:++    +#++:++#   +#+ +:+ +#+ +#++:++#++: +#++:++#:
     +#+     +#+ +#+    +#+ +#+  +#+   +#+        +#+  +#+#+# +#+     +#+ +#+    +#+
    #+#     #+# #+#    #+# #+#   #+#  #+#        #+#   #+#+# #+#     #+# #+#    #+#
   ###     ### ###    ### ###    ### ########## ###    #### ###     ### ###    ###

    "#;
    print!("{}\r\n", banner.bright_cyan().bold());
    print!("{}\r\n", "──────".dimmed());
    std::io::stdout().flush().ok();
}

async fn run_scan_sequence(
    target: &str,
    config: &ScanConfig,
    sink: &SinkRef,
    mode: RenderMode,
) -> Vec<ScanResult> {
    if config.dry_run {
        sink.on_log("warn", &format!("[DRY RUN] Would scan target: {}", target));
        return Vec::new();
    }

    if mode == RenderMode::Rich {
        print_scan_config(target, config);
    }

    let custom_headers = config.parsed_headers();

    let mut target_manager = TargetManager::new();
    target_manager.add_target(target.to_string());

    let http_client = match HttpClient::new(
        config.timeout,
        config.proxy_ref(),
        &custom_headers,
        config.allow_insecure_tls,
    ) {
        Ok(c) => Arc::new(c),
        Err(e) => {
            sink.on_log("error", &format!("[!] Failed to build HTTP client: {}", e));
            return Vec::new();
        }
    };

    let abort = Arc::new(AtomicBool::new(false));

    // One aggregator spans both phases: it dedups, writes JSONL, and forwards every
    // finding (crawler secrets included) to the sink.
    let (result_tx, result_rx) = mpsc::channel::<ScanResult>(100);
    let output_path = config.output.clone();
    let agg_sink = sink.clone();
    let aggregator =
        tokio::spawn(
            async move { ResultAggregator::run(result_rx, &output_path, agg_sink).await },
        );

    // Phase 1: native crawl + forced browse (pure Rust — no external tools).
    if config.enable_crawler {
        sink.on_log("phase", "[*] Phase 1: Native crawl + forced browse...");
        match run_native_crawler(
            target,
            config.crawler_depth,
            config.crawler_max_urls,
            config.scope,
            Arc::clone(&http_client),
            sink.clone(),
            result_tx.clone(),
            abort.clone(),
        )
        .await
        {
            Ok(crawled) => {
                sink.on_log(
                    "success",
                    &format!("[+] Discovered {} URL(s).", crawled.len()),
                );
                for u in crawled {
                    target_manager.add_target(u);
                }
            }
            Err(e) => {
                sink.on_log("error", &format!("[!] Crawler error: {}", e));
            }
        }
    } else {
        sink.on_log("phase", "[*] Phase 1: Crawling skipped (--no-crawler).");
    }

    // Phase 2: ARKENAR engine.
    sink.on_log("phase", "[*] Phase 2: ARKENAR Engine...");
    let engine = ScanEngine::with_config(
        target_manager,
        Arc::clone(&http_client),
        config.threads,
        config.rate_limit,
        if config.payloads.is_empty() {
            None
        } else {
            Some(&config.payloads)
        },
        config,
    );
    engine.run(result_tx.clone(), abort.clone()).await;

    // Drop the last sender so the aggregator's receive loop ends, then collect.
    drop(result_tx);
    let results = aggregator.await.unwrap_or_default();

    ResultAggregator::report_summary(&results, sink);
    results
}

/// Recon: subdomain enumeration (subfinder) → per-host port scan + DNS.
/// The capability that used to live only in the GUI recon workspace.
async fn run_recon_sequence(target: &str, sink: &SinkRef) {
    // Accept a URL or a bare domain — extract the host.
    let domain = url::Url::parse(target)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| target.trim().to_string());

    let abort = Arc::new(AtomicBool::new(false));

    sink.on_log("phase", "[*] Recon Phase 1: subdomain enumeration (subfinder)...");
    let subs = match run_subfinder(&domain, sink.clone(), abort.clone()).await {
        Ok(h) => h,
        Err(e) => {
            sink.on_log("error", &format!("[!] subfinder error: {}", e));
            Vec::new()
        }
    };

    // Dedup root + subdomains (DNS is case-insensitive); keep original case.
    let mut seen = std::collections::HashSet::new();
    seen.insert(domain.to_ascii_lowercase());
    let mut hosts = vec![domain.clone()];
    for h in subs {
        if seen.insert(h.to_ascii_lowercase()) {
            hosts.push(h);
        }
    }
    sink.on_log("success", &format!("[+] {} host(s) discovered.", hosts.len()));

    sink.on_log("phase", "[*] Recon Phase 2: port scan + DNS per host...");
    let mut total_open = 0usize;
    for host in &hosts {
        let (ports_res, dns_res) =
            tokio::join!(scan_ports(host, abort.clone(), sink.clone()), resolve_domain(host));

        let ports = ports_res.unwrap_or_default();
        total_open += ports.len();
        let ports_str = if ports.is_empty() {
            "—".to_string()
        } else {
            ports
                .iter()
                .map(|p| p.to_string())
                .collect::<Vec<_>>()
                .join(",")
        };
        let ip_str = match dns_res {
            Ok(d) if !d.a_records.is_empty() => d.a_records.join(", "),
            _ => "—".to_string(),
        };
        sink.on_log(
            "success",
            &format!("[+] {}  ports[{}]  ip[{}]", host, ports_str, ip_str),
        );
    }

    sink.on_log(
        "success",
        &format!(
            "[+] Recon complete: {} host(s), {} open port(s).",
            hosts.len(),
            total_open
        ),
    );
}

/// Final one-line tally: verified vs potential findings + elapsed time.
/// Suppressed in --quiet and --json (those modes emit findings only).
fn print_footer(results: &[ScanResult], elapsed: std::time::Duration, mode: RenderMode) {
    if mode != RenderMode::Rich {
        return;
    }
    let findings: Vec<&ScanResult> = results.iter().filter(|r| r.vuln_type != "Safe").collect();
    let verified = findings.iter().filter(|r| r.verified).count();
    let potential = findings.len() - verified;

    let secs = elapsed.as_secs();
    let elapsed_str = if secs >= 60 {
        format!("{}m {}s", secs / 60, secs % 60)
    } else {
        format!("{}s", secs)
    };

    print!(
        "\r\n  {}  ·  {}  ·  {}\r\n",
        format!("{} verified", verified).green().bold(),
        format!("{} potential", potential).bright_black(),
        elapsed_str.dimmed()
    );
    std::io::stdout().flush().ok();
}

fn print_scan_config(target: &str, config: &ScanConfig) {
    let mode_label = if config.mode == "advanced" {
        "Advanced (deeper)"
    } else {
        "Simple (fast)"
    };
    let verbose_label = if config.verbose { "ON" } else { "OFF" };

    print!(
        "{}\r\n",
        format!("[+] Target:     {}", target).green().bold()
    );
    print!(
        "{}\r\n",
        format!("[+] Threads:    {}", config.threads).blue()
    );
    print!(
        "{}\r\n",
        format!("[+] Timeout:    {}s", config.timeout).blue()
    );
    print!(
        "{}\r\n",
        format!("[+] Mode:       {}", mode_label).magenta().bold()
    );
    print!(
        "{}\r\n",
        format!("[+] Verbose:    {}", verbose_label).magenta()
    );
    print!(
        "{}\r\n",
        format!("[+] Output:     {}", config.output).blue()
    );
    print!(
        "{}\r\n",
        format!("[+] Rate Limit: {} req/s", config.rate_limit).blue()
    );
    if !config.proxy.is_empty() {
        print!(
            "{}\r\n",
            format!("[+] Proxy:      {}", config.proxy).yellow()
        );
    }
    let header_list = config.header_list();
    if !header_list.is_empty() {
        print!(
            "{}\r\n",
            format!("[+] Headers:    {} custom", header_list.len()).yellow()
        );
    }
    if config.scope {
        print!("{}\r\n", "[+] Scope:      Same-domain only".yellow());
    }
    if !config.scope_regex.is_empty() {
        print!(
            "{}\r\n",
            format!("[+] Scope Regex: {}", config.scope_regex).yellow()
        );
    }
    if config.enable_waf_evasion {
        print!(
            "{}\r\n",
            format!(
                "[+] WAF Evasion: ON (threshold: {})",
                config.waf_evasion_threshold
            )
            .yellow()
        );
    }
    if !config.enable_fingerprint {
        print!("{}\r\n", "[+] Fingerprint: DISABLED".dimmed());
    }
    if !config.enable_smart_payloads {
        print!("{}\r\n", "[+] Smart Payloads: DISABLED".dimmed());
    }
    print!("{}\r\n", "──────".dimmed());
    std::io::stdout().flush().ok();
}
