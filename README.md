<div align="center"> <img src="/media/603C35E3-83BA-4984-BFCF-37E9B0F0A70E.jpg" width="100%" alt="Arkenar Banner"> </div>

**Designed for pentesters and offensive security pros, Arkenar acts as a central orchestration layer. It combines Katana and Nuclei, while layering on its own custom mutation engine to catch complex logic flaws and injections that static templates might miss.**
​

## • Core Capabilities

• **Hybrid Engine**: Seamlessly chains external tools (Katana, Nuclei, Subfinder) with native scanning logic for full-spectrum reconnaissance.

• **Smart Payload Injection**: Uses a dynamic library of payloads for XSS, SQLi, and file exposure; actively mutates to bypass WAFs and filters.

• **Reconnaissance Suite**: Fast asynchronous TCP port scanning, active DNS/WHOIS resolution, subdomain footprinting, and JS secrets pattern matching.

• **Noise Reduction**: Built-in response filtering cuts false positives for actionable results only.

• **Deep Configuration**: Full control over threading, timeouts, and scan flags for specific rules.

• **Broad Coverage**: Targets OWASP Top 10 and infrastructure misconfigurations.
​

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

## Table of Contents

- [Preview](#preview)
- [Installation](#installation-recommended)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Architecture & Docs](#architecture--docs)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)

---

##  Preview

<div align="center"> <img src="/media/demo.gif" width="90%" alt="Arkenar Banner"> </div>



##  Installation (Recommended)

### GUI Desktop App

Download the installer directly from [GitHub Releases](https://github.com/realozk/ARKENAR/releases/latest):

| Platform | File |
|----------|------|
| **Windows** | `Arkenar_*_x64-setup.exe` — double-click, no admin required |
| **Linux** | `arkenar_*_amd64.AppImage` (portable) or `arkenar_*_amd64.deb` |
| **macOS** | `Arkenar_*_universal.dmg` — works on both Intel and Apple Silicon |

The app auto-downloads Katana and Nuclei on first launch.

---

###  Windows (CLI)
You can install **Arkenar** instantly using our automated PowerShell script. Copy and paste this command into your terminal:

```powershell
iwr -useb https://raw.githubusercontent.com/realozk/ARKENAR/main/install.ps1 | iex

```
### Linux & macOS (CLI)
Run the following command to download and install automatically:

```bash
curl -sL https://raw.githubusercontent.com/realozk/ARKENAR/main/install.sh | bash
```

---

## Usage

Running ARKENAR is simple. You can scan a single target or use a list of subdomains.

macOS & Linux

```bash
# Basic single target scan
arkenar https://example.com

# Advanced scan with a list and custom rate limit
arkenar -l subdomains.txt -o output.json --rate-limit 150
```

Windows (PowerShell / CMD)

```bash 
# Basic single target scan
arkenar.exe https://example.com

# Advanced scan with a list and output file
arkenar.exe -l subdomains.txt -o results.json --rate-limit 150
```


### Options

Run `arkenar --help` for the authoritative list. The most common flags:

#### Targeting & I/O
| Flag | Description | Example |
| :--- | :--- | :--- |
| `-l`, `--list` | File containing target URLs (one per line) | `-l targets.txt` |
| `-o`, `--output` | JSON output path (default: `scan_results.json`) | `-o result.json` |
| `-p`, `--payloads` | Extra payload list to merge into the loader | `-p extra.txt` |
| `--dry-run` | Print what would be scanned, send no real requests | `--dry-run` |
| `--resume` | Resume an interrupted scan from `.arkenar-state.json` | `--resume` |
| `--update` | Self-update ARKENAR + Katana + Nuclei | `--update` |

#### Scan profile
| Flag | Description | Example |
| :--- | :--- | :--- |
| `-m`, `--mode` | `simple` (fast) or `advanced` (comprehensive) | `-m advanced` |
| `-t`, `--threads` | Concurrent worker count (default 50) | `-t 100` |
| `--rate-limit` | Max requests per second (default 100) | `--rate-limit 200` |
| `--timeout` | Per-request timeout in seconds (default 5) | `--timeout 10` |
| `-v`, `--verbose` | Detailed logs | `-v` |

#### Network & headers
| Flag | Description | Example |
| :--- | :--- | :--- |
| `--proxy` | HTTP/SOCKS proxy URL | `--proxy http://127.0.0.1:8080` |
| `-H`, `--header` | Custom header (repeatable) | `-H "Cookie: a=b"` |
| `--allow-insecure-tls` | Accept invalid TLS certs (DANGEROUS — MITM-able) | `--allow-insecure-tls` |
| `--scope` | Limit crawler to same domain | `--scope` |
| `--scope-regex` | Regex restricting which URLs are scanned | `--scope-regex '^https://example\.com'` |

#### Modules (parity with the GUI)
| Flag | Description | Example |
| :--- | :--- | :--- |
| `--no-crawler` | Skip the Katana crawl phase | `--no-crawler` |
| `--no-nuclei` | Skip the Nuclei scan phase | `--no-nuclei` |
| `--enable-param-fuzz` | Add experimental parameter fuzzing | `--enable-param-fuzz` |
| `--enable-js-analysis` | Static analysis of JS endpoints | `--enable-js-analysis` |
| `--enable-waf-evasion` | Mutate payloads on 403 responses | `--enable-waf-evasion` |
| `--no-fingerprint` | Disable tech-stack fingerprinting | `--no-fingerprint` |
| `--no-smart-payloads` | Disable context-aware payload selection | `--no-smart-payloads` |
| `--tags` | Custom Nuclei tags (overrides simple-mode logic) | `--tags cve,jira` |
| `--nuclei-templates` | Custom Nuclei templates directory | `--nuclei-templates ./tpl` |
| `--crawler-depth` | Katana crawl depth (default 3) | `--crawler-depth 5` |
| `--crawler-max-urls` | Cap on URLs Katana discovers (default 50) | `--crawler-max-urls 200` |
| `--crawler-timeout` | Per-target nuclei/crawl timeout in seconds | `--crawler-timeout 90` |

#### Auth, OAST & alerts
| Flag | Description | Example |
| :--- | :--- | :--- |
| `--auth-type` | `none` / `bearer` / `cookie` / `custom` | `--auth-type bearer` |
| `--auth-token` | Bearer token (paired with `--auth-type bearer`) | `--auth-token eyJ...` |
| `--auth-cookies` | Raw cookie string (paired with `--auth-type cookie`) | `--auth-cookies "sess=abc"` |
| `--oast-server` | Interactsh OAST server | `--oast-server https://oast.pro` |
| `--webhook-url` | HTTPS webhook for findings (private/loopback IPs blocked) | `--webhook-url https://hooks…` |

---

## Troubleshooting

### Nuclei permission denied on macOS / Linux

If you see errors like `permission denied` when Nuclei tries to write its config files, fix the ownership of its config directories:

```bash
sudo chown -R $(whoami) ~/Library/Application\ Support/nuclei/
sudo chown -R $(whoami) ~/Library/Application\ Support/uncover/
```

On Linux, the paths are typically:

```bash
sudo chown -R $(whoami) ~/.config/nuclei/
sudo chown -R $(whoami) ~/.config/uncover/
```

### Self-update permission denied

If `arkenar --update` fails with `Permission denied`, the binary is in a protected directory. Re-run with:

```bash
sudo arkenar --update
```

## Architecture & Docs
For developers and contributors looking to understand the inner workings of Arkenar's core modules:
- [System Architecture (Data Flow & Golden Rules)](ARCHITECTURE.md)
- [Project Documentation (Component Breakdown)](ARKENAR_DOCUMENTATION.md)

## Contributing
Contributions are welcome Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for details on how to get started.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer
This tool is for educational and authorized testing purposes only. The developer is not responsible for any misuse or damage caused by this tool. Always obtain proper authorization before scanning any target.
