use clap::{CommandFactory, Parser};
use colored::*;
use std::io::Write;
use std::process;
use std::sync::Arc;
use tokio::sync::mpsc;

use arkenar_core::{
    ScanEngine, ResultAggregator, ScanResult, TargetManager,
    HttpClient, run_katana_crawler, run_nuclei_scan,
    installer, read_lines, parse_custom_headers,
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

    let mut targets: Vec<String> = Vec::new();

    if let Some(ref list_path) = args.list {
        match read_lines(list_path) {
            Ok(lines) => {
                print!(
                    "{}\r\n",
                    format!("[+] Loaded {} target(s) from {}", lines.len(), list_path)
                        .green().bold()
                );
                std::io::stdout().flush().ok();
                targets.extend(lines);
            }
            Err(e) => {
                eprint!("{}\r\n", format!("[!] Failed to read '{}': {}", list_path, e).red());
                process::exit(1);
            }
        }
    }

    if let Some(ref t) = args.target {
        targets.push(t.clone());
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
        run_scan_sequence(target, &args).await;
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
async fn run_scan_sequence(target: &str, args: &Args) {
    if args.dry_run {
        println!("[DRY RUN] Would scan target: {}", target);
        return;
    }

    print_scan_config(target, args);

    let custom_headers = parse_custom_headers(&args.headers);

    // ── Phase 1: Crawling ─────────────────────────────────────────────
    print!("\r\n{}\r\n", "[*] Phase 1: Crawling...".bright_cyan().bold());
    std::io::stdout().flush().ok();

    let mut target_manager = TargetManager::new();
    target_manager.add_target(target.to_string());

    match run_katana_crawler(target, &args.mode, args.verbose, args.scope).await {
        Ok(crawled) => {
            print!(
                "{}\r\n",
                format!("[+] Discovered {} URL(s).", crawled.len()).green().bold()
            );
            std::io::stdout().flush().ok();
            for u in crawled {
                target_manager.add_target(u);
            }
        }
        Err(e) => {
            eprint!("{}\r\n", format!("[!] Crawler error: {}", e).red());
        }
    }

    // ── Phase 2: Nuclei ───────────────────────────────────────────────
    print!("\r\n{}\r\n", "[*] Phase 2: Running Nuclei Scanner...".bright_cyan().bold());
    std::io::stdout().flush().ok();

    if let Err(e) = run_nuclei_scan(target, &args.mode, args.verbose, args.tags.as_deref()).await {
        eprint!("{}\r\n", format!("[!] Nuclei error: {}", e).red());
    }

    // ── Phase 3: ARKENAR Engine ───────────────────────────────────────
    print!("\r\n{}\r\n", "[*] Phase 3: ARKENAR Engine...".bright_cyan().bold());
    std::io::stdout().flush().ok();

    let http_client = Arc::new(HttpClient::new(args.timeout, args.proxy.as_deref(), &custom_headers));
    let (result_tx, result_rx) = mpsc::channel::<ScanResult>(100);
    let engine = ScanEngine::new(target_manager, Arc::clone(&http_client), args.threads);
    let output_path = args.output.clone();

    let (_, results) = tokio::join!(
        engine.run(result_tx),
        ResultAggregator::run(result_rx, &output_path)
    );

    ResultAggregator::print_summary_report(&results);
}

/// Prints the scan configuration summary for a target.
fn print_scan_config(target: &str, args: &Args) {
    let mode_label = if args.mode == "advanced" { "Advanced (comprehensive)" } else { "Simple (fast)" };
    let verbose_label = if args.verbose { "ON" } else { "OFF" };

    print!("{}\r\n", format!("[+] Target:     {}", target).green().bold());
    print!("{}\r\n", format!("[+] Threads:    {}", args.threads).blue());
    print!("{}\r\n", format!("[+] Timeout:    {}s", args.timeout).blue());
    print!("{}\r\n", format!("[+] Mode:       {}", mode_label).magenta().bold());
    print!("{}\r\n", format!("[+] Verbose:    {}", verbose_label).magenta());
    print!("{}\r\n", format!("[+] Output:     {}", args.output).blue());
    print!("{}\r\n", format!("[+] Rate Limit: {} req/s", args.rate_limit).blue());
    if let Some(ref proxy) = args.proxy {
        print!("{}\r\n", format!("[+] Proxy:      {}", proxy).yellow());
    }
    if !args.headers.is_empty() {
        print!("{}\r\n", format!("[+] Headers:    {} custom", args.headers.len()).yellow());
    }
    if args.scope {
        print!("{}\r\n", "[+] Scope:      Same-domain only".yellow());
    }
    if let Some(ref t) = args.tags {
        print!("{}\r\n", format!("[+] Tags:       {}", t).yellow());
    }
    print!("{}\r\n", "──────────────────────────────────────────────────".dimmed());
    std::io::stdout().flush().ok();
}
