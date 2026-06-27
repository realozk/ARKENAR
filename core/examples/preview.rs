//! Renders a representative heavy scan (~50 mixed findings) through the real
//! ConsoleSink, so you can see the CLI at scale without a live target.
//!
//!   cargo run -p arkenar-core --example preview
//!
//! Tweak `ACCENT` / `CARD_W` in `notify/console.rs`, rerun, and see it instantly.

use std::time::Duration;

use arkenar_core::{ConsoleSink, RenderMode, ScanResult, Verification};

fn mk(vuln: &str, url: &str, payload: &str, verified: bool, notes: Option<&str>) -> ScanResult {
    ScanResult {
        url: url.to_string(),
        vuln_type: vuln.to_string(),
        payload: payload.to_string(),
        timing_ms: 120,
        status_code: 200,
        server: Some("nginx".to_string()),
        method: "GET".to_string(),
        request_headers: Vec::new(),
        request_body: None,
        tech_stack: Vec::new(),
        waf_detected: None,
        verification: if verified {
            Verification::Reachable
        } else {
            Verification::Unverified
        },
        notes: notes.map(|s| s.to_string()),
        loot: None,
    }
}

fn main() {
    let hosts = ["acme.io", "api.acme.io", "staging.acme.io", "blog.acme.io"];
    let mut results = Vec::new();

    // 12 exposures (verified secrets → each becomes a summary card)
    let secrets = [
        ("AWS Access Key", "AKIA5GH7K2QW9XZ3M8RT", "/.env"),
        ("Stripe Secret Key", "sk_live_4eC39HqLyjWDarjtT1zdp7dc", "/static/app.js"),
        ("OpenAI API Key", "sk-proj-AbCd1234EfGh5678IjKlMnOpQrSt", "/assets/main.bundle.js"),
        ("GitHub Token", "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456", "/config.json"),
        ("Google API Key", "AIzaSyA1B2C3D4E5F6G7H8I9J0KLMNOPQRSTUV", "/js/maps.js"),
        ("Slack Token", "xoxb-1234567890-abcdefghijkl", "/js/webhook.js"),
        ("Anthropic API Key", "sk-ant-AbCd1234EfGh5678IjKlMnOp", "/vendor.js"),
        ("Hugging Face Token", "hf_AbCdEfGhIjKlMnOpQrStUvWxYz012345", "/ml.js"),
        ("Private Key", "-----BEGIN RSA PRIVATE KEY-----", "/backup/id_rsa"),
        ("JWT", "eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSME", "/api/session"),
        ("AWS Access Key", "AKIA9XZ3M8RT5GH7K2QW", "/.env.bak"),
        ("Stripe Restricted Key", "rk_live_AbCd1234EfGh5678IjKlMnOp", "/checkout.js"),
    ];
    for (i, (kind, val, path)) in secrets.iter().enumerate() {
        results.push(mk(
            &format!("Sensitive Exposure [{}]", kind),
            &format!("https://{}{}", hosts[i % hosts.len()], path),
            val,
            true,
            Some(&format!("secret at line {}", 3 + i)),
        ));
    }

    // 38 injection / vuln findings (potential — not yet provable; that's §3/§5)
    let vulns = [
        ("SQLi [param: id]", "/product?id=", "1' OR '1'='1"),
        ("Blind SQLi [param: q]", "/search?q=", "1;WAITFOR DELAY '0:0:5'--"),
        ("XSS [param: name]", "/profile?name=", "<svg/onload=alert(1)>"),
        ("Open Redirect [param: next]", "/login?next=", "//evil.test"),
        ("SSRF [param: url]", "/fetch?url=", "http://169.254.169.254/"),
        ("Path Traversal [param: file]", "/download?file=", "../../etc/passwd"),
    ];
    let mut n = 0;
    'outer: for _ in 0..10 {
        for (vt, path, pl) in vulns.iter() {
            if n >= 38 {
                break 'outer;
            }
            results.push(mk(
                vt,
                &format!("https://{}{}{}", hosts[n % hosts.len()], path, pl),
                pl,
                false,
                None,
            ));
            n += 1;
        }
    }

    // Render through the real sink, exactly as a scan would.
    let sink = ConsoleSink::new_ref(RenderMode::Rich, false, false);
    sink.on_log("phase", "[*] Phase 2: ARKENAR Engine...");
    for r in &results {
        sink.on_finding(r);
    }
    sink.on_complete(&results, Duration::from_secs(47));
}
