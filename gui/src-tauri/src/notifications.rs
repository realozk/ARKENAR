use arkenar_core::ScanResult;

/// Sends a webhook alert for a critical/high finding.
/// Supports Discord, Slack, and generic JSON webhooks.
pub async fn send_webhook(webhook_url: &str, result: &ScanResult) {
    let is_discord = webhook_url.contains("discord.com/api/webhooks");
    let is_slack = webhook_url.contains("hooks.slack.com");

    let payload = if is_discord {
        serde_json::json!({
            "embeds": [{
                "title": format!(" {} Detected", result.vuln_type),
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
            "text": format!(
                " *{}* detected on `{}`\nPayload: `{}`\nStatus: {} | {}ms",
                result.vuln_type, result.url, result.payload,
                result.status_code, result.timing_ms
            )
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

    let client = reqwest::Client::new();
    let _ = client.post(webhook_url)
        .json(&payload)
        .send()
        .await;
}
