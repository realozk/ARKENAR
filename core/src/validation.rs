//! Input validation for the CLI — mirrors the GUI's `validate_scan_config`.
//! Every user-supplied string is untrusted. Call these immediately after
//! `Args::parse()` and before building `ScanConfig`.
use url::Url;
const FORBIDDEN: &[char] = &[
    ';', '&', '|', '`', '$', '(', ')', '{', '}', '<', '>', '\\', '\n', '\r', '\0',
];
/// Block shell metacharacters and path-traversal sequences.
pub fn validate_text_field(name: &str, val: &str) -> Result<(), String> {
    if val.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err(format!("Argument `{}` contains a forbidden shell metacharacter.", name));
    }
    if val.contains("..") {
        return Err(format!("Argument `{}` contains path-traversal sequence `..`.", name));
    }
    Ok(())
}
/// Block flag-injection in comma-separated tag fields (e.g. `--tags`).
/// Tags must be alphanumeric + hyphens/underscores only.
pub fn validate_tags_field(name: &str, val: &str) -> Result<(), String> {
    for tag in val.split(',') {
        let tag = tag.trim();
        if tag.is_empty() { continue; }
        if tag.starts_with('-') {
            return Err(format!("Argument `{}`: tag `{}` looks like a CLI flag (flag injection blocked).", name, tag));
        }
        if !tag.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
            return Err(format!("Argument `{}`: tag `{}` contains invalid characters.", name, tag));
        }
    }
    Ok(())
}

/// Block SSRF: webhook URL must be HTTPS and must not resolve to a private/loopback address.
pub fn validate_webhook_url(raw: &str) -> Result<(), String> {
    use url::Host;

    let parsed = Url::parse(raw)
        .map_err(|e| format!("Webhook URL is invalid: {}", e))?;
    if parsed.scheme() != "https" {
        return Err("Webhook URL must use HTTPS.".to_string());
    }

    // The url crate returns "[::1]" (with brackets) from host_str() for IPv6 literals.
    // Use the typed Host enum for robust IP detection — no string-parsing ambiguity.
    match parsed.host() {
        None => return Err("Webhook URL has no host.".to_string()),
        Some(Host::Ipv4(v4)) => {
            if v4.is_loopback() || v4.is_private() || v4.is_link_local() {
                return Err(format!(
                    "Webhook URL `{}` resolves to a private IP (SSRF blocked).", v4
                ));
            }
            return Ok(());
        }
        Some(Host::Ipv6(v6)) => {
            if v6.is_loopback() {
                return Err(format!(
                    "Webhook URL `{}` resolves to a loopback IPv6 address (SSRF blocked).", v6
                ));
            }
            return Ok(());
        }
        Some(Host::Domain(_)) => {} // fall through to domain/hostname checks
    }

    // Domain name path — host_str() is safe here (no IPv6 brackets to worry about)
    let host = parsed
        .host_str()
        .ok_or_else(|| "Webhook URL has no host.".to_string())?
        .to_lowercase();

    // Explicit loopback/private hostname blocks
    if host == "localhost"
        || host == "ip6-localhost"
        || host.ends_with(".local")
        || host.ends_with(".internal")
    {
        return Err(format!(
            "Webhook URL host `{}` is a private/loopback hostname (SSRF blocked).", host
        ));
    }

    // String-prefix fallback for IP-ish hostnames that somehow didn't parse as IpAddr
    for prefix in &["127.", "10.", "0.", "169.254."] {
        if host.starts_with(prefix) {
            return Err("Webhook URL cannot target a private/loopback address.".to_string());
        }
    }
    if host.starts_with("192.168.") {
        return Err("Webhook URL cannot target a private address.".to_string());
    }
    if host.starts_with("172.") {
        let second: Option<u8> = host.split('.').nth(1).and_then(|s| s.parse().ok());
        if matches!(second, Some(16..=31)) {
            return Err("Webhook URL cannot target a private address.".to_string());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocks_shell_metachar() {
        assert!(validate_text_field("target", "http://x.com;rm -rf /").is_err());
        assert!(validate_text_field("target", "http://x.com").is_ok());
    }
    #[test]
    fn blocks_path_traversal() {
        assert!(validate_text_field("file", "../../etc/passwd").is_err());
        assert!(validate_text_field("file", "targets.txt").is_ok());
    }
    #[test]
    fn blocks_flag_injection_in_tags() {
        assert!(validate_tags_field("tags", "-exec,cve").is_err());
        assert!(validate_tags_field("tags", "--config,panel").is_err());
        assert!(validate_tags_field("tags", "cve,jira,panel").is_ok());
    }
    #[test]
    fn webhook_requires_https() {
        assert!(validate_webhook_url("http://hooks.slack.com/x").is_err());
        assert!(validate_webhook_url("https://hooks.slack.com/x").is_ok());
    }
    #[test]
    fn webhook_blocks_private_ip() {
        assert!(validate_webhook_url("https://192.168.1.1/hook").is_err());
        assert!(validate_webhook_url("https://10.0.0.1/hook").is_err());
        assert!(validate_webhook_url("https://127.0.0.1/hook").is_err());
        assert!(validate_webhook_url("https://localhost/hook").is_err());
    }
    // New tests added with stricter IPv6 / link-local coverage
    #[test]
    fn webhook_blocks_ipv6_loopback() {
        assert!(validate_webhook_url("https://[::1]/hook").is_err());
    }
    #[test]
    fn webhook_blocks_link_local() {
        assert!(validate_webhook_url("https://169.254.169.254/hook").is_err());
    }
    #[test]
    fn webhook_blocks_ip6_localhost_hostname() {
        assert!(validate_webhook_url("https://ip6-localhost/hook").is_err());
    }
}