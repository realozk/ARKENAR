//! Batched IPC event sink for the Tauri ↔ React bridge.
//!
//! Instead of calling `app.emit()` for every single HTTP finding (which causes
//! massive JSON serialization pressure and floods the WebView IPC channel),
//! this module buffers `ScanFindingEvent` items in a bounded async channel and
//! flushes them to the frontend as a single `Vec<ScanFindingEvent>` every 250ms.
//!
//! Design:
//!   - `FindingEmitter` is a cheap `Clone`-able handle to the channel tx side.
//!   - Call `FindingEmitter::push()` from any async context — it is non-blocking.
//!   - The flush task runs for the lifetime of a single scan and is cancelled
//!     automatically when the `FindingEmitter` and all its clones are dropped
//!     (the channel tx closes, causing the rx loop to exit cleanly).

use std::time::Duration;

use tauri::{async_runtime, AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::interval;

use crate::ScanFindingEvent;

/// Maximum number of findings buffered before back-pressure kicks in.
/// If the flush task is stalled for any reason, senders will still make
/// progress — they will drop findings gracefully rather than deadlock.
const CHANNEL_CAP: usize = 4_096;

/// How often the flush task drains the channel and emits to the frontend.
const FLUSH_INTERVAL: Duration = Duration::from_millis(250);

/// Maximum findings sent in a single IPC emit (protects WebView message size).
const MAX_BATCH_SIZE: usize = 200;

/// A lightweight, cloneable handle for pushing scan findings into the batch buffer.
///
/// Dropping all clones of a `FindingEmitter` will automatically shut down the
/// background flush task on the next interval tick.
#[derive(Clone)]
pub struct FindingEmitter {
    tx: mpsc::Sender<ScanFindingEvent>,
}

impl FindingEmitter {
    pub fn push(&self, finding: ScanFindingEvent) {
        let _ = self.tx.try_send(finding);
    }
}

/// Spawns the background flush task and returns a `FindingEmitter` handle.
///
/// The flush task will run until all `FindingEmitter` clones are dropped (channel
/// closes) or until the Tauri runtime shuts down.
///
/// # Arguments
/// * `app` — Tauri `AppHandle`; used to emit `"scan-findings-batch"` events.
pub fn spawn_finding_emitter(app: AppHandle) -> FindingEmitter {
    let (tx, mut rx) = mpsc::channel::<ScanFindingEvent>(CHANNEL_CAP);

    // Use Tauri's async runtime instead of tokio::spawn directly.
    // This is safe to call from any context, including the setup() closure,
    // because tauri::async_runtime::spawn goes through Tauri's runtime handle
    // rather than requiring an active thread-local Tokio context.
    async_runtime::spawn(async move {
        let mut ticker = interval(FLUSH_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            ticker.tick().await;

            let mut batch: Vec<ScanFindingEvent> = Vec::with_capacity(64);
            while batch.len() < MAX_BATCH_SIZE {
                match rx.try_recv() {
                    Ok(finding) => batch.push(finding),
                    Err(mpsc::error::TryRecvError::Empty) => break,
                    Err(mpsc::error::TryRecvError::Disconnected) => {
                        if !batch.is_empty() {
                            let _ = app.emit("scan-findings-batch", &batch);
                        }
                        return;
                    }
                }
            }

            if !batch.is_empty() {
                let _ = app.emit("scan-findings-batch", &batch);
            }
        }
    });

    FindingEmitter { tx }
}
