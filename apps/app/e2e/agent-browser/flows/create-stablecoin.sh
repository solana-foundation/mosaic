#!/usr/bin/env bash
# e2e: funded
# Create a stablecoin on devnet through the create-token modal (all defaults past
# name/symbol) and hand its mint address to later flows via $OUT/mint.txt.
# Connects the wallet itself, so it also runs on its own.
FLOW=create-stablecoin
source "$(dirname "$0")/../lib.sh"

SYMBOL="AB$(date +%H%M)"

step "open the create-token modal"
goto "/"
# An empty dashboard offers a "Create Token" tile, one with tokens a "Create" button.
ab wait --fn '[...document.querySelectorAll("button")].some(b => ["Create Token", "Create"].includes(b.textContent.trim()))' \
    --timeout "$SLOW_TIMEOUT_MS" >/dev/null
dom_click "Create Token" || dom_click "Create" || fail "the dashboard offers no Create button"
ab wait --text "Create New Token" >/dev/null
ab find role heading click --name "Stablecoin" >/dev/null
ab wait --text "Create a Stablecoin" >/dev/null

step "basic params: Agent Browser USD ($SYMBOL)"
ab find label "Token Name" fill "Agent Browser USD" >/dev/null
ab find label "Symbol" fill "$SYMBOL" >/dev/null
ab find role button click --name "Continue" >/dev/null

step "features: keep defaults"
ab wait --text "Allowlist" >/dev/null
ab find role button click --name "Continue" >/dev/null

step "authorities: keep defaults (connected wallet) and create"
ab wait --text "Authority Parameters" >/dev/null
ab find role button click --name "Create Stablecoin" >/dev/null
if ! wait_slow "Stablecoin Created Successfully!"; then
    ab get text '[role=dialog]' >&2 || true
    fail "stablecoin was not created"
fi

step "read the new mint address"
# From the success dialog's Manage Token link: dashboard cards link to /manage/ too.
MINT_PATH="$(ab get attr '[role=dialog] a[href^="/manage/"]' href)"
MINT="${MINT_PATH#/manage/}"
[[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || fail "unexpected mint address: '$MINT'"
printf '%s\n' "$MINT" >"$OUT/mint.txt"
echo "mint: $MINT (https://explorer.solana.com/address/$MINT?cluster=devnet)"

step "the token is listed on the dashboard"
ab find role button click --name "Done" >/dev/null
# Wait for the dialog to go, so its links cannot answer for the dashboard's.
ab wait '[role=dialog]' --state detached --timeout 10000 >/dev/null
listed() { ab wait "a[href=\"/manage/$MINT\"]" --timeout 30000 >/dev/null; }
check "the new mint has a card on the dashboard" listed

assert_no_page_errors
finish_flow
