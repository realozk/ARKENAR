use clap::{CommandFactory, Parser};
use colored::*;
use std::io::Write;
use std::process;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::mpsc;
mod validation;
use validation::{validate_tags_field, validate_text_field, validate_webhook_url};

use arkenar_core::{
    installer, read_lines, run_katana_crawler, run_nuclei_scan, ConsoleSink, HttpClient,
    ResultAggregator, ScanConfig, ScanEngine, ScanResult, ScanState, SinkRef, TargetManager,
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

    #[arg(
        long,
        help = "Custom Nuclei tags (e.g. \"cve,jira,panel\"). Overrides default simple mode logic."
    )]
    pub tags: Option<String>,

    #[arg(long, help = "Update ARKENAR to the latest version")]
    pub update: bool,

    #[arg(long, help = "Simulate scan without sending real requests")]
    pub dry_run: bool,

    #[arg(long, default_value_t = 3, help = "Katana crawl depth")]
    pub crawler_depth: u32,

    #[arg(long, default_value_t = 60, help = "Katana crawl timeout in seconds")]
    pub crawler_timeout: u64,

    #[arg(long, default_value_t = 50, help = "Max URLs for Katana to discover")]
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

    // ── Fingerprint / Smart Payloads / Scope / Nuclei ─────────────────────
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

    #[arg(long, default_value_t = String::new(), help = "Path to custom Nuclei templates directory")]
    pub nuclei_templates: String,

    #[arg(
        long,
        default_value_t = false,
        help = "Accept invalid TLS certificates (DANGEROUS — MITM-able). Only for testing broken internal targets."
    )]
    pub allow_insecure_tls: bool,

    // ── Module toggles (parity with GUI) ──────────────────────────────────
    #[arg(long, default_value_t = false, help = "Skip the Katana crawl phase")]
    pub no_crawler: bool,

    #[arg(long, default_value_t = false, help = "Skip the Nuclei scan phase")]
    pub no_nuclei: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Enable experimental parameter fuzzing"
    )]
    pub enable_param_fuzz: bool,
}

#[tokio::main]
async fn main() {
    #[cfg(windows)]
    colored::control::set_virtual_terminal(true).ok();

    print_banner();
    let args = Args::parse();

    if args.update {
        installer::run_full_update().await;
        process::exit(0);
    }

    if !args.dry_run {
        installer::check_and_install_tools().await;
    }

    let sink = ConsoleSink::new_ref();

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
                    run_scan_sequence(target, &config, &sink).await;
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
        ("nuclei-templates", args.nuclei_templates.as_str()),
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

    // Validate tags (block flag injection)
    if let Some(ref tags) = args.tags {
        if !tags.is_empty() {
            if let Err(e) = validate_tags_field("tags", tags) {
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
        tags: args.tags.clone().unwrap_or_default(),
        payloads: args.payloads.clone().unwrap_or_default(),
        verbose: args.verbose,
        scope: args.scope,
        dry_run: args.dry_run,
        enable_crawler: !args.no_crawler,
        enable_nuclei: !args.no_nuclei,
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
        nuclei_templates_dir: args.nuclei_templates.clone(),
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

    let total = targets.len();
    for (i, target) in targets.iter().enumerate() {
        if total > 1 {
            print!(
                "\r\n{}\r\n",
                format!("━━━ Target {}/{}: {} ━━━", i + 1, total, target)
                    .bright_white()
                    .bold()
            );
            std::io::stdout().flush().ok();
        }
        run_scan_sequence(target, &config, &sink).await;
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

async fn run_scan_sequence(target: &str, config: &ScanConfig, sink: &SinkRef) {
    if config.dry_run {
        sink.on_log("warn", &format!("[DRY RUN] Would scan target: {}", target));
        return;
    }

    print_scan_config(target, config);

    let custom_headers = config.parsed_headers();

    let mut target_manager = TargetManager::new();
    target_manager.add_target(target.to_string());

    if config.enable_crawler {
        sink.on_log("phase", "[*] Phase 1: Crawling...");
        match run_katana_crawler(target, config, sink, Arc::new(AtomicBool::new(false))).await {
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

    if config.enable_nuclei {
        sink.on_log("phase", "[*] Phase 2: Running Nuclei Scanner...");
        if let Err(e) = run_nuclei_scan(
            target,
            &config.mode,
            config.verbose,
            config.tags_ref(),
            config.crawler_timeout,
            sink,
            Arc::new(AtomicBool::new(false)),
        )
        .await
        {
            sink.on_log("error", &format!("[!] Nuclei error: {}", e));
        }
    } else {
        sink.on_log("phase", "[*] Phase 2: Nuclei skipped (--no-nuclei).");
    }

    sink.on_log("phase", "[*] Phase 3: ARKENAR Engine...");

    let http_client = match HttpClient::new(
        config.timeout,
        config.proxy_ref(),
        &custom_headers,
        config.allow_insecure_tls,
    ) {
        Ok(c) => Arc::new(c),
        Err(e) => {
            sink.on_log("error", &format!("[!] Failed to build HTTP client: {}", e));
            return;
        }
    };
    let (result_tx, result_rx) = mpsc::channel::<ScanResult>(100);
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
    let output_path = config.output.clone();

    let (_, results) = tokio::join!(
        engine.run(
            result_tx,
            Arc::new(std::sync::atomic::AtomicBool::new(false))
        ),
        ResultAggregator::run(result_rx, &output_path, sink.clone())
    );

    ResultAggregator::report_summary(&results, sink);
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
    if !config.tags.is_empty() {
        print!(
            "{}\r\n",
            format!("[+] Tags:       {}", config.tags).yellow()
        );
    }
    if !config.scope_regex.is_empty() {
        print!(
            "{}\r\n",
            format!("[+] Scope Regex: {}", config.scope_regex).yellow()
        );
    }
    if !config.nuclei_templates_dir.is_empty() {
        print!(
            "{}\r\n",
            format!("[+] Nuclei Templates: {}", config.nuclei_templates_dir).yellow()
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
