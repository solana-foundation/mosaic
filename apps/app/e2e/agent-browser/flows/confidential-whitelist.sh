#!/usr/bin/env bash
# e2e: sessions=b funded
# HOO-1421: the whitelist policy end to end, the one path never run by hand,
# so wizard step 2 "Approve account" has never been exercised.
# HOO-1425: a transfer to a configured-but-unapproved account, its message,
# what it costs, and whether it strands proof-context rent.
#
# Spends devnet SOL.
FLOW=confidential-whitelist
source "$(dirname "$0")/../lib.sh"
source "$(dirname "$0")/../lib-confidential.sh"

MINT="$(run_mint whitelist)"
A_ADDRESS="$(CHAIN address --role a)"
B_ADDRESS="$(CHAIN address --role b)"
echo "mint: $MINT (https://explorer.solana.com/address/$MINT?cluster=devnet)"

step "wallet A (the confidential authority): configure, then approve its own account"
open_wizard "$MINT"
sleep 3
check "step 2 is enabled for the mint's confidential authority" card_enabled "$STEP_APPROVE" "Approve account"
run_step_ok "$STEP_CONFIGURE" "Configure account" >/dev/null
check "on chain: A is configured" await_chain a "$MINT" configured true
check "on chain: a whitelist account lands unapproved, even the authority's" \
    equals "$(chain_field a "$MINT" approved)" false
check "approving with a blank address approves A's own account (1 tx)" \
    equals "$(run_step_ok "$STEP_APPROVE" "Approve account")" 1
check "on chain: A is approved" await_chain a "$MINT" approved true

step "wallet A: deposit 100, apply"
card_fill_amount "$STEP_DEPOSIT" 100
run_step_ok "$STEP_DEPOSIT" "Deposit to pending" >/dev/null
check "on chain: A has 100 pending" await_chain a "$MINT" decrypted.pendingBalance "$(raw 100)"
run_step_ok "$STEP_APPLY" "Apply pending → available" >/dev/null
check "on chain: A has 100 available" await_chain a "$MINT" decrypted.availableBalance "$(raw 100)"

step "wallet B: configure, lands unapproved"
as_wallet b open_wizard "$MINT"
sleep 3
check "B sees step 2 disabled with the authority named" contains "$(as_wallet b card_text "$STEP_APPROVE")" \
    "Only the mint's confidential authority ($A_ADDRESS) can approve accounts."
as_wallet b run_step_ok "$STEP_CONFIGURE" "Configure account" >/dev/null
check "on chain: B is configured" await_chain b "$MINT" configured true
check "on chain: B is not approved" equals "$(chain_field b "$MINT" approved)" false

step "HOO-1425: A transfers to unapproved B"
A_SOL_BEFORE="$(sol_of a)"
CONTEXTS_BEFORE="$(context_count a)"
wallet_ctl 'reset()' >/dev/null
card_fill_address "$STEP_TRANSFER" "$B_ADDRESS"
card_fill_amount "$STEP_TRANSFER" 10
ERROR="$(run_card "$STEP_TRANSFER" "Send confidentially")" || fail "the transfer to an unapproved account did not settle"
SIGNED="$(sign_count signTransaction)"
A_SOL_AFTER="$(sol_of a)"
STRANDED="$(($(context_count a) - CONTEXTS_BEFORE))"
note "unapproved recipient: ${ERROR:0:200}"
COST="$(awk -v a="$A_SOL_BEFORE" -v b="$A_SOL_AFTER" 'BEGIN { printf "%.6f", a - b }')"
note "the failed attempt signed $SIGNED tx and cost $COST SOL; $STRANDED proof contexts left open"
check "the transfer to an unapproved account fails" test -n "$ERROR"
check "on chain: B received nothing" equals "$(chain_field b "$MINT" decrypted.pendingBalance)" 0
known_defect HOO-1425 "the message names approval as the missing precondition" grep -qi "approv" <<<"$ERROR"
known_defect HOO-1425 "the doomed transfer is caught before the wallet signs" equals "$SIGNED" 0
known_defect HOO-1425 "no proof-context rent is stranded by the failed transfer" equals "$STRANDED" 0

step "A approves B by owner address, then the transfer goes through"
card_fill_address "$STEP_APPROVE" "$B_ADDRESS"
check "approving B's owner address is 1 tx" equals "$(run_step_ok "$STEP_APPROVE" "Approve account")" 1
check "on chain: B flips to approved" await_chain b "$MINT" approved true
card_fill_address "$STEP_TRANSFER" "$B_ADDRESS"
card_fill_amount "$STEP_TRANSFER" 10
run_step_ok "$STEP_TRANSFER" "Send confidentially" >/dev/null
check "on chain: B has 10 pending" await_chain b "$MINT" decrypted.pendingBalance "$(raw 10)"

as_wallet b assert_no_page_errors
assert_no_page_errors
finish_flow
