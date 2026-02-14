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
<h4 align="center">A blazing fast, modern vulnerability scanner written in <a href="https://www.rust-lang.org" target="_blank">Rust</a>. </h4>

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
</p>

  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#features">Features</a> •
  <a href="#disclaimer">Disclaimer</a>
</p>

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
