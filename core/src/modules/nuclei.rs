use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::fs as async_fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use serde::Deserialize;
use crate::utils;
use crate::SinkRef;
use std::fs;
use crate::utils::installer::get_plugin_dir;
use crate::ScanConfig;

fn validate_path_field(name: &str, val: &str) -> anyhow::Result<()> {
    const FORBIDDEN: &[char] = &[';', '&', '|', '`', '$', '>', '<', '\\', '(', ')', '{', '}', '\0'];
    if val.chars().any(|c| FORBIDDEN.contains(&c)) {
        anyhow::bail!("{} contains forbidden characters.", name);
    }
    if val.contains("..") {
        anyhow::bail!("{} contains path-traversal sequence.", name);
    }
    Ok(())
}

pub async fn parse_template(file_path: &Path) -> Result<String, String> {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if ext != "yaml" && ext != "yml" {
        return Err(format!(
            "Invalid file type '{}'. Only .yaml or .yml templates are allowed.",
            ext
        ));
    }
    async_fs::read_to_string(file_path)
        .await
        .map_err(|e| format!("Failed to read template '{}': {}", file_path.display(), e))
}

#[derive(Deserialize, Debug)]
struct NucleiInfo {
    name: Option<String>,
    severity: Option<String>,
}

#[derive(Deserialize, Debug)]
struct NucleiOutput {
    info: Option<NucleiInfo>,
    #[serde(alias = "matched-at", alias = "host")]
    matched_at: Option<String>,
    #[serde(alias = "template-id", alias = "template_id")]
    template_id: Option<String>,
}

pub async fn run_nuclei_scan(
    target: &str,
    mode: &str,
    verbose: bool,
    custom_tags: Option<&str>,
    max_secs: u64,
    sink: &SinkRef,
    abort: Arc<AtomicBool>,
) -> anyhow::Result<()> {
    run_nuclei_scan_inner(target, mode, verbose, custom_tags, max_secs, sink, abort, "").await
}

