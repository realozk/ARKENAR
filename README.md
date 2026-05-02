<div align="center"> <img src="/media/603C35E3-83BA-4984-BFCF-37E9B0F0A70E.jpg" width="100%" alt="Arkenar Banner"> </div>

**Arkenar is a web scanner I built that ties together Katana and Nuclei with a custom mutation engine. The goal is to find injection flaws and logic bugs that static templates tend to miss.**

It comes as a desktop app (GUI) and a command-line tool (CLI). Both use the same core engine — pick whichever fits your workflow.

<p align="center">

  <a href="https://github.com/realozk/ARKENAR/blob/main/LICENSE">
    <img src="https://img.shields.io/github/v/release/realozk/ARKENAR?style=for-the-badge&color=22c55e&v=1">
  </a>

  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-3b82f6?style=for-the-badge">
</p>

<p align="center">
  <a href="https://github.com/projectdiscovery/katana">
    <img src="https://img.shields.io/badge/Katana-ProjectDiscovery?style=for-the-badge&labelColor=1f6feb&color=0b1220&logo=github&logoColor=white">
  </a>
  <a href="https://github.com/projectdiscovery/nuclei">
    <img src="https://img.shields.io/badge/Nuclei-ProjectDiscovery?style=for-the-badge&labelColor=dc2626&color=0b1220&logo=github&logoColor=white">
  </a>
  <a href="https://crates.io/crates/arkenar">
    <img src="https://img.shields.io/crates/v/arkenar.svg?style=for-the-badge&color=e65100">
  </a>
</p>

## Table of Contents

