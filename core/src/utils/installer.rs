use colored::*;
use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::{self, Cursor, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tar::Archive;
use tokio::process::Command;

fn get_arkenar_asset_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "arkenar-windows-amd64.zip"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "arkenar-macos-arm64.tar.gz"
    } else if cfg!(target_os = "macos") {
        "arkenar-macos-amd64.tar.gz"
    } else if cfg!(target_arch = "aarch64") {
        "arkenar-linux-arm64.tar.gz"
    } else {
        "arkenar-linux-amd64.tar.gz"
    }
}

fn get_arkenar_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "arkenar.exe"
    } else {
        "arkenar"
    }
}

fn get_tool_binary_name(tool: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{}.exe", tool)
    } else {
        tool.to_string()
    }
}

const KATANA_VERSION: &str = "1.1.0";
const NUCLEI_VERSION: &str = "3.3.5";

// SHA256 hashes for pinned tool releases — populate from official release pages before shipping.
// None entries cause the installer to refuse that download.
//   Katana v1.1.0: https://github.com/projectdiscovery/katana/releases/tag/v1.1.0
//   Nuclei v3.3.5:  https://github.com/projectdiscovery/nuclei/releases/tag/v3.3.5
struct ExpectedHashes {
    katana_linux_amd64: Option<&'static str>,
    katana_macos_amd64: Option<&'static str>,
    katana_macos_arm64: Option<&'static str>,
    katana_windows_amd64: Option<&'static str>,
    nuclei_linux_amd64: Option<&'static str>,
    nuclei_macos_amd64: Option<&'static str>,
    nuclei_macos_arm64: Option<&'static str>,
    nuclei_windows_amd64: Option<&'static str>,
}

const EXPECTED_HASHES: ExpectedHashes = ExpectedHashes {
    katana_linux_amd64: None,
    katana_macos_amd64: None,
    katana_macos_arm64: None,
    katana_windows_amd64: None,
    nuclei_linux_amd64: None,
    nuclei_macos_amd64: None,
    nuclei_macos_arm64: None,
    nuclei_windows_amd64: None,
};

fn expected_hash_for(tool: &str) -> Option<&'static str> {
    match tool {
        "katana" => {
            if cfg!(target_os = "windows") {
                EXPECTED_HASHES.katana_windows_amd64
            } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
                EXPECTED_HASHES.katana_macos_arm64
            } else if cfg!(target_os = "macos") {
                EXPECTED_HASHES.katana_macos_amd64
            } else {
                EXPECTED_HASHES.katana_linux_amd64
            }
        }
        "nuclei" => {
            if cfg!(target_os = "windows") {
                EXPECTED_HASHES.nuclei_windows_amd64
            } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
                EXPECTED_HASHES.nuclei_macos_arm64
            } else if cfg!(target_os = "macos") {
                EXPECTED_HASHES.nuclei_macos_amd64
            } else {
                EXPECTED_HASHES.nuclei_linux_amd64
            }
        }
        _ => None,
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

fn get_tool_download_url(tool: &str) -> String {
    match tool {
        "katana" => {
            let v = KATANA_VERSION;
            if cfg!(target_os = "windows") {
                format!("https://github.com/projectdiscovery/katana/releases/download/v{}/katana_{}_windows_amd64.zip", v, v)
            } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
                format!("https://github.com/projectdiscovery/katana/releases/download/v{}/katana_{}_macOS_arm64.zip", v, v)
            } else if cfg!(target_os = "macos") {
                format!("https://github.com/projectdiscovery/katana/releases/download/v{}/katana_{}_macOS_amd64.zip", v, v)
            } else {
                format!("https://github.com/projectdiscovery/katana/releases/download/v{}/katana_{}_linux_amd64.zip", v, v)
            }
        }
        "nuclei" => {
            let v = NUCLEI_VERSION;
            if cfg!(target_os = "windows") {
                format!("https://github.com/projectdiscovery/nuclei/releases/download/v{}/nuclei_{}_windows_amd64.zip", v, v)
            } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
                format!("https://github.com/projectdiscovery/nuclei/releases/download/v{}/nuclei_{}_macOS_arm64.zip", v, v)
            } else if cfg!(target_os = "macos") {
                format!("https://github.com/projectdiscovery/nuclei/releases/download/v{}/nuclei_{}_macOS_amd64.zip", v, v)
            } else {
                format!("https://github.com/projectdiscovery/nuclei/releases/download/v{}/nuclei_{}_linux_amd64.zip", v, v)
            }
        }
        _ => {
            eprintln!("[!] Installer: unknown tool '{}' requested", tool);
            String::new()
        }
    }
}

