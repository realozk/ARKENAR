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
use validation::{validate_data_field, validate_path_field};
// Webhook SSRF validation lives in core (single source of truth — the typed-Host IPv6
// handling that blocks `[::1]`, link-local, etc.). Called fully-qualified below to avoid
// clashing with the local `mod validation`.

use arkenar_core::{
    installer, read_lines, resolve_domain, run_native_crawler, run_subfinder, scan_ports,
    verify_live, CompositeSink, ConsoleSink, HttpClient, RenderMode, ResultAggregator, ScanConfig,
    ScanEngine, ScanResult, ScanState, SinkRef, TargetManager, WebhookNotifier,
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

    // ── Live verification (1.3) ───────────────────────────────────────────
    #[arg(
        long,
        default_value_t = false,
        help = "Probe each detected key against its provider's auth endpoint (opt-in; \
                authenticates to a third party — see the legal note in --help/README)"
    )]
    pub verify_live: bool,

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

    let sink = ConsoleSink::new_ref(mode, args.verified_only, args.verify_live);

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
                let resume_start = std::time::Instant::now();
                let mut resumed_results: Vec<ScanResult> = Vec::new();
                for target in &state.pending_urls {
                    resumed_results.extend(run_scan_sequence(target, &config, &sink, mode).await);
                }
                ScanState::delete(ScanState::default_path()).await;
                sink.on_log("success", "[+] Resumed scan complete.");
                // Render the authoritative --json/--quiet stream + Rich summary once the
                // full (post-verification) result set is known.
                sink.on_complete(&resumed_results, resume_start.elapsed());
            }
            None => {
                sink.on_log("error", "[!] No state file found. Nothing to resume.");
            }
        }
        process::exit(0);
    }

    // Data fields (URL / regex / header / cookie) — reject only control characters; their
    // shell-metachar-looking syntax is legal data and is never shell-interpolated.
    let mut data_fields: Vec<(&str, String)> = vec![
        ("target", args.target.clone().unwrap_or_default()),
        ("proxy", args.proxy.clone().unwrap_or_default()),
        ("scope-regex", args.scope_regex.clone()),
        ("auth-token", args.auth_token.clone().unwrap_or_default()),
        ("auth-cookies", args.auth_cookies.clone().unwrap_or_default()),
    ];
    for header in &args.headers {
        data_fields.push(("header", header.clone()));
    }
    for (name, val) in &data_fields {
        if !val.is_empty() {
            if let Err(e) = validate_data_field(name, val) {
                eprintln!("[!] {}", e);
                std::process::exit(1);
            }
        }
    }

    // Filesystem-path fields — keep the conservative shell-metachar + traversal denylist.
    for (name, val) in [
        ("payloads", args.payloads.as_deref().unwrap_or("")),
        ("output", args.output.as_str()),
        ("list", args.list.as_deref().unwrap_or("")),
    ] {
        if !val.is_empty() {
            if let Err(e) = validate_path_field(name, val) {
                eprintln!("[!] {}", e);
                std::process::exit(1);
            }
        }
    }

    // Validate webhook URL (block SSRF)
    if let Some(ref webhook) = args.webhook_url {
        if !webhook.is_empty() {
            if let Err(e) = arkenar_core::validation::validate_webhook_url(webhook) {
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
        enable_smart_payloads: !args.no_smart_payloads,
        // Auth
        auth_token: args.auth_token.clone(),
        auth_cookies: args.auth_cookies.clone(),
        auth_type: args.auth_type.clone(),
        // Discovery
        enable_js_analysis: args.enable_js_analysis,
        allow_insecure_tls: args.allow_insecure_tls,
        // Live verification
        verify_live: args.verify_live,
        ..ScanConfig::default()
    };

    let mut targets: Vec<String> = Vec::new();

    if !config.list_file.is_empty() {
        match read_lines(&config.list_file) {
            Ok(lines) => {
                if mode == RenderMode::Rich {
                    eprint!(
                        "{}\r\n",
                        format!(
                            "[+] Loaded {} target(s) from {}",
                            lines.len(),
                            config.list_file
                        )
                        .green()
                        .bold()
                    );
                    std::io::stderr().flush().ok();
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
            eprint!(
                "\r\n{}\r\n",
                format!("  target {}/{}  ·  {}", i + 1, total, target).dimmed()
            );
            std::io::stderr().flush().ok();
        }
        all_results.extend(run_scan_sequence(target, &config, &scan_sink, mode).await);
    }

    // Render the end-of-scan summary (cards for verified findings + tally).
    // The renderer tears down the live spinner first; no-op in quiet/json.
    scan_sink.on_complete(&all_results, scan_start.elapsed());

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

/// Compact human duration: `412ms` under a second, else `1.4s`.
fn human(d: std::time::Duration) -> String {
    let ms = d.as_millis();
    if ms < 1000 {
        format!("{}ms", ms)
    } else {
        format!("{:.1}s", d.as_secs_f64())
    }
}

/// The ASCII-art identity, shown once at the top in rich mode (to stderr, so it
/// never pollutes piped findings). Swap the art below to rebrand.
fn print_banner() {
    let banner = r#"
 █████╗ ██████╗ ██╗  ██╗███████╗███╗   ██╗ █████╗ ██████╗ 
██╔══██╗██╔══██╗██║ ██╔╝██╔════╝████╗  ██║██╔══██╗██╔══██╗
███████║██████╔╝█████╔╝ █████╗  ██╔██╗ ██║███████║██████╔╝
██╔══██║██╔══██╗██╔═██╗ ██╔══╝  ██║╚██╗██║██╔══██║██╔══██╗
██║  ██║██║  ██║██║  ██╗███████╗██║ ╚████║██║  ██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝
                                                                                                                
"#;

    // Brand accent – keep in sync with `ACCENT` in core/src/notify/console.rs.
eprintln!("{}", banner.truecolor(0x0E, 0x74, 0x90).bold());
    eprint!(
        "     {}  {}\r\n\r\n",
        "prove which secrets are leaking".dimmed(),
        format!("v{}", env!("CARGO_PKG_VERSION")).dimmed()
    );
    std::io::stderr().flush().ok();
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

    // Custom `-H` headers plus any auth headers derived from --auth-type/--auth-token/
    // --auth-cookies. Auth is appended last so it wins on a key collision; both the
    // crawler and the engine share this client, so authenticated scanning covers every
    // phase. HttpClient inserts into a HeaderMap (dedups by key), so the "custom"
    // auth-type's echo of the -H headers collapses harmlessly.
    let mut custom_headers = config.parsed_headers();
    custom_headers.extend(config.auth_headers());

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

    // One aggregator spans both phases: it dedups and forwards every finding (crawler
    // secrets included) to the sink as a live preview. The JSONL is written later, after
    // optional --verify-live, so the file reflects final verification tiers.
    let (result_tx, result_rx) = mpsc::channel::<ScanResult>(100);
    let agg_sink = sink.clone();
    let aggregator = tokio::spawn(async move { ResultAggregator::run(result_rx, agg_sink).await });

    // Phase 1: native crawl + forced browse (pure Rust — no external tools).
    // Each phase drives the spinner ("phase") and prints a `✓ … · time` ribbon
    // line on completion ("done").
    let mut n_discovered = 0usize;
    if config.enable_crawler {
        let t = std::time::Instant::now();
        sink.on_log("phase", "crawling + forced browse");
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
                n_discovered = crawled.len();
                sink.on_log(
                    "done",
                    &format!("crawl · {} urls · {}", n_discovered, human(t.elapsed())),
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
        sink.on_log("info", "crawl skipped (--no-crawler)");
    }

    // Capture before `config` is moved into the engine — used by the post-scan
    // live-verification pass below.
    let do_verify_live = config.verify_live;

    // Phase 2: ARKENAR engine.
    let t_engine = std::time::Instant::now();
    sink.on_log("phase", "probing endpoints");
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
    let mut results = aggregator.await.unwrap_or_default();
    sink.on_log(
        "done",
        &format!(
            "probe · {} endpoints · {}",
            n_discovered + 1,
            human(t_engine.elapsed())
        ),
    );

    // Opt-in live key verification — upgrades/drops findings before the summary renders.
    if do_verify_live {
        sink.on_log(
            "warn",
            "[!] --verify-live: probing found keys against their providers. This \
             AUTHENTICATES to a third party — many bug-bounty programs forbid using \
             found credentials, and it may be illegal without authorization. Check your \
             program's rules and the law before relying on this.",
        );
        let t = std::time::Instant::now();
        sink.on_log("phase", "live key verification");
        let stats = verify_live(&mut results, std::time::Duration::from_secs(10)).await;
        sink.on_log(
            "done",
            &format!(
                "verify-live · {} probed · {} live · {} rejected · {} inconclusive · {}",
                stats.probed,
                stats.live,
                stats.rejected,
                stats.inconclusive,
                human(t.elapsed())
            ),
        );
    }

    // Persist the final, post-verification result set to disk (JSONL). Done here — not
    // mid-scan in the aggregator — so --verify-live upgrades/drops are reflected in the
    // output file, matching the summary and --json/--quiet stdout.
    ResultAggregator::write_results_file(&config.output, &results, sink).await;

    // Per-target findings already previewed live via the sink; the global summary
    // (cards + tally) and the authoritative --json/--quiet stream are rendered once by
    // `on_complete` in main().
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

/// Compact one-glance scan config, to stderr (chrome, not data). The target on
/// its own line, then the knobs as a dim `·`-separated strip. Only the toggles
/// that are actually on get listed — silence is the default.
fn print_scan_config(target: &str, config: &ScanConfig) {
    let mut bits = vec![
        format!("{} threads", config.threads),
        format!("{}s timeout", config.timeout),
        format!("{} req/s", config.rate_limit),
        if config.mode == "advanced" { "advanced".to_string() } else { "simple".to_string() },
    ];
    if config.scope {
        bits.push("same-domain".to_string());
    }
    if !config.scope_regex.is_empty() {
        bits.push("scope-regex".to_string());
    }
    if !config.proxy.is_empty() {
        bits.push("proxy".to_string());
    }
    if !config.header_list().is_empty() {
        bits.push(format!("{} headers", config.header_list().len()));
    }
    if !config.enable_fingerprint {
        bits.push("no-fingerprint".to_string());
    }
    if !config.enable_smart_payloads {
        bits.push("no-smart-payloads".to_string());
    }

    eprint!("  {}\r\n", target.white().bold());
    eprint!("  {}\r\n\r\n", bits.join("  ·  ").dimmed());
    std::io::stderr().flush().ok();
}
