#!/usr/bin/env bash
# Create a stablecoin on devnet through the create-token modal (all defaults past
# name/symbol) and hand its mint address to later flows via $OUT/mint.txt.
# Needs connect.sh to have run in the same session.
FLOW=create-stablecoin
source "$(dirname "$0")/../lib.sh"

SYMBOL="AB$(date +%H%M)"

step "open the create-token modal"
ab open "$BASE_URL/"
# The dashboard renders once the stored wallet auto-connects.
wait_slow "Create Token"
ab find role button click --name "Create Token"
ab wait --text "Create New Token"
ab find role heading click --name "Stablecoin"
ab wait --text "Create a Stablecoin"

step "basic params: Agent Browser USD ($SYMBOL)"
ab find label "Token Name" fill "Agent Browser USD"
ab find label "Symbol" fill "$SYMBOL"
ab find role button click --name "Continue"

step "features: keep defaults"
ab wait --text "Allowlist"
ab find role button click --name "Continue"

step "authorities: keep defaults (connected wallet) and create"
ab wait --text "Authority Parameters"
ab find role button click --name "Create Stablecoin"
if ! wait_slow "Stablecoin Created Successfully!"; then
    ab get text '[role=dialog]' >&2 || true
    fail "stablecoin was not created"
fi

step "read the new mint address"
MINT_PATH="$(ab get attr 'a[href^="/manage/"]' href)"
MINT="${MINT_PATH#/manage/}"
[[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || fail "unexpected mint address: '$MINT'"
printf '%s\n' "$MINT" >"$OUT/mint.txt"
echo "mint: $MINT (https://explorer.solana.com/address/$MINT?cluster=devnet)"

step "the token is listed on the dashboard"
ab find role button click --name "Done"
ab wait --text "Agent Browser USD"

assert_no_page_errors