fn get_arkenar_home() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let home = env::var("USERPROFILE").ok()?;
    #[cfg(not(target_os = "windows"))]
    let home = env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".arkenar"))
}

pub fn get_plugin_dir() -> Option<PathBuf> {
    Some(get_arkenar_home()?.join("plugins").join("nuclei"))
}

/// Returns the default nuclei templates directory path.
pub fn default_nuclei_templates_dir() -> String {
    dirs::home_dir()
        .map(|h| {
            h.join(".arkenar")
                .join("plugins")
                .join("nuclei")
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_default()
}

/// Ensures ~/.arkenar/plugins/{nuclei,payloads,scripts} directories exist.
pub async fn ensure_plugin_dirs() -> anyhow::Result<()> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?;
    let base = home.join(".arkenar").join("plugins");
    for sub in &["nuclei", "payloads", "scripts"] {
        tokio::fs::create_dir_all(base.join(sub)).await?;
    }
    Ok(())
}

pub async fn check_and_install_tools() {
    ensure_plugin_dirs().await.ok();

    print!("{}\r\n", "[*] Checking dependencies...".bright_cyan());
    let tools_dir = Path::new("./tools");

    if !tools_dir.exists() {
        if let Err(e) = fs::create_dir_all(tools_dir) {
            eprint!(
                "{}\r\n",
                format!("[!] Failed to create tools directory: {}", e).red()
            );
            return;
        }
    }

    if let Some(plugin_dir) = get_plugin_dir() {
        if !plugin_dir.exists() {
            match fs::create_dir_all(&plugin_dir) {
                Ok(_) => print!(
                    "{}",
                    format!(" Created plugin dir: {}\n", plugin_dir.display()).green()
                ),
                Err(e) => eprint!(
                    "{}",
                    format!("! Could not create plugin dir: {}\n", e).yellow()
                ),
            }
        }
    }

    let katana_bin = get_tool_binary_name("katana");
    let nuclei_bin = get_tool_binary_name("nuclei");

    if !tools_dir.join(&katana_bin).exists() {
        print!("{}\r\n", "[*] Katana not found. Downloading...".yellow());
        download_and_extract(
            &get_tool_download_url("katana"),
            tools_dir,
            expected_hash_for("katana"),
        )
        .await;
    } else {
        print!("{}", "[+] Katana found.\r\n".green());
    }

    if !tools_dir.join(&nuclei_bin).exists() {
        print!("{}", "[*] Nuclei not found. Downloading...\r\n".yellow());
        download_and_extract(
            &get_tool_download_url("nuclei"),
            tools_dir,
            expected_hash_for("nuclei"),
        )
        .await;
    } else {
        print!("{}\r\n", "[+] Nuclei found.".green());
    }

    print!("{}\r\n", "[+] All dependencies ready.".green().bold());
}

pub async fn run_full_update() {
    print!(
        "{}\r\n",
        "         ARKENAR Full Update".bright_cyan().bold()
    );
    update_nuclei().await;
    update_nuclei_templates().await;
    update_katana().await;
    self_update().await;
    print!(
        "\r\n{}\r\n",
        "[+] All updates completed successfully!".green().bold()
    );
}

async fn update_nuclei() {
    print!("\r\n{}\r\n", "[*] Updating Nuclei...".bright_cyan());
    let nuclei_bin = get_tool_binary_name("nuclei");
    let nuclei_path = Path::new("./tools").join(&nuclei_bin);
    if !nuclei_path.exists() {
        print!("{}\r\n", "[!] Nuclei not found, skipping update.".yellow());
        return;
    }
    let mut std_cmd = std::process::Command::new(&nuclei_path);
    std_cmd
        .arg("-update")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000);
    }
    match Command::from(std_cmd).status().await {
        Ok(s) if s.success() => print!("{}\r\n", "[+] Nuclei updated.".green()),
        Ok(s) => print!(
            "{}\r\n",
            format!("[!] Nuclei update exited with: {}", s).yellow()
        ),
        Err(e) => print!(
            "{}\r\n",
            format!("[!] Failed to run Nuclei update: {}", e).red()
        ),
    }
}

