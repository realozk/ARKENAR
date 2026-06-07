<div align="center"> <img src="/media/603C35E3-83BA-4984-BFCF-37E9B0F0A70E.jpg" width="100%" alt="Arkenar Banner"> </div>

**Arkenar is a web scanner I built that ties together Katana and Nuclei with a custom mutation engine. The goal is to find injection flaws and logic bugs that static templates tend to miss.**

Arkenar is a fast, terminal-native scanner (CLI). It scans live targets for injection flaws, leaked secrets/API keys, and exposed files — from the outside.

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

Arkenar auto-downloads Katana, Nuclei, and Subfinder on first use.

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

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This tool is for educational and authorized testing purposes only. I'm not responsible for any misuse or damage. Always get proper authorization before scanning any target.
