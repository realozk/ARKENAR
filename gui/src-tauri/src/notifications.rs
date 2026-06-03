use arkenar_core::ScanResult;

/// Sends a webhook alert. Delegates to `arkenar_core::notify` (shared with the CLI).
pub async fn send_webhook(webhook_url: &str, result: &ScanResult) {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };

    arkenar_core::notify::send_webhook(&client, webhook_url, result).await;
}