async fn update_nuclei_templates() {
    print!(
        "\r\n{}\r\n",
        "[*] Updating Nuclei Templates...".bright_cyan()
    );
    let nuclei_bin = get_tool_binary_name("nuclei");
    let nuclei_path = Path::new("./tools").join(&nuclei_bin);
    if !nuclei_path.exists() {
        print!(
            "{}\r\n",
            "[!] Nuclei not found, skipping template update.".yellow()
        );
        return;
    }
    let mut std_cmd = std::process::Command::new(&nuclei_path);
    std_cmd
        .arg("-ut")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000);
    }
    match Command::from(std_cmd).status().await {
        Ok(s) if s.success() => print!("{}\r\n", "[+] Nuclei templates updated.".green()),
        Ok(s) => print!(
            "{}\r\n",
            format!("[!] Template update exited with: {}", s).yellow()
        ),
        Err(e) => print!(
            "{}\r\n",
            format!("[!] Failed to update templates: {}", e).red()
        ),
    }
}

async fn update_katana() {
    print!("\r\n{}\r\n", "[*] Updating Katana...".bright_cyan());
    let katana_bin = get_tool_binary_name("katana");
    let katana_path = Path::new("./tools").join(&katana_bin);
    if !katana_path.exists() {
        print!("{}\r\n", "[!] Katana not found, skipping update.".yellow());
        return;
    }
    let mut std_cmd = std::process::Command::new(&katana_path);
    std_cmd
        .arg("-update")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000);
    }
    match Command::from(std_cmd).status().await {
        Ok(s) if s.success() => print!("{}\r\n", "[+] Katana updated.".green()),
        Ok(s) => print!(
            "{}\r\n",
            format!("[!] Katana update exited with: {}", s).yellow()
        ),
        Err(e) => print!(
            "{}\r\n",
            format!("[!] Failed to update Katana: {}", e).red()
        ),
    }
}

