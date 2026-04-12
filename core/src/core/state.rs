/// Scan state persistence for crash recovery and resume.
///
/// Saves scan progress (config, pending URLs, collected results) to a JSON file 
/// after each target URL completes. Uses atomic write (tmp + rename) to prevent
/// corruption if the process is killed mid-flush.

use tokio::fs;
use serde::{Deserialize, Serialize};

use crate::ScanConfig;
use crate::core::result_aggregator::ScanResult;

const STATE_FILE: &str = ".arkenar-state.json";

#[derive(Serialize, Deserialize)]
pub struct ScanState {
    pub config: ScanConfig,
    pub pending_urls: Vec<String>,
    pub completed_results: Vec<ScanResult>,
    pub started_at: String,
    pub last_checkpoint: String,
}

impl ScanState {
    pub fn new(config: ScanConfig, urls: Vec<String>) -> Self {
        let now = now_iso();
        Self {
            config,
            pending_urls: urls,
            completed_results: Vec::new(),
            started_at: now.clone(),
            last_checkpoint: now,
        }
    }

    pub fn default_path() -> &'static str {
        STATE_FILE
    }

    /// ASYNC Atomic write: serialize to .tmp, then rename over the real file without blocking the executor.
    pub async fn save(&self, path: &str) -> anyhow::Result<()> {
        let tmp = format!("{}.tmp", path);
        
        // Serialization is CPU-bound, which is fine for small/medium structs, 
        // but the actual disk write MUST be async.
        let json = serde_json::to_string_pretty(self)?;
        
        fs::write(&tmp, &json).await?;
        fs::rename(&tmp, path).await?;
        
        Ok(())
    }

    pub async fn load(path: &str) -> Option<Self> {
        let data = fs::read_to_string(path).await.ok()?;
        serde_json::from_str(&data).ok()
    }

    /// Merge new results, remove completed URLs, flush to disk asynchronously.
    pub async fn checkpoint(
        &mut self,
        completed_url: &str,
        new_results: Vec<ScanResult>,
    ) -> anyhow::Result<()> {
        self.pending_urls.retain(|u| u != completed_url);
        self.completed_results.extend(new_results);
        self.last_checkpoint = now_iso();
        self.save(STATE_FILE).await
    }

    pub async fn delete(path: &str) {
        let _ = fs::remove_file(path).await;
    }

    pub async fn exists(path: &str) -> bool {
        fs::try_exists(path).await.unwrap_or(false)
    }
}

fn now_iso() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}s", dur.as_secs())
}