use std::fs;
use std::io::{self, Cursor, Read};
use std::path::{Path, PathBuf};
use colored::*;
use tokio::process::Command;
use std::process::Stdio;
use flate2::read::GzDecoder;
use tar::Archive;

/// Returns the correct ARKENAR release asset name for the current OS/arch.
fn get_arkenar_asset_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "arkenar-windows-amd64.zip"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "arkenar-macos-arm64.tar.gz"
    } else if cfg!(target_os = "macos") {
        "arkenar-macos-amd64.tar.gz"
    } else {
        "arkenar-linux-amd64.tar.gz"
    }
}

/// Returns the expected binary name inside the archive.
fn get_arkenar_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "arkenar.exe"
    } else {
        "arkenar"
    }
}

/// Returns the platform-specific binary filename for a tool (e.g. `katana` → `katana.exe` on Windows).
fn get_tool_binary_name(tool: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{}.exe", tool)
    } else {
        tool.to_string()
    }
}

/// Returns the download URL for a given tool on the current platform.
fn get_tool_download_url(tool: &str) -> &'static str {
    match tool {
        "katana" => {
            if cfg!(target_os = "windows") {
                "https://github.com/projectdiscovery/katana/releases/download/v1.1.0/katana_1.1.0_windows_amd64.zip"
            } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
                "https://github.com/projectdiscovery/katana/releases/download/v1.1.0/katana_1.1.0_macOS_arm64.zip"
            } else if cfg!(target_os = "macos") {
                "https://github.com/projectdiscovery/katana/releases/download/v1.1.0/katana_1.1.0_macOS_amd64.zip"
            } else {
                "https://github.com/projectdiscovery/katana/releases/download/v1.1.0/katana_1.1.0_linux_amd64.zip"
            }
        }
        "nuclei" => {
            if cfg!(target_os = "windows") {
                "https://github.com/projectdiscovery/nuclei/releases/download/v3.2.4/nuclei_3.2.4_windows_amd64.zip"
            } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
                "https://github.com/projectdiscovery/nuclei/releases/download/v3.2.4/nuclei_3.2.4_macOS_arm64.zip"
            } else if cfg!(target_os = "macos") {
                "https://github.com/projectdiscovery/nuclei/releases/download/v3.2.4/nuclei_3.2.4_macOS_amd64.zip"
            } else {
                "https://github.com/projectdiscovery/nuclei/releases/download/v3.2.4/nuclei_3.2.4_linux_amd64.zip"
            }
        }
        _ => panic!("Unknown tool: {}", tool),
    }
}


/// Verifies required tools are installed, downloading them if missing.
pub async fn check_and_install_tools() {
    print!("{}\r\n", "[*] Checking dependencies...".bright_cyan());
    let tools_dir = Path::new("./tools");

    if !tools_dir.exists() {
        if let Err(e) = fs::create_dir_all(tools_dir) {
            eprint!("{}\r\n", format!("[!] Failed to create tools directory: {}", e).red());
            std::process::exit(1);
        }
    }

    let katana_bin = get_tool_binary_name("katana");
    let nuclei_bin = get_tool_binary_name("nuclei");

    if !tools_dir.join(&katana_bin).exists() {
        print!("{}\r\n", "[*] Katana not found. Downloading...".yellow());
        download_and_extract(get_tool_download_url("katana"), tools_dir).await;
    } else {
        print!("{}\r\n", "[+] Katana found.".green());
    }

    if !tools_dir.join(&nuclei_bin).exists() {
        print!("{}\r\n", "[*] Nuclei not found. Downloading...".yellow());
        download_and_extract(get_tool_download_url("nuclei"), tools_dir).await;
    } else {
        print!("{}\r\n", "[+] Nuclei found.".green());
    }

    print!("{}\r\n", "[+] All dependencies ready.".green().bold());
}

/// Runs a full update cycle: Nuclei binary, templates, Katana, and ARKENAR self-update.
pub async fn run_full_update() {
    print!("{}\r\n", "         ARKENAR Full Update".bright_cyan().bold());

    update_nuclei().await;
    update_nuclei_templates().await;
    update_katana().await;
    self_update().await;

    print!("\r\n{}\r\n", "[+] All updates completed successfully!".green().bold());
}


async fn update_nuclei() {
    print!("\r\n{}\r\n", "[*] Updating Nuclei...".bright_cyan());

    let nuclei_bin = get_tool_binary_name("nuclei");
    let nuclei_path = Path::new("./tools").join(&nuclei_bin);
    if !nuclei_path.exists() {
        print!("{}\r\n", "[!] Nuclei not found, skipping update.".yellow());
        return;
    }

    match Command::new(&nuclei_path)
        .arg("-update")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .await
    {
        Ok(status) if status.success() => {
            print!("{}\r\n", "[+] Nuclei updated.".green());
        }
        Ok(status) => {
            print!("{}\r\n", format!("[!] Nuclei update exited with: {}", status).yellow());
        }
        Err(e) => {
            print!("{}\r\n", format!("[!] Failed to run Nuclei update: {}", e).red());
        }
    }
}

