# Changelog

All notable changes to Arkenar are documented here.

---

## [1.1.0] — 2026-03-14

### Added
- **Arkenar Studio (New Architecture)** — Completely refactored the Studio environment into a modular, high-performance architecture using a dedicated Custom Hook (`useStudio`).
- **Smart Auto-Login** — Added a CSRF-aware authentication handshake (GET -> Parse -> POST) that automatically captures and injects session cookies into Studio requests.
- **Traffic History Drawer** — Added a sidebar to track, search, and recall previous manual HTTP requests within the current session.
- **Advanced PoC Exporter** — One-click generation of Proof-of-Concept snippets in `cURL`, `Python Requests`, and `Raw HTTP` formats.
- **New Utility Toolkit** — Integrated real-time data manipulation tools: Base64 (Encode/Decode), URL Encoding, and Hex conversion directly within the request builder.
- **Beautify & Diff** — Added JSON beautifier for responses and a "Git-style" Diff mode to compare results between different payloads.

### Changed
- **Codebase Modularization** — Split the monolithic `StudioPanel.tsx` into five distinct, specialized components (`StudioRequest`, `StudioResponse`, `TrafficDrawer`, etc.) for better maintainability.
- **State Management Logic** — Moved all business logic, HTTP calls, and data transformation out of the UI components and into the `useStudio` state manager.
- **Tauri IPC Optimization** — Streamlined communication between the React frontend and Rust backend for manual HTTP requests to bypass CORS and utilize the native Arkenar engine.

### Fixed
- **State Desynchronization** — Resolved issues where request headers or body would get lost when switching between different scan tabs.
- **UI Freezing** — Fixed long-standing UI hangs during large response rendering by implementing optimized line-by-line code display.
- **CSS Layout Issues** — Improved the Studio's responsiveness and scrolling behavior for very long HTTP requests and responses.

### Security
- **Logic Isolation** — Improved security by keeping all sensitive data manipulation (like Smart Login handshakes) within the Rust backend, away from the browser context.
- **Input Sanitization** — Enhanced validation for manual request fields to prevent accidental command injection during PoC generation.

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
