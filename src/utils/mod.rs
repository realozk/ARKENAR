pub mod detector;
pub mod payload_loader;
pub mod installer;

use std::fs::File;
use std::io;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use which::which;



/// Resolves the full path to a tool binary.
/// Search order: ./tools/{name}.exe → ./{name}.exe → System PATH
pub fn get_binary_path(tool_name: &str) -> Option<String> {
    let binary_name = if cfg!(target_os = "windows") {
        format!("{}.exe", tool_name)
    } else {
        tool_name.to_string()
    };

    // 1. Check ./tools/ directory (where the installer downloads to)
    let tools_path = PathBuf::from("./tools").join(&binary_name);
    if tools_path.exists() {
        return Some(tools_path.to_string_lossy().to_string());
    }

    // 2. Check current directory
    let local_path = PathBuf::from("./").join(&binary_name);
    if local_path.exists() {
        return Some(local_path.to_string_lossy().to_string());
    }

    // 3. Check system PATH
    if let Ok(path) = which(&binary_name) {
        return Some(path.to_string_lossy().to_string());
    }

    None
}

/// Reads a file line-by-line, returning all non-empty trimmed lines.
pub fn read_lines(path: &str) -> io::Result<Vec<String>> {
    let file = File::open(Path::new(path))?;
    let reader = io::BufReader::new(file);
    let lines = reader
        .lines()
        .filter_map(|line| {
            let line = line.ok()?;
            let trimmed = line.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .collect();
    Ok(lines)
}