async fn self_update() {
    // Self-update has no signature verification — warn loudly.
    log::warn!("Self-update performs NO signature verification yet. Consider an out-of-band verification channel.");
    print!(
        "{}\r\n",
        "[!] WARNING: self-update is unsigned. Verify manually if possible."
            .yellow()
            .bold()
    );

    print!(
        "\r\n{}\r\n",
        "[*] Checking for ARKENAR self-update...".bright_cyan()
    );
    let asset_name = get_arkenar_asset_name();
    let binary_name = get_arkenar_binary_name();
    let download_url = format!(
        "https://github.com/RealOzk/ARKENAR/releases/latest/download/{}",
        asset_name
    );
    let current_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            print!(
                "{}\r\n",
                format!("[!] Cannot determine current exe path: {}", e).red()
            );
            return;
        }
    };
    print!(
        "{}\r\n",
        format!("[*] Downloading {} ...", download_url).dimmed()
    );

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            print!(
                "{}\r\n",
                format!("[!] Failed to build HTTP client: {}", e).red()
            );
            return;
        }
    };

    let response = match client.get(&download_url).send().await {
        Ok(r) => r,
        Err(e) => {
            print!("{}\r\n", format!("[!] Download failed: {}", e).red());
            return;
        }
    };
    if !response.status().is_success() {
        print!(
            "{}\r\n",
            format!("[!] Server returned status: {}", response.status()).red()
        );
        return;
    }

    const MAX_DOWNLOAD: usize = 200 * 1024 * 1024;
    let bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            print!(
                "{}\r\n",
                format!("[!] Failed to read response: {}", e).red()
            );
            return;
        }
    };
    if bytes.len() > MAX_DOWNLOAD {
        eprint!(
            "{}\r\n",
            format!(
                "[!] Refusing to install: download exceeds {} bytes",
                MAX_DOWNLOAD
            )
            .red()
        );
        return;
    }

    print!("{}\r\n", "[*] Extracting binary from archive...".blue());
    let extracted = if asset_name.ends_with(".tar.gz") {
        extract_binary_from_tar_gz(&bytes, binary_name)
    } else {
        extract_binary_from_zip(&bytes, binary_name)
    };
    let binary_bytes = match extracted {
        Ok(b) => b,
        Err(e) => {
            print!(
                "{}\r\n",
                format!("[!] Failed to extract binary: {}", e).red()
            );
            return;
        }
    };
    let tmp_path = current_exe.with_extension("tmp");
    let backup_path = current_exe.with_extension("bak");
    if let Err(e) = fs::write(&tmp_path, &binary_bytes) {
        print!(
            "{}\r\n",
            format!("[!] Failed to write temp binary: {}", e).red()
        );
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        if let Err(e) = fs::set_permissions(&tmp_path, perms) {
            print!(
                "{}\r\n",
                format!("[!] Failed to set permissions: {}", e).red()
            );
            let _ = fs::remove_file(&tmp_path);
            return;
        }
    }
    if backup_path.exists() {
        let _ = fs::remove_file(&backup_path);
    }
    if let Err(e) = fs::rename(&current_exe, &backup_path) {
        if e.kind() == io::ErrorKind::PermissionDenied {
            print!(
                "{}\r\n",
                "[!] Permission denied. Try re-running with: sudo arkenar --update"
                    .red()
                    .bold()
            );
        } else {
            print!(
                "{}\r\n",
                format!("[!] Failed to rename current binary: {}", e).red()
            );
        }
        let _ = fs::remove_file(&tmp_path);
        return;
    }
    if let Err(e) = fs::rename(&tmp_path, &current_exe) {
        if e.kind() == io::ErrorKind::PermissionDenied {
            print!(
                "{}\r\n",
                "[!] Permission denied. Try re-running with: sudo arkenar --update"
                    .red()
                    .bold()
            );
        } else {
            print!(
                "{}\r\n",
                format!("[!] Failed to install new binary: {}", e).red()
            );
        }
        match fs::rename(&backup_path, &current_exe) {
            Ok(_) => {
                print!(
                    "{}\r\n",
                    "[+] Rolled back to previous ARKENAR binary.".yellow()
                );
            }
            Err(rb) => {
                print!(
                    "{}\r\n",
                    format!(
                        "[!] CRITICAL: rollback failed ({}). Backup is at: {}. Restore manually before running ARKENAR again.",
                        rb,
                        backup_path.display()
                    )
                    .red()
                    .bold()
                );
            }
        }
        let _ = fs::remove_file(&tmp_path);
        return;
    }
    let _ = fs::remove_file(&backup_path);
    print!(
        "{}\r\n",
        "[+] ARKENAR binary updated successfully!".green().bold()
    );
}

fn extract_binary_from_tar_gz(data: &[u8], binary_name: &str) -> io::Result<Vec<u8>> {
    let decoder = GzDecoder::new(Cursor::new(data));
    let mut archive = Archive::new(decoder);
    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.to_path_buf();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy();
        if file_name == binary_name {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            return Ok(buf);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!("binary '{}' not found in archive", binary_name),
    ))
}

