#!/bin/sh
# Maps GitHub Action inputs (auto-exposed as INPUT_*) to arkenar CLI flags.
set -e

if [ -z "$INPUT_TARGET" ]; then
    echo "[!] 'target' input is required"
    exit 2
fi

set -- "$INPUT_TARGET"
[ -n "$INPUT_MODE" ] && set -- "$@" -m "$INPUT_MODE"
[ -n "$INPUT_FAIL_ON" ] && set -- "$@" --fail-on "$INPUT_FAIL_ON"
[ -n "$INPUT_SARIF_FILE" ] && set -- "$@" --sarif "$INPUT_SARIF_FILE"
[ -n "$INPUT_WEBHOOK_URL" ] && set -- "$@" --webhook-url "$INPUT_WEBHOOK_URL"

exec arkenar "$@"
