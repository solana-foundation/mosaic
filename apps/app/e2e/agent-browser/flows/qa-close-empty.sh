#!/usr/bin/env bash
# e2e: funded
# QA matrix §5 Overview: with supply 0 and a token account still open, the
# Supply row becomes "Close empty account" and opens the close modal.
# 1 mint (mint 1, burn 1, close).
FLOW=qa-close-empty
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

goto "/"
A="$(wallet_address)"
bal() { CHAIN token --role a --mint "$MINT" --owner "$1" | jq -r '.publicBalance // "none"'; }

CONFIGURE=""
MINT="$(retry_429 create_custom_token closeempty Metadata)" || fail "creation failed"
close_result
open_manage "$MINT"

step "mint 1, burn 1"
fill_mint_1() { dom_click "Use my wallet" && ab find placeholder "Enter amount to mint..." fill "1" >/dev/null; }
ui_action "Mint 1 succeeds" "Mint Tokens" fill_mint_1 "Mint Tokens" "minted successfully"
check "wallet A holds 1" await_value 60 "$(raw 1)" bal "$A"
fill_burn_1() { ab find placeholder "Enter amount to burn..." fill "1" >/dev/null; }
ui_action "Burn 1 succeeds" "Burn Tokens" fill_burn_1 "Burn Tokens" "burned successfully"
check "wallet A holds 0, its account still open" await_value 60 0 bal "$A"

step "supply 0 with an open account offers Close empty account"
# The account check reads the chain once per load; a public-devnet 429 there
# shows the no-account CTA, so reload up to twice before judging.
for retry in 1 2 3; do
    goto "/manage/$MINT"
    wait_slow "Token Overview"
    eventually 20 eval 'equals "$(overview_value Supply)" "Close empty account"' && break
    note "Supply row reads '$(overview_value Supply)' (attempt $retry); reloading"
    sleep 10
done
check "the Supply row reads 'Close empty account'" equals "$(overview_value Supply)" "Close empty account"
dom_click "Close empty account"
check "it opens the close modal" eventually 10 eval 'contains "$(dialog_text)" "Close Token Account"'
escape_all
eventually 5 eval 'equals "$(dialog_text)" ""' || escape_all
# Close through the same modal from Admin Actions, with the shared 429 retry.
no_fill() { :; }
ui_action "Close Token Account succeeds" "Close Token Account" no_fill "Close Account" "Account Closed"
check "the token account is closed on chain" await_value 60 none bal "$A"
goto "/manage/$MINT"
wait_slow "Token Overview"
check "with no account left the row is back to 'Mint tokens to get started'" \
    eventually 30 eval 'equals "$(overview_value Supply)" "Mint tokens to get started"'

assert_no_page_errors
finish_flow