async fn update_nuclei_templates() {
    print!("\r\n{}\r\n", "[*] Updating Nuclei Templates...".bright_cyan());

    let nuclei_bin = get_tool_binary_name("nuclei");
    let nuclei_path = Path::new("./tools").join(&nuclei_bin);
    if !nuclei_path.exists() {
        print!("{}\r\n", "[!] Nuclei not found, skipping template update.".yellow());
        return;
    }

    match Command::new(&nuclei_path)
        .arg("-ut")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .await
    {
        Ok(status) if status.success() => {
            print!("{}\r\n", "[+] Nuclei templates updated.".green());
        }
        Ok(status) => {
            print!("{}\r\n", format!("[!] Template update exited with: {}", status).yellow());
        }
        Err(e) => {
            print!("{}\r\n", format!("[!] Failed to update templates: {}", e).red());
        }
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

    match Command::new(&katana_path)
        .arg("-update")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .await
    {
        Ok(status) if status.success() => {
            print!("{}\r\n", "[+] Katana updated.".green());
        }
        Ok(status) => {
            print!("{}\r\n", format!("[!] Katana update exited with: {}", status).yellow());
        }
        Err(e) => {
            print!("{}\r\n", format!("[!] Failed to update Katana: {}", e).red());
        }
    }
}


async fn self_update() {
    print!("\r\n{}\r\n", "[*] Checking for ARKENAR self-update...".bright_cyan());

    // 1. Detect
    let asset_name = get_arkenar_asset_name();
    let binary_name = get_arkenar_binary_name();
    let download_url = format!(
        "https://github.com/RealOzk/ARKENAR/releases/latest/download/{}",
        asset_name
    );

    let current_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            print!("{}\r\n", format!("[!] Cannot determine current exe path: {}", e).red());
            return;
        }
    };

    // 2. Download
    print!("{}\r\n", format!("[*] Downloading {} ...", download_url).dimmed());

    let response = match reqwest::get(&download_url).await {
        Ok(r) => r,
        Err(e) => {
            print!("{}\r\n", format!("[!] Download failed: {}", e).red());
            return;
        }
    };

    if !response.status().is_success() {
        print!("{}\r\n", format!("[!] Server returned status: {}", response.status()).red());
        return;
    }

    let bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            print!("{}\r\n", format!("[!] Failed to read response: {}", e).red());
            return;
        }
    };

    // 3. Extract binary from archive
    print!("{}\r\n", "[*] Extracting binary from archive...".blue());

    let extracted = if asset_name.ends_with(".tar.gz") {
        extract_binary_from_tar_gz(&bytes, binary_name)
    } else {
        extract_binary_from_zip(&bytes, binary_name)
    };

    let binary_bytes = match extracted {
        Ok(b) => b,
        Err(e) => {
            print!("{}\r\n", format!("[!] Failed to extract binary: {}", e).red());
            return;
        }
    };

    // 4. Replace current binary
    let tmp_path = current_exe.with_extension("tmp");
    let backup_path = current_exe.with_extension("bak");

    if let Err(e) = fs::write(&tmp_path, &binary_bytes) {
        print!("{}\r\n", format!("[!] Failed to write temp binary: {}", e).red());
        return;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        if let Err(e) = fs::set_permissions(&tmp_path, perms) {
            print!("{}\r\n", format!("[!] Failed to set permissions: {}", e).red());
            let _ = fs::remove_file(&tmp_path);
            return;
        }
    }

    if backup_path.exists() {
        let _ = fs::remove_file(&backup_path);
    }

    if let Err(e) = fs::rename(&current_exe, &backup_path) {
        if e.kind() == io::ErrorKind::PermissionDenied {
            print!("{}\r\n",
                "[!] Permission denied. Try re-running with: sudo arkenar --update"
                    .red().bold()
            );
        } else {
            print!("{}\r\n", format!("[!] Failed to rename current binary: {}", e).red());
        }
        let _ = fs::remove_file(&tmp_path);
        return;
    }

    if let Err(e) = fs::rename(&tmp_path, &current_exe) {
        if e.kind() == io::ErrorKind::PermissionDenied {
            print!("{}\r\n",
                "[!] Permission denied. Try re-running with: sudo arkenar --update"
                    .red().bold()
            );
        } else {
            print!("{}\r\n", format!("[!] Failed to install new binary: {}", e).red());
        }
        let _ = fs::rename(&backup_path, &current_exe);
        return;
    }

    // 5. Cleanup
    let _ = fs::remove_file(&backup_path);

    print!("{}\r\n", "[+] ARKENAR binary updated successfully!".green().bold());
}

/// Extracts a named binary from a `.tar.gz` archive in memory.
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

/// Extracts a named binary from a `.zip` archive in memory.
fn extract_binary_from_zip(data: &[u8], binary_name: &str) -> io::Result<Vec<u8>> {
    let cursor = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
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

/// Downloads a zip archive and extracts tool binaries into the target directory.
async fn download_and_extract(url: &str, target_dir: &Path) {
    let response = match reqwest::get(url).await {
        Ok(r) => r,
        Err(e) => {
            eprint!("{}\r\n", format!("[!] Download failed for {}: {}", url, e).red());
            return;
        }
    };

    let bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            eprint!("{}\r\n", format!("[!] Failed to read download response: {}", e).red());
            return;
        }
    };

    print!("{}\r\n", "[*] Extracting...".blue());

    let cursor = Cursor::new(bytes);
    let mut archive = match zip::ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            eprint!("{}\r\n", format!("[!] Failed to open zip archive: {}", e).red());
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

        // On Windows extract .exe files; on Unix extract files without extension
        // (or any executable-looking binary).   keep the original logic but make
        // it platform-aware: extract anything whose stem matches a known tool name.
        let name = file.name().to_string();
        let dominated_by_exe = name.ends_with(".exe");
        let is_tool_binary = if cfg!(target_os = "windows") {
            dominated_by_exe
        } else {
            // On Unix, tool binaries inside the zip typically have no extension.
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

                    // On Unix, make extracted binary executable.
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let perms = std::fs::Permissions::from_mode(0o755);
                        let _ = fs::set_permissions(&outpath, perms);
                    }
                }
                Err(e) => {
                    eprint!("{}\r\n", format!("[!] Failed to create output file: {}", e).red());
                    return;
                }
            }
        }
    }

    print!("{}\r\n", "[+] Installed successfully.".green());
}