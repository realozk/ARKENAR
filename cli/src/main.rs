use clap::{CommandFactory, Parser};
use colored::*;
use std::io::Write;
use std::process;
use std::sync::Arc;
use tokio::sync::mpsc;

use arkenar_core::{
    ConsoleSink, ScanConfig, ScanEngine, ResultAggregator, ScanResult, ScanState, TargetManager,
    HttpClient, run_katana_crawler, run_nuclei_scan,
    installer, read_lines, SinkRef,
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

    #[arg(short = 't', long, default_value_t = 50, help = "Number of concurrent threads")]
    pub threads: usize,

    #[arg(short = 'p', long, help = "Add a list of payloads from a file")]
    pub payloads: Option<String>,

    #[arg(long, default_value_t = 5, help = "Request timeout in seconds")]
    pub timeout: u64,

    #[arg(short = 'v', long, default_value_t = false, help = "Show the whole process (Verbose Mode)")]
    pub verbose: bool,

    #[arg(short = 'm', long, default_value = "simple",
        value_parser = clap::builder::PossibleValuesParser::new(["simple", "advanced"]),
        help = "Scan mode: simple (fast) or advanced (comprehensive)")]
    pub mode: String,

    #[arg(short = 'o', long, default_value = "scan_results.json", help = "Output file path for results")]
    pub output: String,

    #[arg(long, help = "Proxy URL (e.g. http://127.0.0.1:8080)")]
    pub proxy: Option<String>,

    #[arg(short = 'H', long = "header", help = "Custom header (e.g. \"Authorization: Bearer TOKEN\")")]
    pub headers: Vec<String>,

    #[arg(short = 'l', long = "list", help = "File containing target URLs (one per line)")]
    pub list: Option<String>,

    #[arg(long, default_value_t = false, help = "Limit crawling to same domain only")]
    pub scope: bool,

    #[arg(long, default_value_t = 100, help = "Max requests per second for ARKENAR Engine")]
    pub rate_limit: u64,

    #[arg(long, help = "Custom Nuclei tags (e.g. \"cve,jira,panel\"). Overrides default simple mode logic.")]
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
}

#[tokio::main]
async fn main() {
    #[cfg(windows)]
    colored::control::set_virtual_terminal(true).ok();

    print_banner();
    installer::check_and_install_tools().await;

    let args = Args::parse();

    if args.update {
        installer::run_full_update().await;
        process::exit(0);
    }

    // Create console sink for CLI output
    let sink = ConsoleSink::new_ref();

    // Handle --resume: load previous state and continue
    if args.resume {
        match ScanState::load(ScanState::default_path()) {
            Some(state) => {
                sink.on_log("success", &format!(
                    "[+] Resuming scan with {} pending URL(s), {} prior result(s)",
                    state.pending_urls.len(), state.completed_results.len()
                ));
                let config = state.config.clone();
                for target in &state.pending_urls {
                    run_scan_sequence(target, &config, &sink).await;
                }
                ScanState::delete(ScanState::default_path());
                sink.on_log("success", "[+] Resumed scan complete.");
            }
            None => {
                sink.on_log("error", "[!] No state file found. Nothing to resume.");
            }
        }
        process::exit(0);
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
        headers: args.headers.join(";"),
        tags: args.tags.clone().unwrap_or_default(),
        payloads: args.payloads.clone().unwrap_or_default(),
        verbose: args.verbose,
        scope: args.scope,
        dry_run: args.dry_run,
        enable_crawler: true,
        enable_nuclei: true,
        crawler_depth: args.crawler_depth,
        crawler_timeout: args.crawler_timeout,
        crawler_max_urls: args.crawler_max_urls,
        resume: args.resume,
        ..ScanConfig::default()
    };

    let mut targets: Vec<String> = Vec::new();

    if !config.list_file.is_empty() {
        match read_lines(&config.list_file) {
            Ok(lines) => {
                print!(
                    "{}\r\n",
                    format!("[+] Loaded {} target(s) from {}", lines.len(), config.list_file)
                        .green().bold()
                );
                std::io::stdout().flush().ok();
                targets.extend(lines);
            }
            Err(e) => {
                eprint!("{}\r\n", format!("[!] Failed to read '{}': {}", config.list_file, e).red());
                process::exit(1);
            }
        }
    }

    if !config.target.is_empty() {
        targets.push(config.target.clone());
    }

    if targets.is_empty() {
        eprint!("{}\r\n", "[!] No targets specified. Provide a URL or use -l <file>.".red());
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
                    .bright_white().bold()
            );
            std::io::stdout().flush().ok();
        }
        run_scan_sequence(target, &config, &sink).await;
    }
}

