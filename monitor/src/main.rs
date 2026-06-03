mod config;
mod scan;
mod store;

use anyhow::{bail, Context};
use arkenar_core::{validation, HttpClient, ScanEventSink, ScanResult, WebhookNotifier};
use clap::Parser;
use config::Config;
use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use store::{Store, StoredFinding};

#[derive(Parser)]
#[command(name = "arkenar-monitor", about = "Continuous passive ASM + secret monitor")]
struct Args {
    #[arg(long, default_value = "arkenar-monitor.toml")]
    config: String,
    /// Run a single cycle and exit.
    #[arg(long)]
    once: bool,
    /// Scan and diff but never send alerts.
    #[arg(long)]
    dry_run: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let raw = std::fs::read_to_string(&args.config)
        .with_context(|| format!("reading config {}", args.config))?;
    let cfg: Config = toml::from_str(&raw).context("parsing config TOML")?;

    if let Some(ref w) = cfg.webhook_url {
        if let Err(e) = validation::validate_webhook_url(w) {
            bail!("webhook_url rejected: {}", e);
        }
    }
    if cfg.targets.is_empty() {
        bail!("config has no targets");
    }

    let client = Arc::new(HttpClient::new(15, None, &[], false)?);
    let store = Store::open(Path::new(&cfg.store_path))?;
    let notifier = if args.dry_run {
        None
    } else {
        cfg.webhook_url.clone().map(WebhookNotifier::new)
    };

    loop {
        run_cycle(&cfg, &client, &store, &notifier, args.dry_run).await;
        if let Some(n) = &notifier {
            n.flush().await;
        }
        if args.once {
            break;
        }
        tokio::time::sleep(Duration::from_secs(cfg.interval_secs)).await;
    }
    Ok(())
}

async fn run_cycle(
    cfg: &Config,
    client: &Arc<HttpClient>,
    store: &Store,
    notifier: &Option<Arc<WebhookNotifier>>,
    dry_run: bool,
) {
    for target in &cfg.targets {
        let abort = Arc::new(AtomicBool::new(false));
        let (reachable, findings) = scan::passive_scan(
            target,
            Arc::clone(client),
            cfg.crawl_depth,
            cfg.max_urls,
            cfg.same_origin,
            abort,
        )
        .await;

        if !reachable {
            println!("[!] {target} unreachable — skipping (no resolution this cycle)");
            continue;
        }

        let now = now_secs();
        let known = store.is_target_known(target).unwrap_or(false);
        let mut current: HashSet<String> = HashSet::new();

        for f in &findings {
            let id = scan::identity(f);
            current.insert(id.clone());

            match store.get(&id).ok().flatten() {
                Some(mut sf) => {
                    sf.last_seen = now;
                    let _ = store.upsert(&sf);
                }
                None => {
                    let _ = store.upsert(&StoredFinding {
                        id: id.clone(),
                        target: target.clone(),
                        kind: f.vuln_type.clone(),
                        url: f.url.clone(),
                        matched: scan::redact(&f.payload),
                        first_seen: now,
                        last_seen: now,
                    });
                    if known {
                        report_new(notifier, f, dry_run);
                    }
                }
            }
        }

        if known {
            // Resolution only runs on a reachable scan, so a network blip never
            // produces false "fixed!" alerts.
            if let Ok(stored) = store.findings_for_target(target) {
                for sf in stored {
                    if !current.contains(&sf.id) {
                        let _ = store.remove(&sf.id);
                        println!("[resolved] {} — {}", sf.kind, sf.url);
                    }
                }
            }
        } else {
            let _ = store.mark_target_known(target, now);
            println!("[baseline] {target}: recorded {} finding(s) silently", findings.len());
        }
    }
}

fn report_new(notifier: &Option<Arc<WebhookNotifier>>, f: &ScanResult, dry_run: bool) {
    // Payload is redacted at the egress point (`build_payload`), so no full secret
    // leaves the process; the console line shows only type + URL.
    println!("[NEW] {} — {}", f.vuln_type, f.url);
    if !dry_run {
        if let Some(n) = notifier {
            n.on_finding(f);
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
