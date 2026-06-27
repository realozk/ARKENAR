//! Terminal rendering — the human / quiet / JSON faces of a scan.
//!
//! The engine never prints; it only calls the sink. All presentation lives here.
//! Findings (the data) go to **stdout**; everything else — banner, logs, spinner,
//! and the end-of-scan summary (the chrome) — goes to **stderr**, so `--json` and
//! `--quiet` pipe cleanly (`arkenar … --json | jq`).
//!
//! ── Visual style (edit here to restyle the whole CLI) ──────────────────────
//! Look & feel is "confident minimalism": one warm accent against muted gray,
//! generous whitespace, and a box reserved for the findings that *earned* it.
//!   * `ACCENT`            — the one brand color (a warm terracotta).
//!   * `severity_colored`  — how a vuln type is colored.
//!   * `render_card` + `CARD_W` — the boxed card shown for verified findings.
//!   * `on_finding` (Rich) — the compact one-line stream during the scan.
//!   * `on_complete`       — the end-of-scan summary (cards + tally footer).

use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use colored::*;
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};

use crate::{ScanEventSink, ScanResult, SinkRef, Verification};

/// The stream/quiet marker for a finding's proven tier.
fn verif_marker(v: Verification) -> &'static str {
    match v {
        Verification::Live => "VERIFIED-LIVE",
        Verification::Reachable => "VERIFIED",
        Verification::Unverified => "potential",
    }
}

// ── Palette ─────────────────────────────────────────────────────────────────
/// The single warm accent (terracotta) used for all brand/structure elements.
/// Change this one RGB triple to re-tint the banner, boxes, and rules.
const ACCENT: (u8, u8, u8) = (0x38, 0xBD, 0xF8);

/// Paint a string in the accent color.
fn accent(s: &str) -> ColoredString {
    s.truecolor(ACCENT.0, ACCENT.1, ACCENT.2)
}

/// Paint `text` by the severity of `vuln_type`. Split from the rank so the
/// stream can show a short label (e.g. "AWS Access Key") but still color it by
/// the *full* type (e.g. "Sensitive Exposure [AWS Access Key]"). Edit the colors here.
fn paint_severity(vuln_type: &str, text: &str) -> ColoredString {
    match severity_rank(vuln_type) {
        0 => text.red().bold(),
        1 => text.yellow(),
        2 => text.bright_yellow(),
        _ => text.cyan(),
    }
}

/// Severity ordering rank (0 = most severe). Mirrors `severity_colored`'s buckets
/// so the color and the sort order always agree. Takes the *full* vuln type
/// (e.g. "Sensitive Exposure [...]") so exposures keep their keyword.
fn severity_rank(vuln_type: &str) -> u8 {
    let v = vuln_type.to_lowercase();
    if v.contains("sql") || v.contains("rce") || v.contains("command") {
        0
    } else if v.contains("xss") || v.contains("ssrf") || v.contains("path traversal") {
        1
    } else if v.contains("open redirect") || v.contains("sensitive") || v.contains("exposure") {
        2
    } else {
        3
    }
}

// ── Box-drawing helpers (the verified-finding card) ──────────────────────────
/// Inner content width of a summary card, in columns. Bump for wider cards.
const CARD_W: usize = 60;

/// How many verified findings get a full boxed card before the rest collapse
/// into a "+N more" line. Keeps a 50-finding scan from being a wall of boxes.
const MAX_CARDS: usize = 5;

/// Column width for the finding *type* in the live stream, so URLs line up like
/// a table. Long types are truncated with an ellipsis.
const STREAM_TYPE_W: usize = 22;

/// A finding's display category for the summary tally:
/// `Sensitive Exposure [AWS Access Key]` → `AWS Access Key`; `SQLi [param: id]` → `SQLi`.
fn category(vuln_type: &str) -> String {
    match vuln_type.find('[') {
        Some(i) if vuln_type.starts_with("Sensitive Exposure") => {
            let end = vuln_type.rfind(']').unwrap_or(vuln_type.len());
            vuln_type[i + 1..end].to_string()
        }
        Some(i) => vuln_type[..i].trim().to_string(),
        None => vuln_type.to_string(),
    }
}

