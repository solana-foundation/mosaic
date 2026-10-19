#!/usr/bin/env bash
# Open /manage/<mint> for the token create-stablecoin.sh made, check the tabs
# render, and mint tokens to the connected wallet through Admin Actions.
FLOW=manage
source "$(dirname "$0")/../lib.sh"

MINT="${MINT:-$(cat "$OUT/mint.txt" 2>/dev/null || true)}"
[[ -n "$MINT" ]] || fail "no mint address: run create-stablecoin.sh first or set MINT"

step "open the manage page"
ab open "$BASE_URL/manage/$MINT"
# The page loads authorities and extensions live from devnet.
wait_slow "Admin Actions"
ab find role tab click --name "Permissions"
ab find role tab click --name "Extensions"

step "mint 100 tokens to the connected wallet"
ab find role button click --name "Admin Actions"
ab find role menuitem click --name "Mint Tokens"
ab find role button click --name "Use my wallet"
ab find placeholder "Enter amount to mint..." fill "100"
ab find role button click --name "Mint Tokens" --exact
if ! wait_slow "Tokens minted successfully!"; then
    ab get text '[role=alertdialog]' >&2 || true
    fail "mint did not succeed"
fi

assert_no_page_errors
