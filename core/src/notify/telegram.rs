//! Telegram Bot API delivery. Posts to the fixed host `api.telegram.org`
//! (no SSRF surface); the bot token + chat id are operator config.

use crate::ScanResult;

/// Plain-text alert body for Telegram (secrets redacted).
pub fn message_text(result: &ScanResult) -> String {
    let payload = if result.vuln_type.starts_with("Sensitive Exposure") {
        super::redact_secret(&result.payload)
    } else {
        result.payload.clone()
    };
    format!(
        "\u{1f6a8} {} detected\nTarget: {}\nPayload: {}",
        result.vuln_type, result.url, payload
    )
}

pub async fn send_telegram(
    client: &reqwest::Client,
    bot_token: &str,
    chat_id: &str,
    result: &ScanResult,
) {
    let url = format!("https://api.telegram.org/bot{}/sendMessage", bot_token);
    let body = serde_json::json!({ "chat_id": chat_id, "text": message_text(result) });
    let _ = client.post(&url).json(&body).send().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sr(vt: &str, payload: &str) -> ScanResult {
        ScanResult {
            url: "https://t/".into(),
            vuln_type: vt.into(),
            payload: payload.into(),
            timing_ms: 0,
            status_code: 200,
            server: None,
            method: "GET".into(),
            request_headers: vec![],
            request_body: None,
            tech_stack: vec![],
            waf_detected: None,
            verification: crate::Verification::Reachable,
            notes: None,
            loot: None,
        }
    }

    #[test]
    fn redacts_secret_in_message() {
        let m = message_text(&sr(
            "Sensitive Exposure [OpenAI API Key]",
            "sk-proj-AbCd012345EfGh_QwErTyUiOp6789",
        ));
        assert!(!m.contains("sk-proj-AbCd012345EfGh_QwErTyUiOp6789"));
        assert!(m.contains('…'));
    }
}