fn dashes(n: usize) -> String {
    "─".repeat(n)
}

/// Truncate to `max` display chars, adding an ellipsis when it overflows.
fn truncate_str(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let keep: String = s.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", keep)
}

/// Top border with an inline title: `╭─ title ─────╮`.
fn card_top(title: &str) -> String {
    let title = truncate_str(title, CARD_W.saturating_sub(2));
    // inner span between the corners is CARD_W + 2; "─ " + title + " " uses (title+3).
    let fill = (CARD_W + 2).saturating_sub(title.chars().count() + 3);
    format!(
        "{}{}{}{}{}{}",
        accent("╭"),
        accent("─ "),
        accent(&title).bold(),
        accent(" "),
        accent(&dashes(fill)),
        accent("╮"),
    )
}

/// A `│ label    value         │` content row, padded to the card width.
fn card_row(label: &str, value: &str) -> String {
    const LABEL_W: usize = 8;
    let value = truncate_str(value, CARD_W.saturating_sub(LABEL_W + 1));
    let used = LABEL_W + 1 + value.chars().count();
    let pad = CARD_W.saturating_sub(used);
    format!(
        "{} {} {}{} {}",
        accent("│"),
        format!("{:<width$}", label, width = LABEL_W).bright_black(),
        value.white(),
        " ".repeat(pad),
        accent("│"),
    )
}

fn card_bottom() -> String {
    format!("{}{}{}", accent("╰"), accent(&dashes(CARD_W + 2)), accent("╯"))
}

/// The full boxed card for a single (verified) finding.
fn render_card(r: &ScanResult) -> Vec<String> {
    let mut out = vec![card_top(&r.vuln_type), card_row("target", &r.url)];

    if !r.payload.is_empty() {
        let vl = r.vuln_type.to_lowercase();
        let label = if vl.contains("sensitive") || vl.contains("exposure") {
            "secret"
        } else {
            "payload"
        };
        out.push(card_row(label, &r.payload));
    }

    let proof = r.notes.clone().unwrap_or_else(|| {
        format!(
            "reachable · {} · {}",
            r.status_code,
            r.server.as_deref().unwrap_or("?")
        )
    });
    out.push(card_row("proof", &proof));
    out.push(card_row("curl", &r.to_curl()));
    out.push(card_bottom());
    out
}

/// `12s` / `3m 4s` — compact elapsed time.
fn elapsed_str(d: Duration) -> String {
    let s = d.as_secs();
    if s >= 60 {
        format!("{}m {}s", s / 60, s % 60)
    } else {
        format!("{}s", s)
    }
}

/// How a scan renders its output. Chosen once from CLI flags.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderMode {
    /// Default: banner, colors, a live spinner, streamed findings + a summary.
    Rich,
    /// Findings only — no banner, config, progress, summary, or logs.
    Quiet,
    /// One JSON object per finding to stdout; everything else suppressed.
    Json,
}

pub struct ConsoleSink {
    mode: RenderMode,
    verified_only: bool,
    /// When `--verify-live` is on, a finding's tier isn't final until the post-scan probe,
    /// so the live stream stays neutral ("found") and the summary adjudicates the tier.
    verify_live: bool,
    mp: MultiProgress,
    spinner: Mutex<Option<ProgressBar>>,
    /// The current activity text the spinner shows (set per phase).
    phase: Mutex<String>,
    /// Running tally, shown live in the spinner as findings land.
    counts_v: AtomicUsize,
    counts_p: AtomicUsize,
}

impl ConsoleSink {
    pub fn new_ref(mode: RenderMode, verified_only: bool, verify_live: bool) -> SinkRef {
        Arc::new(Self {
            mode,
            verified_only,
            verify_live,
            mp: MultiProgress::new(),
            spinner: Mutex::new(None),
            phase: Mutex::new(String::new()),
            counts_v: AtomicUsize::new(0),
            counts_p: AtomicUsize::new(0),
        })
    }

