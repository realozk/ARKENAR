use serde::Deserialize;

#[derive(Deserialize)]
pub struct Config {
    #[serde(default = "default_interval")]
    pub interval_secs: u64,
    /// Slack/Discord/generic webhook for NEW-finding alerts. SSRF-validated at startup.
    pub webhook_url: Option<String>,
    #[serde(default = "default_depth")]
    pub crawl_depth: u32,
    #[serde(default = "default_max_urls")]
    pub max_urls: usize,
    #[serde(default = "default_same_origin")]
    pub same_origin: bool,
    #[serde(default = "default_store")]
    pub store_path: String,
    pub targets: Vec<String>,
}

fn default_interval() -> u64 {
    3600
}
fn default_depth() -> u32 {
    2
}
fn default_max_urls() -> usize {
    100
}
fn default_same_origin() -> bool {
    true
}
fn default_store() -> String {
    "arkenar-monitor.redb".to_string()
}
