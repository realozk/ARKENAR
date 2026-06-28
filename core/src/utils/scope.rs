//! Host-scoping for the crawler and JS analysis: keep a scan on the target's site.

use url::Url;

/// Common two-level public suffixes, so `shop.example.co.uk` → `example.co.uk`.
const TWO_LEVEL_SUFFIXES: &[&str] = &[
    "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
    "com.au", "net.au", "org.au", "gov.au", "edu.au", "id.au",
    "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
    "co.nz", "org.nz", "govt.nz", "ac.nz",
    "co.za", "org.za", "net.za",
    "com.br", "net.br", "gov.br", "org.br",
    "com.cn", "net.cn", "org.cn", "gov.cn",
    "com.sa", "net.sa", "org.sa", "gov.sa", "edu.sa",
    "com.tr", "com.mx", "com.ar", "com.sg", "com.hk", "com.tw",
    "co.in", "co.id", "co.kr", "co.il", "co.th",
];

/// Approximate eTLD+1 of a host. `a.b.flynas.com` → `flynas.com`.
fn registrable_domain(host: &str) -> String {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    let labels: Vec<&str> = host.split('.').collect();
    if labels.len() <= 2 {
        return host;
    }
    let last_two = format!("{}.{}", labels[labels.len() - 2], labels[labels.len() - 1]);
    let take = if TWO_LEVEL_SUFFIXES.contains(&last_two.as_str()) {
        3
    } else {
        2
    };
    labels[labels.len() - take..].join(".")
}

/// True when two hosts share a registrable domain.
pub fn same_site(a: &str, b: &str) -> bool {
    registrable_domain(a) == registrable_domain(b)
}

/// `strict_host` → exact host match; otherwise same registrable domain.
pub fn host_in_scope(base_host: Option<&str>, url: &str, strict_host: bool) -> bool {
    let base = match base_host {
        Some(h) => h.to_ascii_lowercase(),
        None => return false,
    };
    let cand = match Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()))
    {
        Some(h) => h,
        None => return false,
    };
    if strict_host {
        cand == base
    } else {
        same_site(&cand, &base)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registrable_domain_basics() {
        assert_eq!(registrable_domain("booking.flynas.com"), "flynas.com");
        assert_eq!(registrable_domain("flynas.com"), "flynas.com");
        assert_eq!(registrable_domain("a.b.c.flynas.com"), "flynas.com");
        assert_eq!(registrable_domain("WWW.Flynas.COM"), "flynas.com");
    }

    #[test]
    fn registrable_domain_two_level_suffix() {
        assert_eq!(registrable_domain("shop.example.co.uk"), "example.co.uk");
        assert_eq!(registrable_domain("api.alpha.com.sa"), "alpha.com.sa");
    }

    #[test]
    fn same_site_keeps_subdomains_rejects_third_parties() {
        assert!(same_site("booking.flynas.com", "www.flynas.com"));
        assert!(same_site("flynas.com", "booking.flynas.com"));
        assert!(!same_site("booking.flynas.com", "google.com"));
        assert!(!same_site("booking.flynas.com", "www.googletagmanager.com"));
    }

    #[test]
    fn host_in_scope_strict_vs_site() {
        let base = Some("booking.flynas.com");
        assert!(host_in_scope(base, "https://www.flynas.com/x", false));
        assert!(!host_in_scope(base, "https://www.flynas.com/x", true));
        assert!(host_in_scope(base, "https://booking.flynas.com/y", false));
        assert!(host_in_scope(base, "https://booking.flynas.com/y", true));
        assert!(!host_in_scope(base, "https://www.google-analytics.com/g", false));
        assert!(!host_in_scope(base, "https://www.google-analytics.com/g", true));
    }
}
