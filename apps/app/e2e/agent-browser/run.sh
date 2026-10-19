#!/usr/bin/env bash
# Runs the agent-browser smoke flows against a running Mosaic dev server, on
# devnet, with the shared test wallet injected.
#
# Usage (from apps/app): pnpm e2e:agent [flow ...]
#   flows default to: connect create-stablecoin manage
#   BASE_URL             app under test (default http://localhost:3000)
#   MOSAIC_TEST_KEYPAIR  keypair JSON (default ~/.config/solana/devnet-test.json)
#   HEADED=1             show the browser window instead of running headless
#   KEEP_OPEN=1          leave the session open afterwards for poking around
#   AB_SESSION           session name (default: mosaic-e2e-<run id>)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$HERE/../.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
OUT="$APP_ROOT/.agent-browser/runs/$RUN_ID"
# A fresh session per run: init scripts only apply when a session's browser
# launches, and closing then reopening one name races the daemon's shutdown.
AB_SESSION="${AB_SESSION:-mosaic-e2e-$RUN_ID}"
export OUT AB_SESSION
source "$HERE/lib.sh"

FLOWS=("$@")
[[ ${#FLOWS[@]} -gt 0 ]] || FLOWS=(connect create-stablecoin manage)

SOLANA="${SOLANA:-$(command -v solana || echo "$HOME/.local/share/solana/install/active_release/bin/solana")}"
KEYPAIR="${MOSAIC_TEST_KEYPAIR:-$HOME/.config/solana/devnet-test.json}"
MIN_SOL="${MIN_SOL:-0.1}"

step "pre-flight"
command -v agent-browser >/dev/null || fail "agent-browser not installed: npm i -g agent-browser && agent-browser install"
curl -sf -o /dev/null "$BASE_URL/" || fail "no app at $BASE_URL; start it with: pnpm dev -- -H 0.0.0.0"

ADDRESS="$("$SOLANA" address -k "$KEYPAIR")"
export TEST_WALLET_SHORT="${ADDRESS:0:4}...${ADDRESS: -4}"
BALANCE="$("$SOLANA" balance "$ADDRESS" --url devnet | awk '{print $1}')"
echo "test wallet $ADDRESS: $BALANCE SOL"
if [[ " ${FLOWS[*]} " =~ \ (create-stablecoin|manage)\  ]] && awk "BEGIN{exit !($BALANCE < $MIN_SOL)}"; then
    fail "need at least $MIN_SOL devnet SOL; top up $ADDRESS at https://faucet.solana.com"
fi

step "build the test wallet"
node "$HERE/build-test-wallet.mjs"

step "launch a fresh browser session ($AB_SESSION)"
LAUNCH=(--init-script "$APP_ROOT/.agent-browser/test-wallet.js")
[[ "${HEADED:-}" == 1 ]] && LAUNCH+=(--headed)
ab "${LAUNCH[@]}" open about:blank >/dev/null

cleanup() {
    local status=$?
    if [[ $status -ne 0 ]]; then
        ab screenshot "$OUT/failure.png" >/dev/null 2>&1 && echo "failure screenshot: $OUT/failure.png" >&2
        ab console >"$OUT/console.log" 2>&1 && echo "console log: $OUT/console.log" >&2
        # A Next.js dev overlay or uncaught exception usually explains a timed-out wait.
        ab errors >&2 || true
    fi
    if [[ "${KEEP_OPEN:-}" == 1 ]]; then
        echo "session left open: agent-browser --session $AB_SESSION snapshot -i"
    else
        ab close >/dev/null 2>&1 || true
    fi
    exit $status
}
trap cleanup EXIT

for flow in "${FLOWS[@]}"; do
    printf '\n\033[1;34m=== %s ===\033[0m\n' "$flow"
    bash "$HERE/flows/$flow.sh"
done

ab screenshot "$OUT/final.png" >/dev/null
printf '\n\033[32m✓ all flows passed\033[0m (%s)\n' "$OUT"