    /// Sets the spinner's activity text (the phase), then refreshes it.
    fn set_phase(&self, msg: &str) {
        if self.mode != RenderMode::Rich {
            return;
        }
        *self.phase.lock().unwrap() = msg.to_string();
        self.update_spinner();
    }

    /// Records a finding in the running tally and refreshes the spinner.
    fn bump(&self, verified: bool) {
        if verified {
            self.counts_v.fetch_add(1, Ordering::Relaxed);
        } else {
            self.counts_p.fetch_add(1, Ordering::Relaxed);
        }
        self.update_spinner();
    }

    /// Rebuilds the spinner line: `⠹ <phase>   ● <verified>  ○ <potential>`.
    /// Creates the spinner on first use. Rich mode only.
    fn update_spinner(&self) {
        if self.mode != RenderMode::Rich {
            return;
        }
        let phase = self.phase.lock().unwrap().clone();
        let v = self.counts_v.load(Ordering::Relaxed);
        let p = self.counts_p.load(Ordering::Relaxed);
        let msg = if v + p > 0 {
            format!(
                "{}   {}  {}",
                accent(&phase),
                format!("● {}", v).green(),
                format!("○ {}", p).bright_black()
            )
        } else {
            accent(&phase).to_string()
        };
        let mut guard = self.spinner.lock().unwrap();
        let pb = guard.get_or_insert_with(|| {
            let pb = self.mp.add(ProgressBar::new_spinner());
            pb.set_style(
                ProgressStyle::with_template("  {spinner} {msg}")
                    .unwrap()
                    .tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ "),
            );
            pb.enable_steady_tick(Duration::from_millis(90));
            pb
        });
        pb.set_message(msg);
    }

    /// Chrome line (logs/phases/summary) to stderr. The spinner is suspended
    /// around the write so it can't clash on a terminal.
    fn chrome(&self, line: String) {
        let active = self.spinner.lock().unwrap().is_some();
        if active {
            self.mp.suspend(|| eprintln!("{}", line));
        } else {
            eprintln!("{}", line);
        }
    }

    /// Data line (findings) to stdout, suspending the spinner so it can't clash.
    fn data(&self, text: String) {
        if self.mode == RenderMode::Rich {
            self.mp.suspend(|| {
                println!("{}", text);
                let _ = std::io::stdout().flush();
            });
        } else {
            println!("{}", text);
            let _ = std::io::stdout().flush();
        }
    }
}

impl ScanEventSink for ConsoleSink {
    fn on_log(&self, level: &str, message: &str) {
        match self.mode {
            RenderMode::Json => {
                if level == "error" || level == "warn" {
                    eprintln!("{}", message);
                }
            }
            RenderMode::Quiet => {
                if level == "error" {
                    eprintln!("{}", message);
                }
            }
            RenderMode::Rich => {
                match level {
                    // A phase just drives the spinner — no scrollback line. The
                    // persistent milestone is the "done" ribbon below.
                    "phase" => {
                        if !message.trim().is_empty() {
                            self.set_phase(message.trim());
                        }
                        return;
                    }
                    // Phase complete: a persistent `✓ <detail>` ribbon line.
                    "done" => {
                        self.chrome(format!("  {} {}", "✓".green(), message.dimmed()));
                        return;
                    }
                    _ => {}
                }
                let already_tagged = message.starts_with('[')
                    || message.starts_with("──")
                    || message.starts_with("━");
                let prefix = match level {
                    "success" if !already_tagged => "[+] ",
                    "error" if !already_tagged => "[!] ",
                    "warn" if !already_tagged => "[~] ",
                    _ => "",
                };
                let combined = format!("{}{}", prefix, message);
                let colored = match level {
                    "success" => combined.green().to_string(),
                    "error" => combined.red().to_string(),
                    "warn" => combined.yellow().to_string(),
                    _ => combined.dimmed().to_string(),
                };
                self.chrome(colored);
            }
        }
    }