- [Preview](#preview)
- [Installation](#installation)
- [GUI Features](#gui-features)
- [CLI Usage](#cli-usage)
- [Troubleshooting](#troubleshooting)
- [Architecture & Docs](#architecture--docs)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)

---

## Preview

<div align="center"> <img src="/media/demo.gif" width="90%" alt="Arkenar Demo"> </div>

---

## Installation

### GUI Desktop App

Download the installer from [GitHub Releases](https://github.com/realozk/ARKENAR/releases/latest):

| Platform | File |
|----------|------|
| **Windows** | `Arkenar_*_x64-setup.exe` — double-click, no admin required |
| **Linux** | `arkenar_*_amd64.AppImage` (portable) or `arkenar_*_amd64.deb` |
| **macOS** | `Arkenar_*_universal.dmg` — works on both Intel and Apple Silicon |

The app auto-downloads Katana and Nuclei on first launch.

### CLI — Windows
```powershell
iwr -useb https://raw.githubusercontent.com/realozk/ARKENAR/main/install.ps1 | iex
```

### CLI — Linux & macOS
```bash
curl -sL https://raw.githubusercontent.com/realozk/ARKENAR/main/install.sh | bash
```

---

## GUI Features

The desktop app has four main workspaces: **Scanner**, **Studio**, **Recon**, and **History**.

### Basic Scanner

This is the main scanning interface. You set a target, pick your options, and watch it run.

**Targets**
- Single URL or a list file (drag-drop or browse)
- Scan queue — add multiple targets and run them one after another
- Paste from clipboard

**Scan Modes**
- `Simple` — runs a fast crawl + Nuclei pass
- `Advanced` — adds WAF evasion, deeper fuzzing, and more Nuclei coverage

**Module toggles**
- Katana crawler — discovers URLs before scanning
- Nuclei scanner — runs CVE/panel/tech templates
- JS endpoint analysis — finds hidden API paths in JavaScript
- Parameter fuzzing — tests query params with contextual payloads
- Tech fingerprinting — detects the stack and routes payloads accordingly
- Smart payloads — picks payload types based on parameter names (e.g. `id` → SQLi)
- WAF evasion — mutates payloads when it hits 403s

**Performance**
- Threads (1–500), timeout (1–120s), rate limit (1–5000 req/s)
- Crawler depth, max URLs, and crawl timeout
- Proxy, custom headers, scope regex

**Auth**
- Bearer token, cookie string, or custom headers

**During a scan**
- Live terminal output with `[+]` / `[!]` / `[~]` / `[*]` prefixes
- Findings tab updates in real time with severity labels
- Top bar shows targets, URLs found, critical/medium/safe counts, RPS, and elapsed time
- Ctrl+Enter to start, Esc to stop

**After a scan**
- Export a self-contained HTML report
- Export scan history as CSV
- Findings stay in the History tab across sessions (up to 50 scans)

**Keyboard shortcuts**

| Key | Action |
|-----|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+Enter` | Start scan |
| `Esc` | Stop scan |
| `T` / `F` / `H` | Switch to Terminal / Findings / History |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+,` | Settings |

---

### Studio

A manual HTTP request builder for testing individual endpoints.

- Build requests with any method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- Tabs for headers, body, query params, and environment variables
- Response viewer with body, headers, cookies, and diff view
- Syntax highlighting, response timing, and size display
- Session history — search and reload previous requests
- PoC export — one click generates cURL, Python Requests, or Raw HTTP
- Smart Auto-Login — give it a login URL and credentials, it handles GET → parse CSRF → POST automatically and injects the session cookies

---

### Recon

Reconnaissance workspace for mapping a target before you scan it.

- **Subdomain enumeration** via Subfinder
- **Port scanning** — async TCP connect scan of the top 1000 ports
- **DNS records** — A, MX, TXT, CNAME, and raw WHOIS
- **JS secrets detection** — scans fetched JS files for AWS keys, GitHub tokens, JWTs, and other patterns
- Host board with filters: all hosts / high-risk (open ports) / alive / hosts with secrets
- Add any discovered host directly to the scan queue or send it to Studio

---

### History & Settings

- **History** — full list of past scans with timestamps, finding counts, and CSV export
- **Settings** — global defaults for threads/timeout/rate-limit, webhook URL (Discord, Slack, or custom JSON), output path, UI scale, and audio notifications

---

## CLI Usage

```bash
# scan a single target
arkenar https://example.com

# scan a list with a custom rate limit
arkenar -l targets.txt -o results.json --rate-limit 150

# full example
arkenar https://example.com -m advanced -t 100 --enable-js-analysis --proxy http://127.0.0.1:8080
```

Run `arkenar --help` for everything. Common flags:

### Targeting & output
| Flag | Description | Default |
| :--- | :--- | :--- |
| `-l`, `--list <FILE>` | File of target URLs (one per line) | — |
| `-o`, `--output <FILE>` | JSON output path | `scan_results.json` |
| `-p`, `--payloads <FILE>` | Extra payload file to merge in | — |
| `--dry-run` | Print targets without sending requests | — |
| `--resume` | Resume from `.arkenar-state.json` | — |
| `--update` | Update Arkenar + Katana + Nuclei | — |

### Scan profile
| Flag | Description | Default |
| :--- | :--- | :--- |
| `-m`, `--mode` | `simple` or `advanced` | `simple` |
| `-t`, `--threads <N>` | Concurrent workers | `50` |
| `--rate-limit <N>` | Max requests/sec | `100` |
| `--timeout <N>` | Per-request timeout (seconds) | `5` |
| `-v`, `--verbose` | Detailed logs | — |

### Modules
| Flag | Description |
| :--- | :--- |
| `--no-crawler` | Skip the Katana crawl phase |
| `--no-nuclei` | Skip the Nuclei scan phase |
| `--enable-param-fuzz` | Enable parameter fuzzing |
| `--enable-js-analysis` | Enable JS endpoint analysis |
| `--enable-waf-evasion` | Mutate payloads on 403 responses |
| `--no-fingerprint` | Disable tech-stack fingerprinting |
| `--no-smart-payloads` | Disable context-aware payload selection |

### Crawler
| Flag | Description | Default |
| :--- | :--- | :--- |
| `--crawler-depth <N>` | Katana crawl depth | `3` |
| `--crawler-max-urls <N>` | Cap on discovered URLs | `50` |
| `--crawler-timeout <N>` | Crawl timeout per target (seconds) | `60` |

### Nuclei
| Flag | Description |
| :--- | :--- |
| `--tags <TAGS>` | Comma-separated Nuclei tags (e.g. `cve,jira`) |
| `--nuclei-templates <DIR>` | Custom templates directory |

### Network & headers
| Flag | Description |
| :--- | :--- |
| `--proxy <URL>` | HTTP/SOCKS proxy |
| `-H`, `--header <HEADER>` | Custom header, repeatable |
| `--allow-insecure-tls` | Accept invalid TLS certs (dangerous) |
| `--scope` | Restrict crawl to same domain |
| `--scope-regex <REGEX>` | Restrict URLs by regex |

### Auth & OAST
| Flag | Description |
| :--- | :--- |
| `--auth-type` | `none` / `bearer` / `cookie` / `custom` |
| `--auth-token <TOKEN>` | Bearer token |
| `--auth-cookies <COOKIES>` | Raw cookie string |
| `--oast-server <URL>` | Interactsh server for blind detection |
| `--webhook-url <URL>` | HTTPS webhook for findings |

---

## Troubleshooting

### Nuclei permission denied on macOS / Linux

```bash
# macOS
sudo chown -R $(whoami) ~/Library/Application\ Support/nuclei/
sudo chown -R $(whoami) ~/Library/Application\ Support/uncover/

# Linux
sudo chown -R $(whoami) ~/.config/nuclei/
sudo chown -R $(whoami) ~/.config/uncover/
```

### Self-update permission denied

```bash
sudo arkenar --update
```

---

## Architecture & Docs

- [System Architecture (Data Flow & Golden Rules)](ARCHITECTURE.md)
- [Project Documentation (Component Breakdown)](ARKENAR_DOCUMENTATION.md)

## Contributing

### Running Tests

```bash
cargo test --workspace
```

Tests use Rust's built-in test harness with [`assert_cmd`](https://crates.io/crates/assert_cmd), [`predicates`](https://crates.io/crates/predicates), and [`tempfile`](https://crates.io/crates/tempfile) (all MIT/Apache-2.0). The CI runs the full suite on Linux, Windows, and macOS on every push and pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full test policy and contribution guidelines.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This tool is for educational and authorized testing purposes only. I'm not responsible for any misuse or damage. Always get proper authorization before scanning any target.
