#!/usr/bin/env bash
# e2e: sessions=b funded
# HOO-1420 as a regression: the opt-in A→B confidential round trip, checked in
# the UI and on chain after every step. Plus the interop check HOO-1423 names:
# chain-confidential.mjs re-derives each wallet's keys in Node and must match the ElGamal
# key the browser registered, and decrypt what the browser wrote.
#
# Spends devnet SOL. Leaves wallet A configured with 75 available and 900
# public on this run's opt-in mint, and B configured and emptied, for the flows
# after it.
FLOW=confidential-optin
source "$(dirname "$0")/../lib.sh"
source "$(dirname "$0")/../lib-confidential.sh"

MINT="$(run_mint opt-in)"
B_ADDRESS="$(CHAIN address --role b)"
echo "mint: $MINT (https://explorer.solana.com/address/$MINT?cluster=devnet)"

step "wallet A: configure"
open_wizard "$MINT"
ab wait --text "auto-approves new accounts" --timeout 30000 >/dev/null
check "configure is 1 transaction" equals "$(run_step_ok "$STEP_CONFIGURE" "Configure account")" 1
check "on chain: A is configured" await_chain a "$MINT" configured true
check "on chain: an opt-in account is approved on configure" equals "$(chain_field a "$MINT" approved)" true
check "on chain: confidential credits are on" equals "$(chain_field a "$MINT" allowConfidentialCredits)" true
check "the browser-derived keys match what Node derives (interop)" equals "$(chain_field a "$MINT" keysMatchAccount)" true
check "step 1 now says the account is configured" \
    wait_slow "This account is already configured for confidential transfers."
# Configure already enables credits, so step 3 charges a fee for nothing.
known_defect HOO-1428 "step 3 is disabled once credits are already enabled" \
    not card_enabled "$STEP_CREDITS" "Enable confidential credits"

step "wallet A: deposit 100, apply"
card_fill_amount "$STEP_DEPOSIT" 100
check "deposit is 1 transaction" equals "$(run_step_ok "$STEP_DEPOSIT" "Deposit to pending")" 1
check "on chain: public 1000 → 900" await_chain a "$MINT" publicBalance "$(raw 900)"
check "on chain: 100 pending (decrypted in Node)" equals "$(chain_field a "$MINT" decrypted.pendingBalance)" "$(raw 100)"
check "apply is 1 transaction" equals "$(run_step_ok "$STEP_APPLY" "Apply pending → available")" 1
check "on chain: 100 available, 0 pending" await_chain a "$MINT" decrypted.availableBalance "$(raw 100)"
check "on chain: pending is back to 0" equals "$(chain_field a "$MINT" decrypted.pendingBalance)" 0

step "reveal in the balance panel"
panel_refresh
panel_reveal
ab wait --text "Revealed" --timeout 30000 >/dev/null
check "the panel decrypts 100 available" contains "$(panel_text)" "100"

step "wallet B: configure from nothing"
as_wallet b open_wizard "$MINT"
check "B: configure is 1 transaction" equals "$(as_wallet b run_step_ok "$STEP_CONFIGURE" "Configure account")" 1
check "on chain: B is configured, approved, with a zero balance" await_chain b "$MINT" configured true
check "on chain: B holds 0 public" equals "$(chain_field b "$MINT" publicBalance)" 0
check "B's browser-derived keys match Node's (interop)" equals "$(chain_field b "$MINT" keysMatchAccount)" true

step "wallet A → B: confidential transfer of 25"
B_SOL_BEFORE="$(sol_of b)"
# Relative counts: earlier runs strand contexts on purpose (interrupt, whitelist).
A_CONTEXTS_BEFORE="$(context_count a)"
B_CONTEXTS_BEFORE="$(context_count b)"
card_fill_address "$STEP_TRANSFER" "$B_ADDRESS"
card_fill_amount "$STEP_TRANSFER" 25
TXS="$(run_step_ok "$STEP_TRANSFER" "Send confidentially")"
note "transfer took $TXS transactions"
expect_plan_length "transfer" "$TXS" "$TRANSFER_TXS_V0"
check "on chain: A's public balance is untouched at 900 (the privacy property)" \
    equals "$(chain_field a "$MINT" publicBalance)" "$(raw 900)"
check "on chain: A has 75 available" await_chain a "$MINT" decrypted.availableBalance "$(raw 75)"
check "on chain: B has 25 pending, decrypted with B's own keys" await_chain b "$MINT" decrypted.pendingBalance "$(raw 25)"
check "on chain: B's pending credit counter is 1" equals "$(chain_field b "$MINT" pendingBalanceCreditCounter)" 1
check "the recipient pays nothing" equals "$(sol_of b)" "$B_SOL_BEFORE"
check "no proof-context accounts left behind" equals "$(context_count a)" "$A_CONTEXTS_BEFORE"

step "wallet B: apply, withdraw 25, empty"
as_wallet b panel_refresh
check "B: apply is 1 transaction" equals "$(as_wallet b run_step_ok "$STEP_APPLY" "Apply pending → available")" 1
check "on chain: B has 25 available" await_chain b "$MINT" decrypted.availableBalance "$(raw 25)"
as_wallet b card_fill_amount "$STEP_WITHDRAW" 25
TXS="$(as_wallet b run_step_ok "$STEP_WITHDRAW" "Withdraw available → public")"
note "withdraw took $TXS transactions"
expect_plan_length "withdraw" "$TXS" "$WITHDRAW_TXS_V0"
check "on chain: B's public balance is 25" await_chain b "$MINT" publicBalance "$(raw 25)"
check "on chain: B has 0 available" equals "$(chain_field b "$MINT" decrypted.availableBalance)" 0
check "B: empty is 1 transaction" equals "$(as_wallet b run_step_ok "$STEP_EMPTY" "Empty confidential balance")" 1
check "no proof-context accounts left behind by B" equals "$(context_count b)" "$B_CONTEXTS_BEFORE"

as_wallet b assert_no_page_errors
assert_no_page_errors
finish_flow
