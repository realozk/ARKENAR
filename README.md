<div align="center"> 
  <img src="/media/603C35E3-83BA-4984-BFCF-37E9B0F0A70E.jpg" width="100%" alt="Arkenar Banner"> 
</div>

<h3 align="center">Next-Generation Offensive Security Orchestration</h3>

<p align="center">
  <strong>Designed for pentesters and offensive security pros.</strong><br>
  Arkenar acts as a central orchestration layer, seamlessly combining Katana and Nuclei while layering its own custom mutation engine to catch complex logic flaws and injections that static templates might miss.
</p>

<p align="center">
  <a href="https://github.com/realozk/ARKENAR/blob/main/LICENSE">
    <img src="https://img.shields.io/github/v/release/realozk/ARKENAR?style=for-the-badge&color=22c55e&v=1" alt="Release">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-3b82f6?style=for-the-badge" alt="Platforms">
  <br>
  <a href="https://github.com/projectdiscovery/katana">
    <img src="https://img.shields.io/badge/Katana-ProjectDiscovery?style=for-the-badge&labelColor=1f6feb&color=0b1220&logo=github&logoColor=white" alt="Katana">
  </a>
  <a href="https://github.com/projectdiscovery/nuclei">
    <img src="https://img.shields.io/badge/Nuclei-ProjectDiscovery?style=for-the-badge&labelColor=dc2626&color=0b1220&logo=github&logoColor=white" alt="Nuclei">
  </a>
  <a href="https://crates.io/crates/arkenar">
    <img src="https://img.shields.io/crates/v/arkenar.svg?style=for-the-badge&color=e65100" alt="Crates.io">
  </a>
</p>

---

## Core Capabilities

- Hybrid Engine: Seamlessly chains external tools (Katana, Nuclei) with native scanning logic for full-spectrum reconnaissance.
- Smart Payload Injection: Uses a dynamic library of payloads for XSS, SQLi, and file exposure; actively mutates to bypass WAFs and filters.
- Noise Reduction: Built-in response filtering cuts false positives for actionable results only.
- Deep Configuration: Full control over threading, timeouts, and scan flags for specific rules.
- Broad Coverage: Targets OWASP Top 10 and infrastructure misconfigurations.

## Arkenar Studio (Desktop GUI)

Arkenar Studio provides a powerful, specialized HTTP environment built to accelerate manual verification and advanced testing workflows.

<div align="center"> 
  <img src="/media/demo.gif" width="90%" alt="Arkenar Studio GUI Demonstration"> 
  <br>
  <em>Arkenar Studio Interface</em>
</div>

### Studio Highlights

- Smart Auto-Login: CSRF-aware session capture. Performs GET-parse-POST handshakes to auto-inject authenticated cookies into scans.
- PoC Exporter: Generate ready-to-share exploit Proof of Concepts in cURL, Python Requests, or Raw HTTP formats.
- Advanced Traffic Inspector: Craft custom requests, inspect headers, beautify JSON responses, and compare payload diffs side-by-side.
- Utility Toolkit: Integrated Base64, URL encoding/decoding, and Hex converters for rapid data manipulation.

---

## Installation (Recommended)

### Desktop App (GUI)

Download the installer from GitHub Releases. The application automatically downloads Katana and Nuclei dependencies on the first launch.

| Platform | File | Instructions |
|----------|------|--------------|
| Windows | Arkenar_*_x64-setup.exe | Double-click to install. |
| Linux | Arkenar_*_amd64.AppImage | Grant execution permissions and run. |
| macOS | Arkenar_*_universal.dmg | Supports both Intel and Apple Silicon. |

### Command Line Interface (CLI)

Windows (PowerShell):
```powershell
iwr -useb [https://raw.githubusercontent.com/realozk/ARKENAR/main/install.ps1](https://raw.githubusercontent.com/realozk/ARKENAR/main/install.ps1) | iex
```
Linux and macOS (Bash):

```bash
curl -sL [https://raw.githubusercontent.com/realozk/ARKENAR/main/install.sh](https://raw.githubusercontent.com/realozk/ARKENAR/main/install.sh) | bash
```

CLI Usage
Scan a single target or a list of subdomains with customizable parameters.

Basic Scan:
```bash 
arkenar [https://example.com](https://example.com)
```
Advanced Scan (List, Output, and Rate Limit):
```bash
arkenar -l subdomains.txt -o results.json --rate-limit 150
```

### Options

| Flag | Description | Example |
| :--- | :--- | :--- |
| `-l, --list` | Path to file containing target subdomains | `-l targets.txt` |
| `-o, --output` | Save results to a JSON file | `-o result.json` |
| `-t, --threads` | Number of concurrent threads (Default: 50) | `-t 100` |
| `--rate-limit` | Maximum requests per second | `--rate-limit 200` |
| `--timeout` | Connection timeout in seconds | `--timeout 10` |
| `-v, --verbose` | Enable detailed logging | `-v` |
| `--update` | Update Arkenar and external tools | `--update` |


Troubleshooting
Nuclei Permission Denied (macOS / Linux)
Fix ownership of configuration directories if the tools cannot write local data:

macOS:
```bash
sudo chown -R $(whoami) ~/Library/Application\ Support/nuclei/
sudo chown -R $(whoami) ~/Library/Application\ Support/uncover/
```
Linux:
```bash
sudo chown -R $(whoami) ~/.config/nuclei/
sudo chown -R $(whoami) ~/.config/uncover/
```

Self-Update Permission Denied
If the update command fails, re-run with elevated privileges:

```bash
sudo arkenar --update
```
Contributing
Please refer to CONTRIBUTING.md for guidelines on submitting issues or pull requests.

License
This project is licensed under the MIT License. See the LICENSE file for details.

Disclaimer
This tool is for educational and authorized testing purposes only. The developer is not responsible for any misuse or damage caused by this tool. Always obtain explicit authorization before scanning any target.
