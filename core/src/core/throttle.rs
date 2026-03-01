/// Lock-free auto-throttle for the scan engine.
///
/// Monitors HTTP response codes and applies exponential backoff when targets
/// return 429 (Too Many Requests) or 403 (Forbidden). Uses atomics exclusively
/// to avoid contention in the hot path — no Mutex, no locking.
///
/// Backoff: 0 → 50 → 100 → 200 → ... → 2000ms cap.
/// Decay: -10ms per successful response, floors at 0.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering::Relaxed};
use tokio::time::{sleep, Duration};

const MAX_DELAY_MS: u64 = 2000;
const INITIAL_BACKOFF_MS: u64 = 50;
const DECAY_MS: u64 = 10;

pub struct ThrottleController {
    delay_ms: AtomicU64,
    consecutive_blocks: AtomicU32,
    total_throttled: AtomicU64,
}

impl ThrottleController {
    pub fn new() -> Self {
        Self {
            delay_ms: AtomicU64::new(0),
            consecutive_blocks: AtomicU32::new(0),
            total_throttled: AtomicU64::new(0),
        }
    }

    /// Sleeps for the current throttle delay. No-op when delay is 0.
    pub async fn wait(&self) {
        let ms = self.delay_ms.load(Relaxed);
        if ms > 0 {
            sleep(Duration::from_millis(ms)).await;
        }
    }

    /// Adjusts throttle based on response status.
    /// Returns true if this response triggered a backoff escalation.
    pub fn record_response(&self, status: u16) -> bool {
        if status == 429 || status == 403 {
            let blocks = self.consecutive_blocks.fetch_add(1, Relaxed) + 1;
            self.total_throttled.fetch_add(1, Relaxed);

            // Exponential backoff: 50 * 2^(blocks-1), capped at MAX_DELAY_MS
            let new_delay = (INITIAL_BACKOFF_MS * (1u64 << (blocks - 1).min(6))).min(MAX_DELAY_MS);
            self.delay_ms.store(new_delay, Relaxed);
            true
        } else {
            self.consecutive_blocks.store(0, Relaxed);

            // Gradual decay toward zero
            let current = self.delay_ms.load(Relaxed);
            if current > 0 {
                let new_delay = current.saturating_sub(DECAY_MS);
                self.delay_ms.store(new_delay, Relaxed);
            }
            false
        }
    }

    pub fn current_delay_ms(&self) -> u64 {
        self.delay_ms.load(Relaxed)
    }

    pub fn total_throttled(&self) -> u64 {
        self.total_throttled.load(Relaxed)
    }
}
