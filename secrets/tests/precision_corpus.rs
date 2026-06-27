//! Precision corpus — the published Zero-FP number, gated in CI. A fixed set of
//! real-shaped exposures and decoys; the test asserts the matcher's false-positive and
//! false-negative counts are both zero. Add fixtures in the same change as a matcher edit.

use arkenar_secrets::scan_bytes;

enum Expect {
    /// True positive: every listed kind must be detected.
    Detect(&'static [&'static str]),
    /// True negative: nothing may be detected.
    Clean,
}

struct Case {
    name: &'static str,
    body: &'static [u8],
    content_type: Option<&'static str>,
    expect: Expect,
}

use Expect::{Clean, Detect};

/// Keys below are real-shaped but synthetic (never issued).
const CORPUS: &[Case] = &[
    // ── True positives ──
    Case {
        name: "openai_project_key",
        body: b"const client = new OpenAI({ apiKey: 'sk-proj-T3BlbkFJ8xQ2mZ9vN1pL7wRc4Ht6Yd0aGsK' });",
        content_type: Some("application/javascript"),
        expect: Detect(&["OpenAI API Key"]),
    },
    Case {
        name: "anthropic_key",
        body: b"ANTHROPIC_API_KEY=sk-ant-api03-9Fk2Lm7Qp4Rs8Tv1Wx3Yz6Bc5Dg0Hj",
        content_type: Some("text/plain"),
        expect: Detect(&["Anthropic API Key"]),
    },
    Case {
        name: "stripe_live_key",
        body: b"STRIPE_SECRET=sk_live_4eC39HqLyjWDarjtT1zdp7dcKp2mNv8Qb",
        content_type: Some("text/plain"),
        expect: Detect(&["Stripe Secret Key"]),
    },
    Case {
        name: "aws_access_key",
        body: b"aws_access_key_id = AKIA4OSWORQF7MX2J5KP",
        content_type: Some("text/plain"),
        expect: Detect(&["AWS Access Key"]),
    },
    Case {
        name: "github_token",
        body: b"git remote add origin https://ghp_AbC1dEf2GhI3jKl4MnO5pQr6StU7vWx8Yz90@github.com/a/b",
        content_type: Some("text/plain"),
        expect: Detect(&["GitHub Token"]),
    },
    Case {
        name: "env_file_body",
        body: b"# production - do not commit\n\
                DATABASE_URL=postgres://app:s3cr3t@db.internal:5432/app\n\
                OPENAI_API_KEY=sk-proj-T3BlbkFJ8xQ2mZ9vN1pL7wRc4Ht6Yd0aGsK\n\
                DEBUG=false\n",
        content_type: Some("text/plain"),
        expect: Detect(&["OpenAI API Key"]),
    },
    Case {
        name: "git_config_body",
        body: b"[remote \"origin\"]\n\
                \turl = https://oauth2:ghp_AbC1dEf2GhI3jKl4MnO5pQr6StU7vWx8Yz90@github.com/acme/app.git\n",
        content_type: Some("text/plain"),
        expect: Detect(&["GitHub Token"]),
    },
    Case {
        // The real-world case: a misconfigured server serves an exposed `.env` with no
        // known extension, so it comes back as `application/octet-stream`. The body is
        // text and must still be scanned — this is the flagship leak we exist to catch.
        name: "octet_stream_env_file",
        body: b"# prod\nOPENAI_API_KEY=sk-proj-T3BlbkFJ8xQ2mZ9vN1pL7wRc4Ht6Yd0aGsK\nDEBUG=0\n",
        content_type: Some("application/octet-stream"),
        expect: Detect(&["OpenAI API Key"]),
    },
    // ── True negatives ──
    Case {
        // octet-stream that is genuinely binary (NUL bytes + an embedded key-shaped
        // string). The byte sniff must classify it binary and skip it — no FP.
        name: "octet_stream_binary_blob",
        body: b"PK\x03\x04\x00\x00 sk-proj-T3BlbkFJ8xQ2mZ9vN1pL7wRc4Ht6Yd0aGsK \x00\xff\xfe\x00",
        content_type: Some("application/octet-stream"),
        expect: Clean,
    },
    Case {
        // A key-shaped string inside an actual image must never be scanned — the binary
        // content-type short-circuits before the sniff.
        name: "image_with_keyshaped_bytes",
        body: b"\x89PNG\r\n\x1a\n sk-proj-T3BlbkFJ8xQ2mZ9vN1pL7wRc4Ht6Yd0aGsK",
        content_type: Some("image/png"),
        expect: Clean,
    },
    Case {
        name: "prose_mentions_api_key",
        body: b"To authenticate, set the API_KEY= value from your dashboard. \
                You can also export GITHUB_TOKEN= before running the script.",
        content_type: Some("text/html"),
        expect: Clean,
    },
    Case {
        name: "placeholder_env",
        body: b"OPENAI_API_KEY=sk-proj-your_key_here_replace_me_before_use\n\
                STRIPE_KEY=sk_live_your_test_key_goes_right_here",
        content_type: Some("text/plain"),
        expect: Clean,
    },
    Case {
        name: "docs_example_quoted",
        body: b"Example config:\n  api_key = \"your-api-key-here\"\n  password = \"changeme\"\n",
        content_type: Some("text/markdown"),
        expect: Clean,
    },
    Case {
        name: "low_entropy_junk",
        body: b"AKIAAAAAAAAAAAAAAAAA\n\
                ghp_000000000000000000000000000000000000\n",
        content_type: Some("text/plain"),
        expect: Clean,
    },
    Case {
        name: "plain_prose",
        body: b"The quick brown fox jumps over the lazy dog. \
                Contact support@example.com for help with your account.",
        content_type: Some("text/html"),
        expect: Clean,
    },
];

#[test]
fn precision_corpus_has_zero_fp_and_fn() {
    let mut false_positives = 0usize;
    let mut false_negatives = 0usize;
    let mut tp_cases = 0usize;
    let mut tn_cases = 0usize;

    for case in CORPUS {
        let found = scan_bytes(case.body, case.content_type);
        match case.expect {
            Clean => {
                tn_cases += 1;
                if !found.is_empty() {
                    false_positives += 1;
                    let kinds: Vec<&str> = found.iter().map(|s| s.kind.as_str()).collect();
                    eprintln!("  FP in '{}': unexpectedly detected {:?}", case.name, kinds);
                }
            }
            Detect(expected) => {
                tp_cases += 1;
                let got: Vec<&str> = found.iter().map(|s| s.kind.as_str()).collect();
                for kind in expected {
                    if !got.contains(kind) {
                        false_negatives += 1;
                        eprintln!(
                            "  FN in '{}': expected {:?}, got {:?}",
                            case.name, kind, got
                        );
                    }
                }
            }
        }
    }

    // The published number. Keep this line — CI logs it every run.
    eprintln!(
        "precision corpus baseline — {} TP cases, {} TN cases, {} false positives, {} false negatives",
        tp_cases, tn_cases, false_positives, false_negatives
    );

    assert_eq!(false_positives, 0, "precision corpus regressed: false positives appeared");
    assert_eq!(false_negatives, 0, "precision corpus regressed: false negatives appeared");
}
