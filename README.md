<div align="center"> <img src="/media/603C35E3-83BA-4984-BFCF-37E9B0F0A70E.jpg" width="100%" alt="Arkenar Banner"> </div>

**Arkenar is a high-performance Offensive Web Scanner (DAST), built in pure Rust.** Engineered for aggressive external perimeter mapping, active WAF evasion, and a verify-before-report discipline.

Its flagship is the **Rapid Extraction Module** — a specialized engine that *hunts, verifies, and extracts* exposed AI keys and critical configuration files (`.env`, `.git`, source maps, backups) from live targets. Each finding carries an **earned** verification tier — `reachable` (live, non-decoy, content-sane) or, with [`--verify-live`](#live-key-verification---verify-live), `live` (proven against the provider). **One static binary. No external tools.**


<p align="center">

  <a href="https://github.com/realozk/ARKENAR/blob/main/LICENSE">
    <img src="https://img.shields.io/github/v/release/realozk/ARKENAR?style=for-the-badge&color=22c55e&v=1">
  </a>

  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-3b82f6?style=for-the-badge">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/built%20with-Rust-orange?style=for-the-badge&logo=rust&logoColor=white">
  <a href="https://crates.io/crates/arkenar">
    <img src="https://img.shields.io/crates/v/arkenar.svg?style=for-the-badge&color=e65100">
  </a>
</p>

## Table of Contents

- [Preview](#preview)
- [Installation](#installation)
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

Arkenar is a terminal-native scanner. One command installs it.

### Linux & macOS
```bash
curl -sL https://raw.githubusercontent.com/realozk/ARKENAR/main/install.sh | bash
```

### Windows
```powershell
iwr -useb https://raw.githubusercontent.com/realozk/ARKENAR/main/install.ps1 | iex
```

Arkenar is a single static Rust binary — no external tools, no Go subprocesses, nothing to download on first use.

> **Legacy desktop app:** the 1.2 GUI is still available on
> [GitHub Releases](https://github.com/realozk/ARKENAR/releases) but is no longer
> actively developed — development is CLI-first from 1.3 onward.

---

## CLI Usage

```bash
# scan a single target
arkenar https://example.com

# scan a list with a custom rate limit
arkenar -l targets.txt -o results.json --rate-limit 150

# full example
arkenar https://example.com -m advanced -t 100 --enable-js-analysis --proxy http://127.0.0.1:8080

# recon: subdomains + ports + DNS
arkenar example.com --recon
```

Run `arkenar --help` for everything. Common flags:

### Targeting & output
| Flag | Description | Default |
| :--- | :--- | :--- |
| `-l`, `--list <FILE>` | File of target URLs (one per line) | — |
| `-o`, `--output <FILE>` | JSON output path | `scan_results.json` |
| `--json` | Stream findings as JSON to stdout (for `\| jq`) | — |
| `--quiet` | Findings only, no progress/log chrome | — |
| `--verified-only` | Show only proven (verified) findings | — |
| `-p`, `--payloads <FILE>` | Extra payload file to merge in | — |
| `--dry-run` | Print targets without sending requests | — |
| `--resume` | Resume from `.arkenar-state.json` | — |
| `--update` | Update Arkenar to the latest version | — |

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
| `--no-crawler` | Skip the native crawl / forced-browse phase |
| `--enable-param-fuzz` | Enable parameter fuzzing |
| `--enable-js-analysis` | Enable JS endpoint analysis |
| `--enable-waf-evasion` | Mutate payloads on 403 responses |
| `--verify-live` | Prove found keys against their provider (opt-in — **read the warning below**) |
| `--no-fingerprint` | Disable tech-stack fingerprinting |
| `--no-smart-payloads` | Disable context-aware payload selection |

#### Live key verification (`--verify-live`)

Turns *"a string shaped like a key"* into *"a **working** key."* For each detected key
with a supported provider (OpenAI, Anthropic, Stripe, GitHub), Arkenar makes **one
non-mutating** read call to that provider's own auth endpoint: a `200` marks the finding
**VERIFIED-LIVE**, a `401` drops it as dead, anything else leaves it as "potential." Keys
are deduped — one probe per unique key — and a key is only ever sent to its own provider.

> ⚠️ **Legal / scope warning.** Verifying a found key **authenticates to a third party**.
> Many bug-bounty programs forbid using found credentials even read-only, and doing so may
> be illegal without authorization. This is why it is **opt-in and off by default**. Check
> your program's rules and the law before using `--verify-live`.
>
> *(AWS is intentionally not verified: a leaked `AKIA…` is only the access-key ID, and
> proving it live would require the paired secret key we never have — so we don't claim to.)*

### Crawler (native, pure Rust)
| Flag | Description | Default |
| :--- | :--- | :--- |
| `--crawler-depth <N>` | Crawl depth | `3` |
| `--crawler-max-urls <N>` | Cap on discovered URLs | `50` |
| `--crawler-timeout <N>` | Crawl timeout per target (seconds) | `60` |

### Network & headers
| Flag | Description |
| :--- | :--- |
| `--proxy <URL>` | HTTP/SOCKS proxy |
| `-H`, `--header <HEADER>` | Custom header, repeatable |
| `--allow-insecure-tls` | Accept invalid TLS certs (dangerous) |
| `--scope` | Restrict crawl to same domain |
| `--scope-regex <REGEX>` | Restrict URLs by regex |

### Auth
| Flag | Description |
| :--- | :--- |
| `--auth-type` | `none` / `bearer` / `cookie` / `custom` |
| `--auth-token <TOKEN>` | Bearer token |
| `--auth-cookies <COOKIES>` | Raw cookie string |
| `--webhook-url <URL>` | HTTPS webhook for findings |

---

## Troubleshooting

### Self-update permission denied

```bash
sudo arkenar --update
```

---

## Architecture & Docs

- [System Architecture (Data Flow & Golden Rules)](ARCHITECTURE.md)
- [Project Documentation (Component Breakdown)](ARKENAR_DOCUMENTATION.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This tool is for educational and authorized testing purposes only. I'm not responsible for any misuse or damage. Always get proper authorization before scanning any target.
