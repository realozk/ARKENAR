//! Webhook payload formatting + delivery for Discord, Slack, and generic JSON.

use crate::ScanResult;

/// Redacts a secret to `head8…tail4` so live credentials never leave in full.
pub fn redact_secret(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= 14 {
        return "•".repeat(chars.len().max(4));
    }
    let head: String = chars[..8].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{}…{}", head, tail)
}

/// The payload value shown in alerts — redacted for secret findings, so a live key
/// is never reposted in full to an external chat service.
fn egress_payload(result: &ScanResult) -> String {
    if result.vuln_type.starts_with("Sensitive Exposure") {
        redact_secret(&result.payload)
    } else {
        result.payload.clone()
    }
}

/// Returns `(is_discord, is_slack)`. Matches on **hostname**, not substring, so a
fn classify_webhook(url: &str) -> (bool, bool) {
    if let Ok(parsed) = url::Url::parse(url) {
        let host = parsed.host_str().unwrap_or("").to_lowercase();
        let is_discord = host == "discord.com" || host.ends_with(".discord.com");
        let is_slack = host == "hooks.slack.com";
        return (is_discord, is_slack);
    }
    (false, false)
}

/// Builds the channel-appropriate JSON payload for a finding.
pub fn build_payload(webhook_url: &str, result: &ScanResult) -> serde_json::Value {
    let (is_discord, is_slack) = classify_webhook(webhook_url);
    let payload_display = egress_payload(result);

    if is_discord {
        serde_json::json!({
            "embeds": [{
                "title": format!("\u{1f6a8} {} Detected", result.vuln_type),
                "color": 15158332,
                "fields": [
                    { "name": "Target", "value": result.url, "inline": false },
                    { "name": "Payload", "value": payload_display, "inline": false },
                    { "name": "Status", "value": result.status_code.to_string(), "inline": true },
                    { "name": "Timing", "value": format!("{}ms", result.timing_ms), "inline": true },
                ],
                "footer": { "text": "Arkenar Scanner" }
            }]
        })
    } else if is_slack {
        serde_json::json!({
            "blocks": [
                {
                    "type": "header",
                    "text": { "type": "plain_text", "text": format!("\u{1f6a8} {} Detected", result.vuln_type) }
                },
                {
                    "type": "section",
                    "fields": [
                        { "type": "mrkdwn", "text": format!("*Target:*\n`{}`", result.url) },
                        { "type": "mrkdwn", "text": format!("*Payload:*\n`{}`", payload_display) },
                        { "type": "mrkdwn", "text": format!("*Status:* {}", result.status_code) },
                        { "type": "mrkdwn", "text": format!("*Timing:* {}ms", result.timing_ms) },
                    ]
                },
                {
                    "type": "context",
                    "elements": [{ "type": "mrkdwn", "text": "Arkenar Scanner" }]
                }
            ]
        })
    } else {
        serde_json::json!({
            "event": "vulnerability_found",
            "vuln_type": result.vuln_type,
            "url": result.url,
            "payload": payload_display,
            "status_code": result.status_code,
            "timing_ms": result.timing_ms,
            "curl": result.to_curl(),
        })
    }
}

/// POSTs a finding to the webhook. Best-effort (errors ignored). Caller must
/// SSRF-validate the URL first via [`crate::validation::validate_webhook_url`].
pub async fn send_webhook(client: &reqwest::Client, webhook_url: &str, result: &ScanResult) {
    let payload = build_payload(webhook_url, result);
    let _ = client.post(webhook_url).json(&payload).send().await;
}
