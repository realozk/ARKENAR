//! Headless notification sinks: webhook delivery and a fan-out composite.

pub mod console;
pub mod telegram;
pub mod webhook;

pub use telegram::send_telegram;
pub use webhook::{build_payload, redact_secret, send_webhook};

use crate::{ScanEventSink, ScanResult, SinkRef};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};

enum Msg {
    Finding(Box<ScanResult>),
    /// Flush barrier: acked once every prior `Finding` has been delivered.
    Flush(oneshot::Sender<()>),
}

/// A [`ScanEventSink`] that POSTs findings to one webhook URL.
///
/// `on_finding` is sync but sending is async, so findings are queued on a channel
/// and drained by a background task. Call [`flush`](Self::flush) after the scan so
/// queued alerts are delivered before exit. URL must be SSRF-validated by the caller.
pub struct WebhookNotifier {
    tx: mpsc::UnboundedSender<Msg>,
}

impl WebhookNotifier {
    /// Spawns the delivery task. Requires a running Tokio runtime.
    pub fn new(webhook_url: String) -> Arc<Self> {
        let (tx, mut rx) = mpsc::unbounded_channel::<Msg>();

        tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .ok();

            while let Some(msg) = rx.recv().await {
                match msg {
                    Msg::Finding(result) => {
                        if let Some(ref client) = client {
                            webhook::send_webhook(client, &webhook_url, &result).await;
                        }
                    }
                    // FIFO (zhrani PTSD): reaching Flush means all prior findings are sent.
                    Msg::Flush(ack) => {
                        let _ = ack.send(());
                    }
                }
            }
        });

        Arc::new(Self { tx })
    }

    /// Blocks until every finding enqueued so far has been delivered.
    pub async fn flush(&self) {
        let (ack_tx, ack_rx) = oneshot::channel();
        if self.tx.send(Msg::Flush(ack_tx)).is_ok() {
            let _ = ack_rx.await;
        }
    }
}

impl ScanEventSink for WebhookNotifier {
    fn on_log(&self, _level: &str, _message: &str) {}

    fn on_finding(&self, result: &ScanResult) {
        let _ = self.tx.send(Msg::Finding(Box::new(result.clone())));
    }

    fn on_progress(&self, _phase: &str, _current: usize, _total: usize) {}
}

/// A [`ScanEventSink`] that POSTs findings to a Telegram chat via a bot. Same
/// non-blocking channel + `flush` pattern as [`WebhookNotifier`].
pub struct TelegramNotifier {
    tx: mpsc::UnboundedSender<Msg>,
}

impl TelegramNotifier {
    pub fn new(bot_token: String, chat_id: String) -> Arc<Self> {
        let (tx, mut rx) = mpsc::unbounded_channel::<Msg>();

        tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .ok();

            while let Some(msg) = rx.recv().await {
                match msg {
                    Msg::Finding(result) => {
                        if let Some(ref client) = client {
                            telegram::send_telegram(client, &bot_token, &chat_id, &result).await;
                        }
                    }
                    Msg::Flush(ack) => {
                        let _ = ack.send(());
                    }
                }
            }
        });

        Arc::new(Self { tx })
    }

    pub async fn flush(&self) {
        let (ack_tx, ack_rx) = oneshot::channel();
        if self.tx.send(Msg::Flush(ack_tx)).is_ok() {
            let _ = ack_rx.await;
        }
    }
}

impl ScanEventSink for TelegramNotifier {
    fn on_log(&self, _level: &str, _message: &str) {}
    fn on_finding(&self, result: &ScanResult) {
        let _ = self.tx.send(Msg::Finding(Box::new(result.clone())));
    }
    fn on_progress(&self, _phase: &str, _current: usize, _total: usize) {}
}

/// Forwards every event to several sinks in order (e.g. console + webhook).
pub struct CompositeSink {
    sinks: Vec<SinkRef>,
}

impl CompositeSink {
    /// `_ref` because it returns a trait object, not `Self` (cf. `ConsoleSink::new_ref`).
    pub fn new_ref(sinks: Vec<SinkRef>) -> SinkRef {
        Arc::new(Self { sinks })
    }
}

impl ScanEventSink for CompositeSink {
    fn on_log(&self, level: &str, message: &str) {
        for s in &self.sinks {
            s.on_log(level, message);
        }
    }

    fn on_finding(&self, result: &ScanResult) {
        for s in &self.sinks {
            s.on_finding(result);
        }
    }

    fn on_progress(&self, phase: &str, current: usize, total: usize) {
        for s in &self.sinks {
            s.on_progress(phase, current, total);
        }
    }

    fn finish(&self) {
        for s in &self.sinks {
            s.finish();
        }
    }

    fn on_complete(&self, results: &[ScanResult], elapsed: std::time::Duration) {
        for s in &self.sinks {
            s.on_complete(results, elapsed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ScanResult;

    fn sample() -> ScanResult {
        ScanResult {
            url: "https://target.example/api?id=1".to_string(),
            vuln_type: "SQLi".to_string(),
            payload: "1' OR '1'='1".to_string(),
            timing_ms: 42,
            status_code: 500,
            server: None,
            method: "GET".to_string(),
            request_headers: vec![],
            request_body: None,
            tech_stack: vec![],
            waf_detected: None,
            verification: crate::Verification::Unverified,
            notes: None,
            loot: None,
        }
    }

    #[test]
    fn discord_payload_has_embeds() {
        let v = build_payload("https://discord.com/api/webhooks/x/y", &sample());
        assert!(v.get("embeds").is_some());
    }

    #[test]
    fn slack_payload_has_blocks() {
        let v = build_payload("https://hooks.slack.com/services/x", &sample());
        assert!(v.get("blocks").is_some());
    }

    #[test]
    fn generic_payload_has_event_and_curl() {
        let v = build_payload("https://example.com/hook", &sample());
        assert_eq!(v.get("event").and_then(|e| e.as_str()), Some("vulnerability_found"));
        assert!(v.get("curl").is_some());
    }

    #[test]
    fn secret_payload_is_redacted_at_egress() {
        let mut s = sample();
        s.vuln_type = "Sensitive Exposure [OpenAI API Key]".to_string();
        s.payload = "sk-proj-AbCd012345EfGh_QwErTyUiOp6789".to_string();
        let text = serde_json::to_string(&build_payload("https://hooks.slack.com/x", &s)).unwrap();
        assert!(!text.contains("sk-proj-AbCd012345EfGh_QwErTyUiOp6789"));
        assert!(text.contains('…'));
    }

    #[test]
    fn relay_path_does_not_trick_classifier() {
        // host is evil.example, not discord.com → must fall through to generic, evil woooo
        let v = build_payload("https://evil.example/discord.com/api/webhooks/x", &sample());
        assert!(v.get("embeds").is_none());
        assert!(v.get("event").is_some());
    }
}
