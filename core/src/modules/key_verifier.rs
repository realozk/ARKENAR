//! Live key verification (`--verify-live`): one non-mutating call per unique key to its
//! own provider's auth endpoint. `200` → live; `401` → dead (dropped); anything else →
//! inconclusive (stays "potential" — never claim live on a maybe).
//!
//! Load-bearing invariants: opt-in only; a key is sent ONLY to its provider's hardcoded
//! URL (never one from the target); every probe is a read-only GET; deduped + capped (a
//! probe is observable by the provider); a dead provider is inconclusive, never fatal.
//!
//! No AWS: a leaked `AKIA…` is only the access-key ID; verifying it needs the paired
//! secret key we never have, and we won't fake the other half.

use std::collections::HashMap;
use std::time::Duration;

use crate::core::result_aggregator::{ScanResult, Verification};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeOutcome {
    Live,
    Rejected,
    Inconclusive,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct VerifyStats {
    pub probed: usize,
    pub live: usize,
    pub rejected: usize,
    pub inconclusive: usize,
}

/// A non-mutating auth probe for one provider. Add new providers in [`default_probes`].
#[async_trait::async_trait]
pub trait ProviderProbe: Send + Sync {
    fn name(&self) -> &'static str;
    /// Whether this probe handles a secret `kind` from `arkenar_secrets`.
    fn handles(&self, kind: &str) -> bool;
    async fn probe(&self, client: &reqwest::Client, key: &str) -> ProbeOutcome;
}

/// Conservative on purpose: only a clean `200`/`401` decides, so we never drop a real
/// key or claim a dead one is live.
fn interpret_status(status: u16) -> ProbeOutcome {
    match status {
        200 => ProbeOutcome::Live,
        401 => ProbeOutcome::Rejected,
        _ => ProbeOutcome::Inconclusive,
    }
}

fn interpret(resp: Result<reqwest::Response, reqwest::Error>) -> ProbeOutcome {
    match resp {
        Ok(r) => interpret_status(r.status().as_u16()),
        Err(_) => ProbeOutcome::Inconclusive,
    }
}

struct OpenAi;
#[async_trait::async_trait]
impl ProviderProbe for OpenAi {
    fn name(&self) -> &'static str {
        "OpenAI"
    }
    fn handles(&self, kind: &str) -> bool {
        kind.starts_with("OpenAI")
    }
    async fn probe(&self, client: &reqwest::Client, key: &str) -> ProbeOutcome {
        interpret(
            client
                .get("https://api.openai.com/v1/models")
                .bearer_auth(key)
                .send()
                .await,
        )
    }
}

struct Anthropic;
#[async_trait::async_trait]
impl ProviderProbe for Anthropic {
    fn name(&self) -> &'static str {
        "Anthropic"
    }
    fn handles(&self, kind: &str) -> bool {
        kind.starts_with("Anthropic")
    }
    async fn probe(&self, client: &reqwest::Client, key: &str) -> ProbeOutcome {
        interpret(
            client
                .get("https://api.anthropic.com/v1/models")
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await,
        )
    }
}

struct Stripe;
#[async_trait::async_trait]
impl ProviderProbe for Stripe {
    fn name(&self) -> &'static str {
        "Stripe"
    }
    fn handles(&self, kind: &str) -> bool {
        kind.starts_with("Stripe")
    }
    async fn probe(&self, client: &reqwest::Client, key: &str) -> ProbeOutcome {
        // Stripe auth = secret key as the basic-auth username.
        interpret(
            client
                .get("https://api.stripe.com/v1/balance")
                .basic_auth(key, None::<&str>)
                .send()
                .await,
        )
    }
}