fn extract_binary_from_zip(data: &[u8], binary_name: &str) -> io::Result<Vec<u8>> {
    let cursor = Cursor::new(data);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let name = PathBuf::from(file.name().to_string());
        let file_name = name.file_name().unwrap_or_default().to_string_lossy();
        if file_name == binary_name {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)?;
            return Ok(buf);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!("binary '{}' not found in archive", binary_name),
    ))
}

async fn download_and_extract(url: &str, target_dir: &Path, expected_sha256: Option<&str>) {
    let expected = match expected_sha256 {
        Some(h) => h,
        None => {
            eprint!("{}\r\n", format!(
                "[!] REFUSING TO INSTALL: no expected SHA256 hash configured for this release.\n    \
                 Edit core/src/utils/installer.rs EXPECTED_HASHES and rebuild.\n    \
                 URL: {}",
                url
            ).red().bold());
            return;
        }
    };

    // Build a bounded client with explicit timeouts
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            eprint!(
                "{}\r\n",
                format!("[!] Failed to build HTTP client: {}", e).red()
            );
            return;
        }
    };

    let response = match client.get(url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprint!(
                "{}\r\n",
                format!("[!] Download failed for {}: {}", url, e).red()
            );
            return;
        }
    };
    if !response.status().is_success() {
        eprint!(
            "{}\r\n",
            format!("[!] Download server returned: {}", response.status()).red()
        );
        return;
    }

    const MAX_DOWNLOAD: usize = 200 * 1024 * 1024; // 200 MB
    let bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            eprint!(
                "{}\r\n",
                format!("[!] Failed to read download response: {}", e).red()
            );
            return;
        }
    };
    if bytes.len() > MAX_DOWNLOAD {
        eprint!(
            "{}\r\n",
            format!(
                "[!] Refusing to install: download exceeds {} bytes",
                MAX_DOWNLOAD
            )
            .red()
        );
        return;
    }

    // Verify SHA256 before touching the filesystem
    let actual = sha256_hex(&bytes);
    if !actual.eq_ignore_ascii_case(expected) {
        eprint!(
            "{}\r\n",
            format!(
                "[!] INTEGRITY CHECK FAILED for {}:\n    expected: {}\n    got:      {}\n    \
             Refusing to install. This could indicate a compromised download or MITM attack.",
                url, expected, actual
            )
            .red()
            .bold()
        );
        return;
    }
    print!("{}\r\n", "[+] SHA256 verified.".green());

    print!("{}\r\n", "[*] Extracting...".blue());
    let cursor = Cursor::new(bytes);
    let mut archive = match zip::ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            eprint!(
                "{}\r\n",
                format!("[!] Failed to open zip archive: {}", e).red()
            );
            return;
        }
    };
    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };
        let name = file.name().to_string();
        let dominated_by_exe = name.ends_with(".exe");
        let is_tool_binary = if cfg!(target_os = "windows") {
            dominated_by_exe
        } else {
            let p = std::path::Path::new(&name);
            p.extension().is_none() && !name.ends_with('/')
        };
        if is_tool_binary {
            match fs::File::create(&outpath) {
                Ok(mut outfile) => {
                    if let Err(e) = io::copy(&mut file, &mut outfile) {
                        eprint!("{}\r\n", format!("[!] Failed to write binary: {}", e).red());
                        return;
                    }
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let perms = std::fs::Permissions::from_mode(0o755);
                        let _ = fs::set_permissions(&outpath, perms);
                    }
                }
                Err(e) => {
                    eprint!(
                        "{}\r\n",
                        format!("[!] Failed to create output file: {}", e).red()
                    );
                    return;
                }
            }
        }
    }
    print!("{}\r\n", "[+] Installed successfully.".green());
}