pub async fn run_nuclei_scan_with_config(
    target: &str,
    config: &ScanConfig,
    sink: &SinkRef,
    abort: Arc<AtomicBool>,
) -> anyhow::Result<()> {
    if !config.nuclei_templates_dir.is_empty() {
        validate_path_field("nuclei_templates_dir", &config.nuclei_templates_dir)
            .map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    run_nuclei_scan_inner(
        target,
        &config.mode,
        config.verbose,
        config.tags_ref(),
        config.crawler_timeout,
        sink,
        abort,
        &config.nuclei_templates_dir,
    ).await
}

async fn run_nuclei_scan_inner(
    target: &str,
    mode: &str,
    verbose: bool,
    custom_tags: Option<&str>,
    max_secs: u64,
    sink: &SinkRef,
    abort: Arc<AtomicBool>,
    extra_templates_dir: &str,
) -> anyhow::Result<()> {
    let binary = match utils::get_binary_path("nuclei") {
        Some(path) => path,
        None => {
            sink.on_log("error", "[!] Error: 'nuclei' binary not found.");
            return Ok(());
        }
    };

    // Flag-injection guard: reject targets/tags that would become CLI flags.
    if target.starts_with('-') {
        sink.on_log("error", &format!(
            "[!] Refusing to pass '{}' to nuclei — starts with '-' (flag-injection guard).",
            target
        ));
        return Ok(());
    }
    if let Some(tags) = custom_tags {
        for tag in tags.split(',') {
            if tag.trim().starts_with('-') {
                sink.on_log("error", &format!(
                    "[!] Refusing to pass tag '{}' to nuclei — starts with '-' (flag-injection guard).",
                    tag.trim()
                ));
                return Ok(());
            }
        }
    }

    let is_simple = mode != "advanced";
    let timeout_str = if is_simple { "5" } else { "10" };
    let concurrency = if is_simple { "25" } else { "50" };

    sink.on_log("phase", &format!("[*] Launching Nuclei on: {}", target));
    if verbose {
        sink.on_log("info", &format!("[DEBUG] concurrency: {}", concurrency));
    }

    let mut args = vec![
        "-u", target,
        "-jsonl", "-silent",
        "-timeout", timeout_str,
        "-rate-limit", "50",
        "-c", concurrency,
        "-duc",
        "-ni",
        "-ns",
    ];

    let plugin_dir_string: String;
    let extra_dir_string: String;

    if let Some(tags) = custom_tags {
        if verbose {
            sink.on_log("info", &format!("[*] Custom tags active: {}", tags));
        }
        args.extend_from_slice(&["-tags", tags]);
    } else {
        if is_simple {
            args.extend_from_slice(&["-type", "dns,http"]);
            args.extend_from_slice(&["-severity", "high,critical"]);
        } else {
            args.extend_from_slice(&["-severity", "low,medium,high,critical"]);
        }
    }

    if !extra_templates_dir.is_empty() {
        extra_dir_string = extra_templates_dir.to_string();
        args.extend_from_slice(&["-t", &extra_dir_string]);
        sink.on_log("info", &format!("[+] Using custom templates dir: {}", extra_dir_string));
    } else if let Some(dir) = get_plugin_dir() {
        let has_templates = fs::read_dir(&dir)
            .map(|mut entries| {
                entries.any(|e| {
                    e.ok()
                        .and_then(|f| f.path().extension().map(|x| x == "yaml"))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        if has_templates {
            plugin_dir_string = dir.to_string_lossy().into_owned();
            args.extend_from_slice(&["-t", &plugin_dir_string]);
            sink.on_log("info", &format!("[+] Custom templates loaded from: {}", plugin_dir_string));
        }
    }

    let mut std_cmd = std::process::Command::new(&binary);
    std_cmd.args(&args)
           .stdout(Stdio::piped())
           .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000);
    }

    let mut child = match Command::from(std_cmd).spawn() {
        Ok(c) => c,
        Err(e) => {
            sink.on_log("error", &format!("[!] Failed to start Nuclei (is it installed?): {}", e));
            return Ok(());
        }
    };

    let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("Failed to capture stdout from nuclei"))?;
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut count: u32 = 0;

    let effective_max = if max_secs == 0 { 120 } else { max_secs };
    let scan_result = timeout(Duration::from_secs(effective_max), async {
        let mut n: u32 = 0;
        while let Ok(Some(raw_line)) = lines.next_line().await {
            if abort.load(Ordering::Relaxed) { break; }
            let line = raw_line.trim();
            if line.is_empty() { continue; }
            let parsed: NucleiOutput = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let name = parsed.info.as_ref().and_then(|i| i.name.as_deref());
            let severity_str = parsed.info.as_ref().and_then(|i| i.severity.as_deref()).unwrap_or("unknown");
            let matched_at = parsed.matched_at.as_deref().unwrap_or("N/A");
            let template_id = parsed.template_id.as_deref().unwrap_or("");
            if let Some(vuln_name) = name {
                n += 1;
                sink.on_log("success", &format!("[+] NUCLEI: {} [{}] @ {}", vuln_name, severity_str.to_uppercase(), matched_at));
                if verbose && !template_id.is_empty() {
                    sink.on_log("info", &format!("    [DEBUG] Template: {}", template_id));
                }
            }
        }
        n
    }).await;

    match scan_result {
        Ok(n) => {
            count = n;
            if abort.load(Ordering::Relaxed) { child.kill().await.ok(); }
        }
        Err(_) => {
            sink.on_log("warn", &format!("[!] Nuclei hit the {}s phase limit — stopping it. Partial results saved.", effective_max));
            child.kill().await.ok();
        }
    }

    let _ = child.wait().await;

    if count > 0 {
        sink.on_log("success", &format!("[*] Nuclei finished. {} finding(s).", count));
    } else {
        sink.on_log("info", "[*] Nuclei finished. No findings.");
    }

    Ok(())
}