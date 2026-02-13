use std::fs;
use std::io::{self, Cursor};
use std::path::Path;
use colored::*;
use tokio::process::Command;
use std::process::Stdio;

const KATANA_URL: &str = "https://github.com/projectdiscovery/katana/releases/download/v1.1.0/katana_1.1.0_windows_amd64.zip";
const NUCLEI_URL: &str = "https://github.com/projectdiscovery/nuclei/releases/download/v3.2.4/nuclei_3.2.4_windows_amd64.zip";
const ARKENAR_UPDATE_URL: &str = "https://github.com/RealOzk/ARKENAR/releases/latest/download/ARKENAR.exe";

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

    if !tools_dir.join("katana.exe").exists() {
        print!("{}\r\n", "[*] Katana not found. Downloading...".yellow());
        download_and_extract(KATANA_URL, tools_dir).await;
    } else {
        print!("{}\r\n", "[+] Katana found.".green());
    }

    if !tools_dir.join("nuclei.exe").exists() {
        print!("{}\r\n", "[*] Nuclei not found. Downloading...".yellow());
        download_and_extract(NUCLEI_URL, tools_dir).await;
    } else {
        print!("{}\r\n", "[+] Nuclei found.".green());
    }

    print!("{}\r\n", "[+] All dependencies ready.".green().bold());
}

/// Runs a full update cycle: Nuclei binary, templates, Katana, and ARKENAR self-update.
pub async fn run_full_update() {
    print!("{}\r\n", "══════════════════════════════════════════".bright_cyan().bold());
    print!("{}\r\n", "         ARKENAR Full Update".bright_cyan().bold());
    print!("{}\r\n", "══════════════════════════════════════════".bright_cyan().bold());

    update_nuclei().await;
    update_nuclei_templates().await;
    update_katana().await;
    self_update().await;

    print!("\r\n{}\r\n", "[+] All updates completed successfully!".green().bold());
}

async fn update_nuclei() {
    print!("\r\n{}\r\n", "[*] Updating Nuclei...".bright_cyan());

    let nuclei_path = Path::new("./tools/nuclei.exe");
    if !nuclei_path.exists() {
        print!("{}\r\n", "[!] Nuclei not found, skipping update.".yellow());
        return;
    }

    match Command::new(nuclei_path)
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

    let nuclei_path = Path::new("./tools/nuclei.exe");
    if !nuclei_path.exists() {
        print!("{}\r\n", "[!] Nuclei not found, skipping template update.".yellow());
        return;
    }

    match Command::new(nuclei_path)
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

    let katana_path = Path::new("./tools/katana.exe");
    if !katana_path.exists() {
        print!("{}\r\n", "[!] Katana not found, skipping update.".yellow());
        return;
    }

    match Command::new(katana_path)
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

    let current_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            print!("{}\r\n", format!("[!] Cannot determine current exe path: {}", e).red());
            return;
        }
    };

    print!("{}\r\n", format!("[*] Downloading from {}...", ARKENAR_UPDATE_URL).dimmed());

    let response = match reqwest::get(ARKENAR_UPDATE_URL).await {
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

    let backup_path = current_exe.with_extension("bak");

    if backup_path.exists() {
        let _ = fs::remove_file(&backup_path);
    }

    if let Err(e) = fs::rename(&current_exe, &backup_path) {
        print!("{}\r\n", format!("[!] Failed to rename current binary: {}", e).red());
        return;
    }

    if let Err(e) = fs::write(&current_exe, &bytes) {
        print!("{}\r\n", format!("[!] Failed to write new binary: {}", e).red());
        let _ = fs::rename(&backup_path, &current_exe);
        return;
    }

    let _ = fs::remove_file(&backup_path);

    print!("{}\r\n", "[+] ARKENAR binary updated successfully!".green().bold());
}

/// Downloads a zip archive and extracts `.exe` files into the target directory.
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

        if file.name().ends_with(".exe") {
            match fs::File::create(&outpath) {
                Ok(mut outfile) => {
                    if let Err(e) = io::copy(&mut file, &mut outfile) {
                        eprint!("{}\r\n", format!("[!] Failed to write binary: {}", e).red());
                        return;
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