# Changelog

All notable changes to Arkenar are documented here.

---

## [1.0.1] — 2026-03-09

### Added
- **GUI desktop app** (Tauri v2) with real-time terminal output, findings tab, scan history, and one-click export
- **Scan queue** — add multiple targets and run them sequentially from the GUI
- **HTML report export** — generate a self-contained dark-theme report from any scan
- **Webhook alerts** — Discord, Slack, and generic JSON webhook support with a live test button
- **Abort / stop scan** — instant stop with `RAII` guard that always resets state, even on panic
- **Resume** (`--resume`) — pick up a previously interrupted CLI scan from saved state
- **`--dry-run`** — simulate a full scan without sending any real requests
- **Arabic language support** in the GUI

### Changed
- Nuclei phase now runs with `-duc` (skip update check) and `-ni` (no interactsh) by default, cutting startup time from 30–60 s to under 5 s
- Nuclei phase has a hard process-level kill timeout (`crawler_timeout`, default 60 s)
- `HttpClient::new()` now returns `Result` instead of panicking on builder failure
- Semaphore acquire in the engine uses `match` + `break` instead of `.expect()`
- `to_curl()` output is POSIX shell-quoted to prevent clipboard injection
- Discord / Slack webhook detection uses hostname parsing instead of substring matching
- `Content-Length: 0` is no longer injected on bodyless GET requests

### Fixed
- `-severity` flag was dangling in Nuclei args when no custom tags were set (RED-01)
- `SCAN_RUNNING` could stay `true` forever if the scan task panicked (RED-02)
- `panic!("Unknown tool")` in installer replaced with graceful log + return (RED-03)
- `$HOME/**` write permission in Tauri capabilities was too broad (RED-04)
- Windows drive-letter paths (`C:\`) bypassed the path-traversal check (RED-05)
- `total_urls` stat was incorrectly adding vulnerability-finding count to URL count
- Discord webhook alert title was missing its emoji
- Settings modal Escape key used a stale closure and missed unsaved-change detection
- Scan queue silently dropped remaining items when a queued scan failed immediately

### Security
- Tauri capabilities scoped to `$DOWNLOAD`, `$DOCUMENT/arkenar`, and `$DESKTOP` only
- `freezePrototype: true` added to `tauri.conf.json`
- Webhook URLs validated against SSRF blocklist (RFC-1918, loopback, `.local`)
- Input fields validated for shell metacharacters and path-traversal sequences before any subprocess is spawned

---

## [1.0.0] — 2026-01-01

- Initial release: CLI scanner with Katana crawler, Nuclei integration, and custom mutation engine