struct GitHub;
#[async_trait::async_trait]
impl ProviderProbe for GitHub {
    fn name(&self) -> &'static str {
        "GitHub"
    }
    fn handles(&self, kind: &str) -> bool {
        kind.starts_with("GitHub")
    }
    async fn probe(&self, client: &reqwest::Client, key: &str) -> ProbeOutcome {
        // The client sets a default User-Agent, which GitHub requires.
        interpret(
            client
                .get("https://api.github.com/user")
                .bearer_auth(key)
                .send()
                .await,
        )
    }
}

pub fn default_probes() -> Vec<Box<dyn ProviderProbe>> {
    vec![
        Box::new(OpenAi),
        Box::new(Anthropic),
        Box::new(Stripe),
        Box::new(GitHub),
    ]
}

/// Extracts the secret kind from a finding's `vuln_type`
/// (`"Sensitive Exposure [OpenAI API Key]"` → `"OpenAI API Key"`).
pub fn secret_kind(vuln_type: &str) -> Option<&str> {
    let start = vuln_type.find('[')? + 1;
    let end = vuln_type.find(']')?;
    (start <= end).then(|| vuln_type[start..end].trim())
}

/// Unique keys we can probe, mapped to their provider index — deduped so identical keys
/// cost one probe.
fn collect_targets(
    results: &[ScanResult],
    probes: &[Box<dyn ProviderProbe>],
) -> HashMap<String, usize> {
    let mut map = HashMap::new();
    for r in results {
        if r.payload.is_empty() {
            continue;
        }
        if let Some(kind) = secret_kind(&r.vuln_type) {
            if let Some(idx) = probes.iter().position(|p| p.handles(kind)) {
                map.entry(r.payload.clone()).or_insert(idx);
            }
        }
    }
    map
}

/// Live → upgrade; Rejected → drop (a dead key is a false positive); Inconclusive →
/// demote to "potential"; a key with no probe (e.g. Google) keeps its existing tier.
fn apply_outcomes(results: &mut Vec<ScanResult>, outcomes: &HashMap<String, ProbeOutcome>) {
    results.retain_mut(|r| match outcomes.get(&r.payload) {
        Some(ProbeOutcome::Live) => {
            r.verification = Verification::Live;
            true
        }
        Some(ProbeOutcome::Rejected) => false,
        Some(ProbeOutcome::Inconclusive) => {
            r.verification = Verification::Unverified;
            true
        }
        None => true,
    });
}

/// Cap on total probes — don't hammer provider auth endpoints.
const MAX_PROBES: usize = 100;

