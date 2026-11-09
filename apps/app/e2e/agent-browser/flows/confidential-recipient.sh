#!/usr/bin/env bash
# e2e: sessions=b funded
# HOO-1426: recipient and mint preconditions for a confidential transfer.
#
#   1 recipient has no token account          4 mint carries ConfidentialTransferFee
#   2 recipient's account is not configured   5 malformed recipient address
#   3 recipient has confidential credits off  6 recipient is the sender
#
# Case 4 changed under the ticket: this branch's SDK now routes fee mints to
# TransferWithFee instead of rejecting them, so it is a positive test here.
#
# Needs wallet A configured with an available balance on the opt-in mint
# (confidential-optin.sh). Spends devnet SOL.
FLOW=confidential-recipient
source "$(dirname "$0")/../lib.sh"
source "$(dirname "$0")/../lib-confidential.sh"

MINT="$(run_mint opt-in)"
A_ADDRESS="$(CHAIN address --role a)"
B_ADDRESS="$(CHAIN address --role b)"
[[ "$(chain_field a "$MINT" configured)" == true ]] || fail "wallet A is not configured on $MINT; run confidential-optin first"

open_wizard "$MINT"

# send_to <recipient> <amount>: runs a transfer and prints the card error (empty on success).
send_to() {
    wallet_ctl 'reset()' >/dev/null
    tag_cards >/dev/null
    card_fill_address "$STEP_TRANSFER" "$1"
    card_fill_amount "$STEP_TRANSFER" "$2"
    if ! card_enabled "$STEP_TRANSFER" "Send confidentially"; then
        echo "(button disabled)"
        return 0
    fi
    run_card "$STEP_TRANSFER" "Send confidentially" || echo "(did not settle)"
}

step "case 1: a recipient that never touched this mint"
FRESH="$(CHAIN new-address)"
ERROR="$(send_to "$FRESH" 1)"
note "no token account: ${ERROR:0:200}"
check "case 1 fails" test -n "$ERROR"
soft_check "case 1 fails before the wallet signs" equals "$(sign_count signTransaction)" 0
# Today: the raw "Solana error #3230000; Decode this error by running npx …".
known_defect HOO-1426 "case 1 says the recipient has no token account" grep -qiE "token account|not exist|not found" <<<"$ERROR"

step "case 2: the recipient's account exists but was never configured"
BARE_OWNER="$(CHAIN new-address)"
CHAIN create-ata --role a --owner "$BARE_OWNER" --mint "$MINT" >/dev/null
ERROR="$(send_to "$BARE_OWNER" 1)"
note "unconfigured account: ${ERROR:0:200}"
check "case 2 names the missing configuration" contains "$ERROR" "is not configured for confidential transfers"
soft_check "case 2 fails before the wallet signs" equals "$(sign_count signTransaction)" 0

step "case 3: the recipient turned confidential credits off"
[[ "$(chain_field b "$MINT" configured)" == true ]] || fail "wallet B is not configured on $MINT; run confidential-optin first"
CHAIN disable-credits --role b --mint "$MINT" >/dev/null
check "on chain: B's credits are off" await_chain b "$MINT" allowConfidentialCredits false
CONTEXTS_BEFORE="$(context_count a)"
ERROR="$(send_to "$B_ADDRESS" 1)"
note "credits off: ${ERROR:0:200}; signed $(sign_count signTransaction) tx"
check "case 3 fails" test -n "$ERROR"
# Today: the wallet signs the whole plan, the last transaction fails with
# {"InstructionError":["0",{"Custom":"25"}]}, and the proof contexts stay open.
known_defect HOO-1426 "case 3 is caught before the wallet signs" equals "$(sign_count signTransaction)" 0
known_defect HOO-1426 "case 3 says the recipient does not accept confidential credits" grep -qiE "credit" <<<"$ERROR"
known_defect HOO-1426 "case 3 strands no proof contexts" equals "$(context_count a)" "$CONTEXTS_BEFORE"
# Step 3 is the UI's way back.
as_wallet b open_wizard "$MINT"
sleep 3
as_wallet b run_step_ok "$STEP_CREDITS" "Enable confidential credits" >/dev/null
check "B re-enables credits from step 3" await_chain b "$MINT" allowConfidentialCredits true
PENDING_BEFORE="$(chain_field b "$MINT" decrypted.pendingBalance)"
ERROR="$(send_to "$B_ADDRESS" 1)"
[[ "$ERROR" == "$RATE_LIMITED_AFTER_SIGNING:"* ]] ||
    check "the transfer goes through once credits are back on" equals "$ERROR" ""
