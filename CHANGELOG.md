# Changelog

All notable changes to Arkenar are documented here.

---

## [1.1.0] — Phase 1: Foundation Intelligence & Studio Refactor

### Added
- **Arkenar Studio (New Architecture)** — Completely refactored the Studio environment into a modular architecture using a dedicated Custom Hook (`useStudio`) for high-performance state management.
- **Reflection Analysis (The Noise Killer)** — Implemented a pre-check system that injects randomized canary strings to detect reflected input before firing heavy payloads, drastically reducing false positives.
- **Technology Fingerprinting Module** — Built a fast heuristic matcher for server headers and DOM tags to identify target stacks (PHP, ASP.NET, Java, etc.) and optimize scan logic.
- **Smart Auto-Login** — Added a CSRF-aware authentication handshake (GET -> Parse -> POST) that automatically captures and injects session cookies into Studio requests.
- **Dynamic Payload Routing** — Upgraded the mutation engine to select payloads based on the detected technology stack (e.g., routing ASP.NET-specific payloads when IIS is detected).
- **Traffic History Drawer** — Added a sidebar to track, search, and recall previous manual HTTP requests within the current session.
- **Advanced PoC Exporter** — One-click generation of Proof-of-Concept snippets in `cURL`, `Python Requests`, and `Raw HTTP` formats.
- **Custom Nuclei Template Support** — Added the ability to load personal `.yaml` templates from a dedicated local folder directly via the GUI.
- **New Utility Toolkit** — Integrated real-time data manipulation tools: Base64 (Encode/Decode), URL Encoding, and Hex conversion directly within the request builder.

### Changed
- **Codebase Modularization** — Split the monolithic `StudioPanel.tsx` into five distinct, specialized components for better maintainability.
- **Optimized Scanning Logic** — Fuzzing context now respects concurrency caps by consuming Semaphore permits during reflection pre-checks.
- **UI Data Richness** — ScanFindingEvent now includes tech stack metadata, rendered as icons in the Findings and Terminal views.

### Fixed
- **State Desynchronization** — Resolved issues where request headers or body would get lost when switching between different scan tabs.
- **UI Freezing** — Fixed long-standing UI hangs during large response rendering by implementing optimized line-by-line code display.

### Security
- **Logic Isolation** — Improved security by keeping all sensitive data manipulation (like Smart Login handshakes) within the Rust backend.
- **Path Sanitization** — Added strict validation for custom template paths to prevent path traversal and shell metacharacter injection.
---

## [1.0.4] — 2026-03-12

### Fixed
- **Stop button now instant** — Katana and Nuclei subprocesses are killed immediately when Stop is pressed instead of waiting for the full crawler timeout to expire
- **Crawler was always returning 1 URL** — Katana's `-crawl-duration` flag requires a Go duration unit suffix (`60s`); passing bare `60` caused it to exit nearly instantly
- Verbose log was printing double unit suffix (`timeout: 60ss`) — corrected to `60s`

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
