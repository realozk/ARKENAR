//! Input validation for the CLI — mirrors the GUI's `validate_scan_config`.
//! Every user-supplied string is untrusted. Call these immediately after
//! `Args::parse()` and before building `ScanConfig`.

use std::net::IpAddr;
use url::Url;

const FORBIDDEN: &[char] = &[
    ';', '&', '|', '`', '$', '(', ')', '{', '}', '<', '>', '\\', '\n', '\r', '\0',
];

/// Block shell metacharacters and path-traversal sequences.
pub fn validate_text_field(name: &str, val: &str) -> Result<(), String> {
    if val.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err(format!(
            "Argument `{}` contains a forbidden shell metacharacter.",
            name
        ));
    }
    if val.contains("..") {
        return Err(format!(
            "Argument `{}` contains path-traversal sequence `..`.",
            name
        ));
    }
    Ok(())
}

/// Block flag-injection in comma-separated tag fields (e.g. `--tags`).
/// Tags must be alphanumeric + hyphens/underscores only.
pub fn validate_tags_field(name: &str, val: &str) -> Result<(), String> {
    for tag in val.split(',') {
        let tag = tag.trim();
        if tag.is_empty() {
            continue;
        }

        if tag.starts_with('-') {
            return Err(format!(
                "Argument `{}`: tag `{}` looks like a CLI flag (flag injection blocked).",
                name, tag
            ));
        }

        if !tag
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        {
            return Err(format!(
                "Argument `{}`: tag `{}` contains invalid characters.",
                name, tag
            ));
        }
    }
    Ok(())
}

/// Block SSRF: webhook URL must be HTTPS and must not target private/loopback IPs.
pub fn validate_webhook_url(raw: &str) -> Result<(), String> {
    let url = Url::parse(raw).map_err(|e| format!("Webhook URL is invalid: {}", e))?;

    if url.scheme() != "https" {
        return Err("Webhook URL must use HTTPS.".to_string());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "Webhook URL has no host.".to_string())?;

    if host == "localhost" || host.ends_with(".local") || host.ends_with(".internal") {
        return Err(format!(
            "Webhook URL host `{}` is a private/loopback hostname (SSRF blocked).",
            host
        ));
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_ip(ip) {
            return Err(format!(
                "Webhook URL `{}` resolves to a private IP (SSRF blocked).",
                ip
            ));
        }
    }

    Ok(())
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => v6.is_loopback(),
    }
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
}