check "on chain: B received it" await_chain b "$MINT" decrypted.pendingBalance "$((PENDING_BEFORE + $(raw 1)))"

step "case 5: malformed recipient addresses"
for bad in "not-base58!" "abc" "${A_ADDRESS:0:20}"; do
    tag_cards >/dev/null
    card_fill_address "$STEP_TRANSFER" "$bad"
    card_fill_amount "$STEP_TRANSFER" 1
    check "'$bad' keeps the transfer button disabled" not card_enabled "$STEP_TRANSFER" "Send confidentially"
done
ERROR="$(send_to "$MINT" 1)"
note "the mint's own address as recipient: ${ERROR:0:200}"
check "sending to the mint's own address fails" test -n "$ERROR"
soft_check "the mint's address is caught before the wallet signs" equals "$(sign_count signTransaction)" 0
known_defect HOO-1426 "the mint's address as recipient gets a readable message" not grep -q "Solana error #" <<<"$ERROR"

step "case 6: self-transfer"
AVAILABLE_BEFORE="$(chain_field a "$MINT" decrypted.availableBalance)"
ERROR="$(send_to "$A_ADDRESS" 1)"
note "self-transfer: ${ERROR:-succeeded}; signed $(sign_count signTransaction) tx"
# Today there is no client-side check: the whole 5-transaction plan is signed.
known_defect HOO-1426 "self-transfer is caught before the wallet signs" equals "$(sign_count signTransaction)" 0
check "a self-transfer moves nothing out of A's available balance" \
    test "$(chain_field a "$MINT" decrypted.availableBalance)" -ge "$((AVAILABLE_BEFORE - $(raw 1)))"

step "case 4: a mint with TransferFeeConfig + ConfidentialTransferFee"
FEE_MINT="$(run_mint fee)"
open_wizard "$FEE_MINT"
sleep 3
run_step_ok "$STEP_CONFIGURE" "Configure account" >/dev/null
card_fill_amount "$STEP_DEPOSIT" 100
run_step_ok "$STEP_DEPOSIT" "Deposit to pending" >/dev/null
run_step_ok "$STEP_APPLY" "Apply pending → available" >/dev/null
check "on chain: A has 100 available on the fee mint" await_chain a "$FEE_MINT" decrypted.availableBalance "$(raw 100)"
as_wallet b open_wizard "$FEE_MINT"
sleep 3
as_wallet b run_step_ok "$STEP_CONFIGURE" "Configure account" >/dev/null
check "on chain: B is configured on the fee mint" await_chain b "$FEE_MINT" configured true
ERROR="$(send_to "$B_ADDRESS" 10)"
note "fee-mint transfer: ${ERROR:-succeeded in $(card_tx_count "$STEP_TRANSFER") tx}"
# A 429 after signing hides the outcome on the card; the chain check below decides.
[[ "$ERROR" == "$RATE_LIMITED_AFTER_SIGNING:"* ]] ||
    check "a confidential transfer on a fee mint succeeds" equals "$ERROR" ""
if [[ "$ERROR" == "$RATE_LIMITED_AFTER_SIGNING:"* ]]; then
    # A 429 after signing can stop the plan part-way, so the chain says nothing
    # either way about fee-mint support.
    note "fee-mint transfer inconclusive: rate-limited after ${ERROR#*:} signed transactions; B holds $(chain_field b "$FEE_MINT" decrypted.pendingBalance) pending"
else
    check "on chain: B's pending balance on the fee mint is non-zero" \
        test "$(chain_field b "$FEE_MINT" decrypted.pendingBalance)" -gt 0
fi

as_wallet b assert_no_page_errors
assert_no_page_errors
finish_flow
