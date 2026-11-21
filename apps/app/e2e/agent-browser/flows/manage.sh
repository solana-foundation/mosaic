#!/usr/bin/env bash
# e2e: funded
# Open /manage/<mint> for the token create-stablecoin.sh made (or MINT=...),
# check the tabs render, and mint tokens to the connected wallet through Admin
# Actions. Connects the wallet itself and imports the token when this
# session's dashboard does not hold it, so it also runs on its own.
FLOW=manage
source "$(dirname "$0")/../lib.sh"

MINT="${MINT:-$(cat "$OUT/mint.txt" 2>/dev/null || true)}"
[[ -n "$MINT" ]] ||
    fail "no mint address: run it after create-stablecoin (pnpm e2e:agent create-stablecoin manage), or set MINT"

step "open the manage page"
goto "/manage/$MINT"
# /manage only shows tokens this browser's dashboard holds. A fresh session
# (MINT=..., REUSE_OUT=...) lands on "Token Not Found", which imports from chain.
ab wait --fn '["Admin Actions", "Token Not Found"].some(t => document.body.innerText.includes(t))' \
    --timeout "$SLOW_TIMEOUT_MS" >/dev/null
if [[ "$(js 'document.body.innerText.includes("Token Not Found")')" == true ]]; then
    step "import the token from chain"
    dom_click "Import this token" || fail "Token Not Found offers no Import this token button"
    ab wait --text "Import Existing Token" >/dev/null
    ab find role button click --name "Import Token" --exact >/dev/null
fi
# The page loads authorities and extensions live from devnet.
wait_slow "Admin Actions"
ab find role tab click --name "Permissions" >/dev/null
ab find role tab click --name "Extensions" >/dev/null

step "mint 100 tokens to the connected wallet"
ab find role button click --name "Admin Actions" >/dev/null
ab find role menuitem click --name "Mint Tokens" >/dev/null
ab find role button click --name "Use my wallet" >/dev/null
ab find placeholder "Enter amount to mint..." fill "100" >/dev/null
ab find role button click --name "Mint Tokens" --exact >/dev/null
if ! wait_slow "Tokens minted successfully!"; then
    ab get text '[role=alertdialog]' >&2 || true
    fail "mint did not succeed"
fi

assert_no_page_errors
finish_flow