    /// Live, *ephemeral* preview of a finding as it lands — Rich mode only. The
    /// authoritative machine output (`--json` / `--quiet` stdout and the JSONL file) is
    /// emitted once, after the scan and any `--verify-live` pass, by `on_complete` /
    /// `write_results_file` — so those outputs always reflect the final verification tier.
    fn on_finding(&self, result: &ScanResult) {
        if self.mode != RenderMode::Rich {
            return;
        }
        if self.verified_only && !result.is_verified() {
            return;
        }

        // A calm, scannable one-line stream entry, column-aligned so URLs line up. Shows
        // the short category but colors it by full severity. Full detail (curl, secret,
        // proof) is reserved for the summary card.
        //
        // Under --verify-live the real tier isn't known until the post-scan probe, so the
        // stream stays neutral ("found") and never claims VERIFIED prematurely.
        let confirmed = result.is_verified() && !self.verify_live;
        let label = if self.verify_live {
            format!("{:<13}", "found")
        } else {
            format!("{:<13}", verif_marker(result.verification))
        };
        let (dot, label) = if confirmed {
            ("●".green(), label.green().bold())
        } else {
            ("○".bright_black(), label.bright_black())
        };
        let cat = format!(
            "{:<width$}",
            truncate_str(&category(&result.vuln_type), STREAM_TYPE_W),
            width = STREAM_TYPE_W
        );
        self.data(format!(
            "  {} {} {}  {}  {}",
            dot,
            label,
            paint_severity(&result.vuln_type, &cat),
            result.url.white(),
            format!("[{}]", result.status_code).bright_black(),
        ));

        self.bump(confirmed);
    }

    fn on_progress(&self, phase: &str, current: usize, total: usize) {
        if self.mode != RenderMode::Rich {
            return;
        }
        let msg = if total > 0 {
            format!("{} ({}/{})", phase, current, total)
        } else {
            phase.to_string()
        };
        self.set_phase(&msg);
    }

    fn finish(&self) {
        if let Some(pb) = self.spinner.lock().unwrap().take() {
            pb.finish_and_clear();
        }
    }

