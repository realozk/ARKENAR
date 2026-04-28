# Changelog

All notable changes to Arkenar are documented here.

---

## [1.2.0] — Phase 2: Structural Migration & Reconnaissance Suite

### Added
- **Recon Workspace** — Added a 3-panel UI architecture (`ReconTopBar`, `ReconLeftRail`, `ReconHostBoard`) for the Recon phase including a DNS Board, Subdomain tracking, and Port scanning interfaces.
- **DNS & WHOIS Module** — Built `dns_lookup.rs` using `trust-dns-resolver` and raw TCP connection logic to asynchronously retrieve A, MX, TXT, CNAME, and raw WHOIS records.
- **Port Scanner Module** — Built an async TCP connect scanner in `port_scanner.rs` to sweep the top 1000 ports concurrently using semaphores.
- **JS Secrets Scanner Module** — Added an async JavaScript analysis module that tests fetched endpoints against RegExp patterns detecting AWS Keys, GitHub Tokens, JWTs, and other API secrets.
- **Subfinder Integration** — Integrated projectdiscovery's `subfinder` for active subdomain mapping.
- **Live Sitemap Workspace** — Added a visual tree view inside the Basic Scanner to display discovered endpoints and nested domain structures.
- **Contextual Parameter Fuzzing** — Added payload logic targeting specifically named parameters to optimize payload selection and reduce scan times.

### Changed
- **Tailwind UI Migration** — Ported all application workspaces (Basic, Recon, Studio) to a Tailwind CSS-driven dark-themed, mono-styled design system.
- **CSS Variable Architecture (Phase 1)** — Replaced hard-coded hex colors with a token-driven design system inside `App.css` (e.g., `--color-bg-root-2`, `--color-accent-weak`, deep black themes).
- **Thin-Stroke Icon System (Phase 2)** — Phased out `lucide-react` in favor of a centralized, custom thin-stroke `Icon` primitive for unified visual language.
- **Cross-Tab State Persistence** — Shifted core application state (visited URLs, scan states, configs) to the top-level `App` component, so switching between Studio and Scanner doesn't lose terminal output.
- **Layout Adjustments** — Updated typography, density scaling, and the `AdvancedConfig` modal structure for high-density displays.

### Fixed
- **Custom Header Validation Bug** — Fixed strict header parsing inside `cli/src/main.rs` to allow `=` characters, so Cookie strings don't throw validation errors.
- **Recon Data Flow** — Fixed the backend `run_recon` command to reliably emit IPC events for both root domains and subdomains.
- **Native Titlebar macOS Integration** — Added platform-specific conditional rendering for seamless macOS transparent titlebars.

### Improved / Security
- **Codebase Hardening** — Did a pre-release pass on the Rust backend targeting dead-code removal, unifying debug routing channels, and streamlining error handling.
- **Comment Auditing** — Stripped redundant and verbose comments from the codebase, keeping only what's genuinely useful.

---

## [1.2.1] — Hardening & CI Polish

### Fixed
- **GUI `total_safe` miscount** — `ScanEngine::run()` now returns `usize` (total processed). The Tauri layer reads the count after the engine finishes, fixing a race where safe totals were computed before the scan loop completed.
- **JSONL write errors swallowed** — `result_aggregator.rs` now surfaces write failures through the event sink and disables further writes for that scan instead of silently dropping findings.

### Improved
- **`ConsoleSink` log prefixes** — CLI output now prefixes `[+]` / `[!]` / `[~]` / `[*]` per log level. Already-tagged messages are not double-prefixed.
- **Engine error visibility** — `basic_scan` errors are now logged via `warn!` instead of silently dropped.
- **Clippy clean (`-D warnings`)** — Resolved `lines_filter_map_ok`, `too_many_arguments`, `manual_map`, `collapsible_else_if`, `bool_assert_comparison`, `explicit_auto_deref`, `useless_vec`, `needless_borrow`, `empty_line_after_doc_comment`, `manual_unwrap_or_default`, `new_without_default`, `single_match`. Module-level docs converted from `///` to `//!` in 4 files.

### CI / Release
- **No bot commits** — `latest.json` is now uploaded as a GitHub release asset instead of committed back to `main`. `github-actions[bot]` no longer appears as a contributor.
- **Auto version sync from tag** — Pushing `v1.2.1` patches `tauri.conf.json`, `gui/src-tauri/Cargo.toml`, `core/Cargo.toml`, and `cli/Cargo.toml` in CI. The version shown inside the app always matches the release tag with no manual edits needed.

### Documentation
- **README** — Options expanded into five sub-tables covering ~30 flags with examples.
- **ARCHITECTURE.md** — Added `studio.rs` and `event_sink.rs` to the GUI breakdown; expanded ScanConfig table with new CLI flags.
- **ARKENAR_DOCUMENTATION.md** — Updated `TargetManager::pop_next` rename and `ScanEngine::run` return type.

---

## [1.1.0] — Phase 1: Foundation Intelligence & Studio Refactor

### Added
- **Arkenar Studio (New Architecture)** — Refactored the Studio into a modular architecture using a dedicated Custom Hook (`useStudio`) for state management.
- **Reflection Analysis (The Noise Killer)** — Added a pre-check system that injects randomized canary strings to detect reflected input before firing heavy payloads, reducing false positives.
- **Technology Fingerprinting Module** — Built a heuristic matcher for server headers and DOM tags to identify target stacks (PHP, ASP.NET, Java, etc.) and route payloads accordingly.
- **Smart Auto-Login** — Added a CSRF-aware authentication handshake (GET -> Parse -> POST) that captures and injects session cookies into Studio requests.
- **Dynamic Payload Routing** — Upgraded the mutation engine to select payloads based on the detected technology stack (e.g., routing ASP.NET-specific payloads when IIS is detected).
- **Traffic History Drawer** — Added a sidebar to track, search, and recall previous manual HTTP requests within the current session.
- **PoC Exporter** — One-click generation of Proof-of-Concept snippets in `cURL`, `Python Requests`, and `Raw HTTP` formats.
- **Custom Nuclei Template Support** — Added the ability to load personal `.yaml` templates from a local folder directly via the GUI.
- **New Utility Toolkit** — Integrated real-time data manipulation tools: Base64 (Encode/Decode), URL Encoding, and Hex conversion inside the request builder.

### Changed
- **Codebase Modularization** — Split the monolithic `StudioPanel.tsx` into five distinct components.
- **Optimized Scanning Logic** — Fuzzing context now respects concurrency caps by consuming Semaphore permits during reflection pre-checks.
- **UI Data Richness** — ScanFindingEvent now includes tech stack metadata, rendered as icons in the Findings and Terminal views.

### Fixed
- **State Desynchronization** — Fixed issues where request headers or body would get lost when switching between scan tabs.
- **UI Freezing** — Fixed UI hangs during large response rendering by implementing line-by-line code display.

### Security
- **Logic Isolation** — Kept all sensitive data manipulation (like Smart Login handshakes) within the Rust backend.
- **Path Sanitization** — Added validation for custom template paths to prevent path traversal and shell metacharacter injection.
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
