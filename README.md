<div align="center"> <img src="/media/603C35E3-83BA-4984-BFCF-37E9B0F0A70E.jpg" width="100%" alt="Arkenar Banner"> </div>

**Designed for pentesters and offensive security pros, Arkenar acts as a central orchestration layer. It combines Katana and Nuclei, while layering on its own custom mutation engine to catch complex logic flaws and injections that static templates might miss.**
​

## • Core Capabilities

• **Hybrid Engine**: Seamlessly chains external tools (Katana, Nuclei) with native scanning logic for full-spectrum reconnaissance.

• **Smart Payload Injection**: Uses a dynamic library of payloads for XSS, SQLi, and file exposure; actively mutates to bypass WAFs and filters.

• **Noise Reduction**: Built-in response filtering cuts false positives for actionable results only.

•**Deep Configuration**: Full control over threading, timeouts, and scan flags for specific rules.

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
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)

---

##  Preview

<div align="center"> <img src="/media/arkenatee-ezgif.com-crop.gif" width="90%" alt="Arkenar Banner"> </div>



##  Installation (Recommended)

###  Windows 
You can install **Arkenar** instantly using our automated PowerShell script. Copy and paste this command into your terminal:

```powershell
iwr -useb https://raw.githubusercontent.com/realozk/ARKENAR/main/install.ps1 | iex

```
### Linux & macOS
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
arkenar [https://example.com](https://example.com)

# Advanced scan with a list and custom rate limit
arkenar -l subdomains.txt -o output.json --rate-limit 150
```

Windows (PowerShell / CMD)

```bash 
# Basic single target scan
arkenar.exe [https://example.com](https://example.com)

# Advanced scan with a list and output file
arkenar.exe -l subdomains.txt -o results.json --rate-limit 150
```


### Options

| Flag | Description | Example |
| :--- | :--- | :--- |
| `-l`, `--list` | Path to a file containing a list of subdomains | `-l ~/Desktop/targets.txt` |
| `-o`, `--output` | Save the scan results to a JSON file | `-o result.json` |
| `-t`, `--threads` | Set the number of concurrent threads (Default: 50) | `-t 100` |
| `--rate-limit` | Set the maximum requests per second | `--rate-limit 200` |
| `--timeout` | Connection timeout in seconds | `--timeout 10` |
| `-v`, `--verbose` | Enable verbose mode for detailed logs | `-v` |
| `--update` | Update ARKENAR and external tools (Katana/Nuclei) | `--update` |

---

## Troubleshooting

### Nuclei permission denied on macOS / Linux

If you see errors like `permission denied` when Nuclei tries to write its config files, fix the ownership of its config directories:

```bash
sudo chown -R $(whoami) ~/Library/Application\ Support/nuclei/
sudo chown -R $(whoami) ~/Library/Application\ Support/uncover/
```

or for more advanced scan 



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

## Contributing
Contributions are welcome Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for details on how to get started.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer
This tool is for educational and authorized testing purposes only. The developer is not responsible for any misuse or damage caused by this tool. Always obtain proper authorization before scanning any target.