    /// End-of-scan summary: a boxed card for every finding that earned VERIFIED,
    /// then a one-line tally. Rich mode only (quiet/json stream findings only).
    fn on_complete(&self, results: &[ScanResult], elapsed: Duration) {
        // Authoritative machine output for the scriptable modes, emitted once the full
        // result set is final (post `--verify-live`). Findings are NOT streamed live in
        // these modes, so this is the single source of truth for `| jq` and `--quiet` —
        // and the only place the `live` tier / dead-key drops can appear.
        match self.mode {
            RenderMode::Json => {
                for r in results {
                    if r.vuln_type == "Safe" || (self.verified_only && !r.is_verified()) {
                        continue;
                    }
                    if let Ok(line) = r.to_json_line() {
                        self.data(line);
                    }
                }
                return;
            }
            RenderMode::Quiet => {
                for r in results {
                    if r.vuln_type == "Safe" || (self.verified_only && !r.is_verified()) {
                        continue;
                    }
                    self.data(format!(
                        "{}  {}  {}",
                        verif_marker(r.verification),
                        r.vuln_type,
                        r.url
                    ));
                }
                return;
            }
            RenderMode::Rich => {}
        }
        self.finish(); // tear down the spinner before the summary prints

        let findings: Vec<&ScanResult> = results
            .iter()
            .filter(|r| r.vuln_type != "Safe")
            .filter(|r| !self.verified_only || r.is_verified())
            .collect();
        let verified_n = findings.iter().filter(|r| r.is_verified()).count();
        let potential_n = findings.len() - verified_n;

        self.chrome(String::new());
        self.chrome(format!("  {} {}", accent("summary").bold(), accent(&dashes(CARD_W - 6))));
        self.chrome(String::new());

        if findings.is_empty() {
            self.chrome(format!(
                "  {}  ·  {}",
                "no findings".green(),
                elapsed_str(elapsed).bright_black()
            ));
            return;
        }

        // 1) Breakdown by category — counts per finding kind, verified first.
        //    This is what scales: one glance tells you the shape of the scan.
        // Tally per category: (count, any_verified, severity_rank).
        let mut order: Vec<String> = Vec::new();
        let mut tally: HashMap<String, (usize, bool, u8)> = HashMap::new();
        for r in &findings {
            let cat = category(&r.vuln_type);
            let rank = severity_rank(&r.vuln_type);
            let entry = tally.entry(cat.clone()).or_insert_with(|| {
                order.push(cat.clone());
                (0, false, rank)
            });
            entry.0 += 1;
            entry.1 |= r.is_verified();
            entry.2 = entry.2.min(rank);
        }
        // Verified first (the brand is proof), then by severity, then by count.
        order.sort_by(|a, b| {
            let (ca, va, ra) = tally[a];
            let (cb, vb, rb) = tally[b];
            vb.cmp(&va)
                .then(ra.cmp(&rb))
                .then(cb.cmp(&ca))
                .then(a.cmp(b))
        });
        for cat in &order {
            let (count, verified, _) = tally[cat];
            let (dot, name) = if verified {
                ("●".green(), cat.white())
            } else {
                ("○".bright_black(), cat.bright_black())
            };
            self.chrome(format!("  {} {:>2}  {}", dot, count, name));
        }
        self.chrome(String::new());

        // 2) Cards only for the findings that earned VERIFIED — capped, so a big
        //    scan doesn't bury you in boxes. The rest live in --json / the file.
        //    Most-severe verified findings win the limited card slots.
        let mut verified: Vec<&&ScanResult> = findings.iter().filter(|r| r.is_verified()).collect();
        verified.sort_by_key(|r| severity_rank(&r.vuln_type));
        for r in verified.iter().take(MAX_CARDS) {
            for line in render_card(r) {
                self.chrome(line);
            }
            self.chrome(String::new());
        }
        if verified.len() > MAX_CARDS {
            self.chrome(format!(
                "  {}",
                format!(
                    "… +{} more verified — full detail in --json / the output file",
                    verified.len() - MAX_CARDS
                )
                .bright_black()
            ));
            self.chrome(String::new());
        }

        // 3) The tally footer.
        self.chrome(format!(
            "  {}   {}   {}",
            format!("● {} verified", verified_n).green().bold(),
            format!("○ {} potential", potential_n).bright_black(),
            format!("· {}", elapsed_str(elapsed)).bright_black(),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(url: &str) -> ScanResult {
        ScanResult {
            url: url.to_string(),
            vuln_type: "Sensitive Exposure [OpenAI API Key]".to_string(),
            payload: "sk-proj-AbCd1234EfGh5678IjKl".to_string(),
            timing_ms: 142,
            status_code: 200,
            server: Some("nginx".to_string()),
            method: "GET".to_string(),
            request_headers: Vec::new(),
            request_body: None,
            tech_stack: Vec::new(),
            waf_detected: None,
            verification: Verification::Reachable,
            notes: None,
            loot: None,
        }
    }

    /// Every line of a card must be exactly the same display width, whether the
    /// content is short (padded) or long (truncated) — otherwise the box looks ragged.
    #[test]
    fn card_borders_align() {
        colored::control::set_override(false); // no ANSI, so char counts are exact
        let expected = CARD_W + 4; // ╭ + (CARD_W+2) + ╮

        for url in ["https://a.io/x", "https://example.com/very/long/path/that/overflows/app.bundle.js"] {
            for line in render_card(&sample(url)) {
                assert_eq!(
                    line.chars().count(),
                    expected,
                    "ragged card line ({} cols): {line}",
                    line.chars().count()
                );
            }
        }
    }
}
