//! Pure secret detection — no I/O, no async. Shared by the scanner, the Monitor,
//! and the IDE/LSP. The one place secret patterns live.

use regex::{Regex, RegexSet};
use std::collections::HashSet;
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Secret {
    pub kind: String,
    pub matched: String,
    /// 1-based line number within the scanned body.
    pub line: usize,
    /// 0-based character column of the match start within its line.
    pub col: usize,
}

struct Spec {
    name: &'static str,
    re: &'static str,
    /// Minimum Shannon entropy required of a match; `None` for structural patterns.
    min_entropy: Option<f64>,
}

const SPECS: &[Spec] = &[
    Spec { name: "OpenAI API Key", re: r"sk-proj-[A-Za-z0-9_-]{20,}", min_entropy: Some(3.0) },
    Spec { name: "OpenAI Service Key", re: r"sk-svcacct-[A-Za-z0-9_-]{20,}", min_entropy: Some(3.0) },
    Spec { name: "OpenAI API Key (legacy)", re: r"sk-[A-Za-z0-9]{48}", min_entropy: Some(3.0) },
    Spec { name: "Anthropic API Key", re: r"sk-ant-[A-Za-z0-9_-]{20,}", min_entropy: Some(3.0) },
    Spec { name: "Stripe Secret Key", re: r"sk_live_[A-Za-z0-9]{24,}", min_entropy: Some(3.0) },
    Spec { name: "Stripe Restricted Key", re: r"rk_live_[A-Za-z0-9]{24,}", min_entropy: Some(3.0) },
    Spec { name: "AWS Access Key", re: r"AKIA[0-9A-Z]{16}", min_entropy: Some(2.5) },
    Spec { name: "GitHub Token", re: r"ghp_[A-Za-z0-9]{36}", min_entropy: Some(3.0) },
    Spec { name: "GitHub Fine-Grained Token", re: r"github_pat_[A-Za-z0-9_]{82}", min_entropy: Some(3.0) },
    Spec { name: "Google API Key", re: r"AIza[0-9A-Za-z_-]{35}", min_entropy: Some(3.0) },
    Spec { name: "Hugging Face Token", re: r"hf_[A-Za-z0-9]{34,}", min_entropy: Some(3.0) },
    Spec { name: "Slack Token", re: r"xox[baprs]-[A-Za-z0-9-]{10,48}", min_entropy: Some(3.0) },
    Spec { name: "Private Key", re: r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----", min_entropy: None },
    Spec { name: "JWT", re: r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", min_entropy: None },
    Spec { name: "Hardcoded Secret", re: r#"(?i)(?:password|passwd|secret|api_key|apikey|token)\s*[:=]\s*["'][^"']{8,}["']"#, min_entropy: None },
];

struct Compiled {
    name: &'static str,
    regex: Regex,
    min_entropy: Option<f64>,
}

fn compiled() -> &'static (RegexSet, Vec<Compiled>) {
    static C: OnceLock<(RegexSet, Vec<Compiled>)> = OnceLock::new();
    C.get_or_init(|| {
        let set = RegexSet::new(SPECS.iter().map(|s| s.re)).expect("valid secret regex set");
        let pats = SPECS
            .iter()
            .map(|s| Compiled {
                name: s.name,
                regex: Regex::new(s.re).expect("valid secret regex"),
                min_entropy: s.min_entropy,
            })
            .collect();
        (set, pats)
    })
}

/// Scans a response/file body for secrets.
///
/// `content_type` (when known) gates out binary bodies — only text-like types are
/// scanned. Pass `None` to scan regardless. The `RegexSet` pre-filter means
/// per-pattern matching only runs for patterns that actually appear.
pub fn scan_bytes(body: &[u8], content_type: Option<&str>) -> Vec<Secret> {
    if let Some(ct) = content_type {
        if !is_text_like(ct) {
            return Vec::new();
        }
    }

    let text = String::from_utf8_lossy(body);
    let (set, pats) = compiled();
    let hits = set.matches(&text);
    if !hits.matched_any() {
        return Vec::new();
    }

    let mut out = Vec::new();
    let mut seen: HashSet<(&str, String)> = HashSet::new();

    for idx in hits.iter() {
        let pat = &pats[idx];
        for m in pat.regex.find_iter(&text) {
            let val = m.as_str();
            if is_placeholder(val) {
                continue;
            }
            if let Some(min) = pat.min_entropy {
                if shannon_entropy(val) < min {
                    continue;
                }
            }
            if !seen.insert((pat.name, val.to_string())) {
                continue;
            }
            out.push(Secret {
                kind: pat.name.to_string(),
                matched: truncate(val, 120),
                line: line_of(&text, m.start()),
                col: col_of(&text, m.start()),
            });
        }
    }
    out
}

fn is_text_like(ct: &str) -> bool {
    let ct = ct.to_ascii_lowercase();
    const OK: &[&str] = &[
        "text/", "json", "javascript", "ecmascript", "xml", "html", "csv", "graphql",
        "x-www-form",
    ];
    OK.iter().any(|k| ct.contains(k))
}

/// Reject obvious example/placeholder values to keep precision high.
fn is_placeholder(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    const TOK: &[&str] = &[
        "example", "xxxx", "placeholder", "redacted", "changeme", "your-", "your_",
        "123456789", "000000",
    ];
    TOK.iter().any(|t| l.contains(t))
}

fn shannon_entropy(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let len = s.len() as f64;
    let mut counts = [0u32; 256];
    for b in s.bytes() {
        counts[b as usize] += 1;
    }
    counts
        .iter()
        .filter(|&&c| c > 0)
        .map(|&c| {
            let p = c as f64 / len;
            -p * p.log2()
        })
        .sum()
}

fn line_of(text: &str, offset: usize) -> usize {
    text[..offset.min(text.len())]
        .bytes()
        .filter(|&b| b == b'\n')
        .count()
        + 1
}

fn col_of(text: &str, offset: usize) -> usize {
    let o = offset.min(text.len());
    let line_start = text[..o].rfind('\n').map(|i| i + 1).unwrap_or(0);
    text[line_start..o].chars().count()
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(secrets: &[Secret]) -> Vec<&str> {
        secrets.iter().map(|s| s.kind.as_str()).collect()
    }

    #[test]
    fn finds_openai_and_anthropic() {
        let body = b"const a='sk-proj-AbCd012345EfGh_QwErTyUiOp6789';\nx='sk-ant-api03-Zz98_Yy76Xx54Vv32-Uu10Tt';";
        let secrets = scan_bytes(body, Some("application/javascript"));
        let k = kinds(&secrets);
        assert!(k.contains(&"OpenAI API Key"));
        assert!(k.contains(&"Anthropic API Key"));
    }

    #[test]
    fn skips_binary_content_type() {
        let body = b"sk-proj-AbCd012345EfGh_QwErTyUiOp6789";
        assert!(scan_bytes(body, Some("image/png")).is_empty());
    }

    #[test]
    fn skips_placeholder() {
        let body = b"key='sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx'";
        assert!(scan_bytes(body, None).is_empty());
    }

    #[test]
    fn entropy_filter_rejects_low_entropy() {
        // Matches AKIA[0-9A-Z]{16} but is all 'A' → near-zero entropy.
        let body = b"AKIAAAAAAAAAAAAAAAAA";
        assert!(scan_bytes(body, None).is_empty());
    }

    #[test]
    fn reports_line_and_col() {
        let body = b"line one\nline two\nx='sk-proj-AbCd012345EfGh_QwErTyUiOp6789'";
        let s = scan_bytes(body, None);
        assert_eq!(s[0].line, 3);
        assert_eq!(s[0].col, 3); // after `x='`
    }
}
