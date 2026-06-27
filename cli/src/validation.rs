//! Input validation for the CLI. Every user-supplied string is untrusted; call these
//! immediately after `Args::parse()` and before building `ScanConfig`.
//!
//! Webhook SSRF validation deliberately lives in `arkenar_core::validation` (one source
//! of truth, with the typed-Host IPv6 handling) — don't reintroduce a copy here.

/// Validates a *data* field — a URL, proxy, regex, header, or cookie. These are never
/// passed through a shell (reqwest sends them as request data; subfinder takes argv
/// directly), so shell metacharacters are harmless here and are legal URL/regex/cookie
/// syntax — `?a=1&b=2`, `^https://x$`, `session=a; csrf=b` must all be accepted. The one
/// real risk is control characters, which enable CRLF header injection and log forging,
/// so those stay rejected.
pub fn validate_data_field(name: &str, val: &str) -> Result<(), String> {
    if val.chars().any(|c| c.is_control()) {
        return Err(format!(
            "Argument `{}` contains a control character (newline/CR/NUL not allowed).",
            name
        ));
    }
    Ok(())
}

/// Validates a *filesystem path* field (output, payload file, target list). These go
/// straight to `std::fs`, never a shell, so shell metacharacters are irrelevant — and a
/// metachar denylist would wrongly reject legitimate paths (Windows `\`, `C:\Program
/// Files (x86)\…`). The meaningful guards are: no NUL/control bytes (invalid in a path)
/// and no `..` traversal.
pub fn validate_path_field(name: &str, val: &str) -> Result<(), String> {
    if val.chars().any(|c| c.is_control()) {
        return Err(format!(
            "Argument `{}` contains a control character (not a valid path).",
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_field_allows_url_and_cookie_syntax() {
        // Regression: these are legal data, never shell-interpolated. They must pass.
        assert!(validate_data_field("target", "http://x.com/?a=1&b=2").is_ok());
        assert!(validate_data_field("auth-cookies", "session=abc; csrf=xyz").is_ok());
        assert!(validate_data_field("scope-regex", "^https://example\\.com$").is_ok());
        assert!(validate_data_field("header", "Authorization: Bearer ab.cd$ef").is_ok());
    }

    #[test]
    fn data_field_rejects_control_chars() {
        // CRLF injection into a header is the real risk — keep blocking it.
        assert!(validate_data_field("header", "X: y\r\nEvil: 1").is_err());
        assert!(validate_data_field("target", "http://x\n.com").is_err());
    }

    #[test]
    fn path_field_blocks_traversal_and_control() {
        assert!(validate_path_field("list", "../../etc/passwd").is_err());
        assert!(validate_path_field("output", "out\0.json").is_err());
        assert!(validate_path_field("list", "targets.txt").is_ok());
    }

    #[test]
    fn path_field_allows_real_os_paths() {
        // Regression: native OS paths must pass — they go to std::fs, not a shell.
        assert!(validate_path_field("output", r"C:\Program Files (x86)\arkenar\out.json").is_ok());
        assert!(validate_path_field("output", "/var/log/arkenar/out.json").is_ok());
    }
}