/// Probe each unique detected key once and upgrade/drop/demote findings in place.
/// Opt-in: only call under `--verify-live`.
pub async fn verify_live(results: &mut Vec<ScanResult>, timeout: Duration) -> VerifyStats {
    let probes = default_probes();
    let client = match reqwest::Client::builder()
        .timeout(timeout)
        .user_agent("arkenar-verify-live")
        .build()
    {
        Ok(c) => c,
        Err(_) => return VerifyStats::default(),
    };

    let targets = collect_targets(results, &probes);
    let mut outcomes: HashMap<String, ProbeOutcome> = HashMap::new();
    let mut stats = VerifyStats::default();

    for (key, idx) in targets.iter().take(MAX_PROBES) {
        let outcome = probes[*idx].probe(&client, key).await;
        match outcome {
            ProbeOutcome::Live => stats.live += 1,
            ProbeOutcome::Rejected => stats.rejected += 1,
            ProbeOutcome::Inconclusive => stats.inconclusive += 1,
        }
        outcomes.insert(key.clone(), outcome);
    }
    stats.probed = outcomes.len();

    apply_outcomes(results, &outcomes);
    stats
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret_result(kind: &str, key: &str) -> ScanResult {
        ScanResult {
            url: "https://t/.env".into(),
            vuln_type: format!("Sensitive Exposure [{}]", kind),
            payload: key.into(),
            timing_ms: 0,
            status_code: 200,
            server: None,
            method: "GET".into(),
            request_headers: vec![],
            request_body: None,
            tech_stack: vec![],
            waf_detected: None,
            verification: Verification::Reachable,
            notes: None,
            loot: None,
        }
    }

    #[test]
    fn status_maps_to_outcome_conservatively() {
        assert_eq!(interpret_status(200), ProbeOutcome::Live);
        assert_eq!(interpret_status(401), ProbeOutcome::Rejected);
        // 403 (authenticated-but-forbidden), 429, 5xx → never "live", never dropped.
        assert_eq!(interpret_status(403), ProbeOutcome::Inconclusive);
        assert_eq!(interpret_status(429), ProbeOutcome::Inconclusive);
        assert_eq!(interpret_status(500), ProbeOutcome::Inconclusive);
    }

    #[test]
    fn probes_route_by_kind() {
        let probes = default_probes();
        let idx = |kind: &str| probes.iter().position(|p| p.handles(kind));
        assert_eq!(probes[idx("OpenAI API Key").unwrap()].name(), "OpenAI");
        assert_eq!(probes[idx("OpenAI Service Key").unwrap()].name(), "OpenAI");
        assert_eq!(probes[idx("Anthropic API Key").unwrap()].name(), "Anthropic");
        assert_eq!(probes[idx("Stripe Secret Key").unwrap()].name(), "Stripe");
        assert_eq!(probes[idx("GitHub Token").unwrap()].name(), "GitHub");
        // No probe for providers we can't single-token verify.
        assert!(idx("AWS Access Key").is_none());
        assert!(idx("Google API Key").is_none());
    }

    #[test]
    fn secret_kind_extracts_provider() {
        assert_eq!(
            secret_kind("Sensitive Exposure [OpenAI API Key]"),
            Some("OpenAI API Key")
        );
        assert_eq!(secret_kind("SQLi [param: id]"), Some("param: id"));
        assert_eq!(secret_kind("XSS"), None);
    }

    #[test]
    fn collect_targets_dedupes_identical_keys() {
        let probes = default_probes();
        let results = vec![
            secret_result("OpenAI API Key", "sk-proj-SAMEKEY"),
            secret_result("OpenAI API Key", "sk-proj-SAMEKEY"), // dup → one probe
            secret_result("GitHub Token", "ghp_OTHER"),
            secret_result("Google API Key", "AIzaNOPROBE"), // no provider → skipped
        ];
        let targets = collect_targets(&results, &probes);
        assert_eq!(targets.len(), 2); // SAMEKEY once + ghp_OTHER
        assert!(targets.contains_key("sk-proj-SAMEKEY"));
        assert!(targets.contains_key("ghp_OTHER"));
        assert!(!targets.contains_key("AIzaNOPROBE"));
    }

    #[test]
    fn apply_outcomes_upgrades_drops_and_demotes() {
        let mut results = vec![
            secret_result("OpenAI API Key", "live-key"),
            secret_result("GitHub Token", "dead-key"),
            secret_result("Stripe Secret Key", "unsure-key"),
            secret_result("Google API Key", "unprobed-key"),
        ];
        let mut outcomes = HashMap::new();
        outcomes.insert("live-key".to_string(), ProbeOutcome::Live);
        outcomes.insert("dead-key".to_string(), ProbeOutcome::Rejected);
        outcomes.insert("unsure-key".to_string(), ProbeOutcome::Inconclusive);

        apply_outcomes(&mut results, &outcomes);

        // dead-key dropped; the other three remain.
        assert_eq!(results.len(), 3);
        let by_key = |k: &str| results.iter().find(|r| r.payload == k).map(|r| r.verification);
        assert_eq!(by_key("live-key"), Some(Verification::Live));
        assert_eq!(by_key("unsure-key"), Some(Verification::Unverified));
        // Unprobed key keeps its Phase-3 tier.
        assert_eq!(by_key("unprobed-key"), Some(Verification::Reachable));
        assert!(by_key("dead-key").is_none());
    }
}
