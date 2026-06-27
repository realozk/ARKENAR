# Changelog

All notable changes to Arkenar are documented here.

---

## [1.3.0] — Prove the leak

The release that makes the flagship *real*: secret findings stop being "a string shaped like
a key" and start being **proof**. One matcher, an earned verification tier, and opt-in live
key verification — every claim backed by a test.

### Added
- **Live key verification (`--verify-live`)** — the headline. Opt-in, off by default. For each
  detected key with a supported provider (OpenAI, Anthropic, Stripe, GitHub), Arkenar makes
  **one non-mutating** call to that provider's own auth endpoint: `200` → **VERIFIED-LIVE**,
  `401` → dropped as dead, anything else → "potential." Keys are deduped (one probe per unique
  key) and a key is only ever sent to its own provider. (`modules/key_verifier.rs`.)
  - A loud legal/scope warning fires on use (CLI + README): verifying a found key authenticates
    to a third party and may be forbidden by program rules or law.
  - **AWS is intentionally not verified** — a leaked `AKIA…` is only the access-key ID, and
    proving it live needs the paired secret key we never have. We don't claim what we can't do.
- **Earned verification tier** — `ScanResult.verified: bool` replaced by a `verification`
  strength enum: `unverified` / `reachable` / `live`. A secret is `reachable` only when it is a
  live `200`, **not** a soft-404 sink, and content-type-sane; `live` is reserved for a key proven
  against its provider. Injection findings stay `unverified` (active OAST confirmation is 1.5).
- **Soft-404 detection** — the crawler probes a random nonexistent path per host before forced
  browsing; a host that answers success to everything has its forced-browse hits downgraded.
- **Loot capture** — a verified forced-browse hit captures the fetched artifact (the `.env` /
  config body, capped) as evidence on the finding.
- **Precision corpus** (`secrets/tests/precision_corpus.rs`) — a fixed set of real-shaped
  exposures + decoys, run in CI, that asserts the false-positive/false-negative count. "Zero-FP"
  is now a published number (7 TP, 5 TN, 0 FP, 0 FN), gated on every build.
- **`schema_version`** on every `--json` / JSONL line, so downstream `jq` consumers can detect
  shape changes.
- Broadened forced-browse probe set (**5 → 37** paths): `.env.*` variants, `.git/HEAD`+`index`,
  db dumps/backups, `wp-config.php`, CI/CD config, auth/debug artifacts.
- **CI test workflow** (`.github/workflows/ci.yml`) — `cargo build`/`test` on push + PR
  (previously only a tag-triggered release workflow existed).

### Changed
- **One secret matcher.** Deleted the substring detector (`detector.rs::has_sensitive_patterns`,
  `is_sensitive_file_found`) — its FP-prone `body.contains("API_KEY=")` checks are gone. All
  response-body secret detection now flows through the single `arkenar_secrets::scan_bytes` choke
  point. A page that merely *mentions* `API_KEY=` in prose is no longer reported.
- README softened to match the binary; live verification and the verification tier documented.
- `ARCHITECTURE.md` updated: the `verification` tier, `loot`, `schema_version`, and the
  live-verification rule (`key_verifier`).

### Removed
- **Dead `--oast-server` flag** (and the dormant `oast_token` config field). OAST is a 1.5
  feature; the flag did nothing, so it's removed rather than left as dead surface. (It returns
  for real in 1.5.)

### Fixed
- Rich-mode chrome no longer leaks to stdout — the "Loaded N targets" line now goes to stderr,
  so the "findings = stdout, chrome = stderr" contract holds for clean `--json | jq` piping.

---

## [1.2.0]

### Added
- New Recon workspace (`ReconTopBar` / `ReconLeftRail` / `ReconHostBoard`) with a DNS board, subdomain tracking, and port scanning
- `dns_lookup` module — async A / MX / TXT / CNAME plus raw WHOIS over TCP, using `trust-dns-resolver`
- `port_scanner` module — async TCP connect scan over the top 1000 ports, semaphore-bounded
- `js_secrets` module — fetches JS files and matches against AWS keys, GitHub tokens, JWTs, and other API-secret patterns
- `subfinder` integration for active subdomain enumeration
- Live sitemap tree inside the Basic Scanner showing discovered endpoints
- Parameter-name-aware payload selection (faster scans, fewer obviously-wrong payloads)

### Changed
- All three workspaces (Basic, Recon, Studio) migrated to Tailwind CSS with a token-driven dark theme
- All hard-coded hex colors in `App.css` replaced with CSS custom properties (`--color-bg-*`, `--color-accent-*`, etc.)
- Dropped `lucide-react` in favor of an in-house thin-stroke `Icon` primitive
- Top-level state (visited URLs, scan status, config) lifted into `App` so switching tabs doesn't wipe the terminal
- Density / typography pass on the Advanced Config modal for high-DPI screens

### Fixed
- Custom-header parsing in the CLI no longer rejects `=` inside cookie values
- `run_recon` now emits IPC events for both the root domain and its subdomains
- macOS native titlebar overlay no longer overlaps window content
- `total_safe` count was computed before the scan loop finished — `ScanEngine::run()` now returns `usize` and the Tauri layer reads the count after it returns
- JSONL write failures in `result_aggregator.rs` were silently dropped — now surfaced through the event sink and further writes for that scan are disabled

### Internal
- Pre-release dead-code sweep and comment cleanup across the Rust backend
- `ConsoleSink` now prefixes `[+]`/`[!]`/`[~]`/`[*]` per log level and skips re-tagging already-prefixed messages
- `basic_scan` errors now log via `warn!` instead of being dropped
- Workspace builds clean under `cargo clippy -D warnings`; module docs converted from `///` to `//!` where appropriate

### Release / CI
- `latest.json` is now a release asset, served via `releases/latest/download/latest.json` (the in-app updater endpoint was repointed to match)
- Tag pushes auto-patch `tauri.conf.json` and the three `Cargo.toml`s, so the version shown in-app always matches the tag

### Docs
- README options grouped into five sub-tables with examples
- `ARCHITECTURE.md`: added `studio.rs` and `event_sink.rs`, expanded the `ScanConfig` table
- `ARKENAR_DOCUMENTATION.md`: `TargetManager::pop_next` rename + `ScanEngine::run` return type

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
