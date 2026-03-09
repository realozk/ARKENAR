use arkenar_core::ScanResult;

/// Sends a webhook alert for a critical/high finding.
/// Supports Discord, Slack, and generic JSON webhooks.
/// Returns `(is_discord, is_slack)` by inspecting only the hostname of the URL.
/// Using hostname instead of a substring search on the full URL prevents crafted
/// relay paths like `/discord.com/api/webhooks/` from falsely matching.
fn classify_webhook(url: &str) -> (bool, bool) {
    if let Ok(parsed) = url::Url::parse(url) {
        let host = parsed.host_str().unwrap_or("").to_lowercase();
        let is_discord = host == "discord.com" || host.ends_with(".discord.com");
        let is_slack   = host == "hooks.slack.com";
        return (is_discord, is_slack);
    }
    (false, false)
}

pub async fn send_webhook(webhook_url: &str, result: &ScanResult) {
    let (is_discord, is_slack) = classify_webhook(webhook_url);

    let payload = if is_discord {
        serde_json::json!({
            "embeds": [{
                "title": format!("\u{1f6a8} {} Detected", result.vuln_type),
                "color": 15158332,
                "fields": [
                    { "name": "Target", "value": result.url, "inline": false },
                    { "name": "Payload", "value": result.payload, "inline": false },
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
                        { "type": "mrkdwn", "text": format!("*Payload:*\n`{}`", result.payload) },
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
            "payload": result.payload,
            "status_code": result.status_code,
            "timing_ms": result.timing_ms,
            "curl": result.to_curl(),
        })
    };

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };

    let _ = client.post(webhook_url)
        .json(&payload)
        .send()
        .await;
}
