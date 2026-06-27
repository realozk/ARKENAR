//! Self-update only. Arkenar is a single static Rust binary — it bundles and
//! downloads no external tools (Katana/Nuclei/Subfinder were removed in 1.3).

use colored::*;
use flate2::read::GzDecoder;
use std::fs;
use std::io::{self, Cursor, Read};
use std::path::PathBuf;
use tar::Archive;

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

pub async fn run_full_update() {
    print!("{}\r\n", "         ARKENAR Update".bright_cyan().bold());
    self_update().await;
    print!("\r\n{}\r\n", "[+] Update complete.".green().bold());
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