/// Prints the ARKENAR ASCII banner.
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
    print!("{}\r\n", "──────────────────────────────────────────────────".dimmed());
    std::io::stdout().flush().ok();
}

/// Orchestrates the full scanning pipeline for a single target.
///
/// Phases:
///   1. Katana crawling — discovers URLs from the target.
///   2. Nuclei scanning — runs template-based vulnerability detection.
///   3. ARKENAR Engine — custom scan engine with mutation and result aggregation.
async fn run_scan_sequence(target: &str, config: &ScanConfig, sink: &SinkRef) {
    if config.dry_run {
        sink.on_log("warn", &format!("[DRY RUN] Would scan target: {}", target));
        return;
    }

    print_scan_config(target, config);

    let custom_headers = config.parsed_headers();

    // Phase 1: Crawling
    sink.on_log("phase", "[*] Phase 1: Crawling...");

    let mut target_manager = TargetManager::new();
    target_manager.add_target(target.to_string());

    match run_katana_crawler(target, config, sink).await {
        Ok(crawled) => {
            sink.on_log("success", &format!("[+] Discovered {} URL(s).", crawled.len()));
            for u in crawled {
                target_manager.add_target(u);
            }
        }
        Err(e) => {
            sink.on_log("error", &format!("[!] Crawler error: {}", e));
        }
    }

    // ── Phase 2: Nuclei ───────────────────────────────────────────────
    sink.on_log("phase", "[*] Phase 2: Running Nuclei Scanner...");

    if let Err(e) = run_nuclei_scan(target, &config.mode, config.verbose, config.tags_ref(), sink).await {
        sink.on_log("error", &format!("[!] Nuclei error: {}", e));
    }

    // ── Phase 3: ARKENAR Engine ───────────────────────────────────────
    sink.on_log("phase", "[*] Phase 3: ARKENAR Engine...");

    let http_client = Arc::new(HttpClient::new(config.timeout, config.proxy_ref(), &custom_headers));
    let (result_tx, result_rx) = mpsc::channel::<ScanResult>(100);
    let engine = ScanEngine::new(target_manager, Arc::clone(&http_client), config.threads);
    let output_path = config.output.clone();

    let (_, results) = tokio::join!(
        engine.run(result_tx),
        ResultAggregator::run(result_rx, &output_path, sink.clone())
    );

    ResultAggregator::report_summary(&results, sink);
}

/// Prints the scan configuration summary for a target.
fn print_scan_config(target: &str, config: &ScanConfig) {
    let mode_label = if config.mode == "advanced" { "Advanced (comprehensive)" } else { "Simple (fast)" };
    let verbose_label = if config.verbose { "ON" } else { "OFF" };

    print!("{}\r\n", format!("[+] Target:     {}", target).green().bold());
    print!("{}\r\n", format!("[+] Threads:    {}", config.threads).blue());
    print!("{}\r\n", format!("[+] Timeout:    {}s", config.timeout).blue());
    print!("{}\r\n", format!("[+] Mode:       {}", mode_label).magenta().bold());
    print!("{}\r\n", format!("[+] Verbose:    {}", verbose_label).magenta());
    print!("{}\r\n", format!("[+] Output:     {}", config.output).blue());
    print!("{}\r\n", format!("[+] Rate Limit: {} req/s", config.rate_limit).blue());
    if !config.proxy.is_empty() {
        print!("{}\r\n", format!("[+] Proxy:      {}", config.proxy).yellow());
    }
    let header_list = config.header_list();
    if !header_list.is_empty() {
        print!("{}\r\n", format!("[+] Headers:    {} custom", header_list.len()).yellow());
    }
    if config.scope {
        print!("{}\r\n", "[+] Scope:      Same-domain only".yellow());
    }
    if !config.tags.is_empty() {
        print!("{}\r\n", format!("[+] Tags:       {}", config.tags).yellow());
    }
    print!("{}\r\n", "──────────────────────────────────────────────────".dimmed());
    std::io::stdout().flush().ok();
}
