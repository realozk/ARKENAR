use assert_cmd::cargo::cargo_bin_cmd;
use predicates::prelude::*;
use std::io::Write;
use tempfile::NamedTempFile;

/// Single target with --dry-run should print the dry-run message and exit 0.
#[test]
fn test_single_target_dry_run() {
    cargo_bin_cmd!("arkenar")
        .args(&["http://example.com", "--dry-run"])
        .assert()
        .success()
        .stdout(predicate::str::contains("[DRY RUN] Would scan target: http://example.com"));
}

/// List file with --dry-run should process every line and print dry-run for each.
#[test]
fn test_list_file_dry_run() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "http://target1.com").unwrap();
    writeln!(file, "http://target2.com").unwrap();
    writeln!(file, "http://target3.com").unwrap();

    let path = file.path().to_str().unwrap().to_string();

    cargo_bin_cmd!("arkenar")
        .args(&["-l", &path, "--dry-run"])
        .assert()
        .success()
        .stdout(predicate::str::contains("[DRY RUN] Would scan target: http://target1.com"))
        .stdout(predicate::str::contains("[DRY RUN] Would scan target: http://target2.com"))
        .stdout(predicate::str::contains("[DRY RUN] Would scan target: http://target3.com"));
}

/// Running with no arguments should fail (clap requires target or -l).
#[test]
fn test_no_args_shows_error() {
    cargo_bin_cmd!("arkenar")
        .assert()
        .failure();
}
