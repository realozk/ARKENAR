//! Persistent finding store + diff state (redb — pure-Rust, single sovereign binary).
//!
//! `findings`: stable identity → `StoredFinding`.
//! `targets`:  target URL → first-baselined timestamp (so the first scan of a target
//! is a silent baseline and later scans alert only on deltas).

use redb::{Database, ReadableTable, TableDefinition};
use serde::{Deserialize, Serialize};
use std::path::Path;

const FINDINGS: TableDefinition<&str, &str> = TableDefinition::new("findings");
const TARGETS: TableDefinition<&str, u64> = TableDefinition::new("targets");

#[derive(Serialize, Deserialize, Clone)]
pub struct StoredFinding {
    pub id: String,
    pub target: String,
    pub kind: String,
    pub url: String,
    pub matched: String,
    pub first_seen: u64,
    pub last_seen: u64,
}

pub struct Store {
    db: Database,
}

impl Store {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        let db = Database::create(path)?;
        let w = db.begin_write()?;
        {
            w.open_table(FINDINGS)?;
            w.open_table(TARGETS)?;
        }
        w.commit()?;
        Ok(Self { db })
    }

    pub fn is_target_known(&self, target: &str) -> anyhow::Result<bool> {
        let r = self.db.begin_read()?;
        let t = r.open_table(TARGETS)?;
        Ok(t.get(target)?.is_some())
    }

    pub fn mark_target_known(&self, target: &str, now: u64) -> anyhow::Result<()> {
        let w = self.db.begin_write()?;
        {
            let mut t = w.open_table(TARGETS)?;
            t.insert(target, now)?;
        }
        w.commit()?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> anyhow::Result<Option<StoredFinding>> {
        let r = self.db.begin_read()?;
        let t = r.open_table(FINDINGS)?;
        Ok(t.get(id)?.and_then(|v| serde_json::from_str(v.value()).ok()))
    }

    pub fn upsert(&self, f: &StoredFinding) -> anyhow::Result<()> {
        let json = serde_json::to_string(f)?;
        let w = self.db.begin_write()?;
        {
            let mut t = w.open_table(FINDINGS)?;
            t.insert(f.id.as_str(), json.as_str())?;
        }
        w.commit()?;
        Ok(())
    }

    pub fn remove(&self, id: &str) -> anyhow::Result<()> {
        let w = self.db.begin_write()?;
        {
            let mut t = w.open_table(FINDINGS)?;
            t.remove(id)?;
        }
        w.commit()?;
        Ok(())
    }

    pub fn findings_for_target(&self, target: &str) -> anyhow::Result<Vec<StoredFinding>> {
        let r = self.db.begin_read()?;
        let t = r.open_table(FINDINGS)?;
        let mut out = Vec::new();
        for entry in t.iter()? {
            let (_k, v) = entry?;
            if let Ok(f) = serde_json::from_str::<StoredFinding>(v.value()) {
                if f.target == target {
                    out.push(f);
                }
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn finding(id: &str, target: &str) -> StoredFinding {
        StoredFinding {
            id: id.to_string(),
            target: target.to_string(),
            kind: "OpenAI API Key".to_string(),
            url: format!("{}/app.js", target),
            matched: "sk-proj-…".to_string(),
            first_seen: 1,
            last_seen: 1,
        }
    }

    #[test]
    fn roundtrip_and_baseline() {
        let dir = std::env::temp_dir().join(format!("ark-mon-{}.redb", std::process::id()));
        let _ = std::fs::remove_file(&dir);
        let s = Store::open(&dir).unwrap();

        assert!(!s.is_target_known("https://a").unwrap());
        s.upsert(&finding("secret:abc", "https://a")).unwrap();
        s.mark_target_known("https://a", 1).unwrap();

        assert!(s.is_target_known("https://a").unwrap());
        assert!(s.get("secret:abc").is_ok());
        assert_eq!(s.findings_for_target("https://a").unwrap().len(), 1);

        s.remove("secret:abc").unwrap();
        assert!(s.get("secret:abc").unwrap().is_none());

        let _ = std::fs::remove_file(&dir);
    }
}
