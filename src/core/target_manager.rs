use std::collections::{HashSet, VecDeque};

/// Deduplicating target queue that tracks which URLs have been seen.
pub struct TargetManager {
    queue: VecDeque<String>,
    seen: HashSet<String>,
}

impl TargetManager {
    /// Creates a new, empty `TargetManager`.
    pub fn new() -> Self {
        Self {
            queue: VecDeque::new(),
            seen: HashSet::new(),
        }
    }

    /// Adds a target to the queue if it has not been seen before.
    pub fn add_target(&mut self, target: String) {
        if self.seen.insert(target.clone()) {
            self.queue.push_back(target);
        }
    }

    /// Returns the next pending target, or `None` if the queue is empty.
    pub fn next(&mut self) -> Option<String> {
        self.queue.pop_front()
    }

    /// Number of targets still queued.
    pub fn len(&self) -> usize {
        self.queue.len()
    }

    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }
}
