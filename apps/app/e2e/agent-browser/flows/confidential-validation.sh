#!/usr/bin/env bash
# e2e: funded
# HOO-1427: amount validation on deposit, transfer and withdraw.
# HOO-1428: step ordering and re-runs on a configured account.
#
# The rule for every bad input: rejected before the wallet is asked to sign,
# with a message that names the constraint. The client-side check is only
# `parseFloat(x) > 0` (use-input-validation.ts), so decimals beyond the mint's,
# values beyond u64 and over-balance amounts all reach the planner; this flow
# records what each one does.
#
# Needs wallet A configured with an available balance (confidential-optin.sh
# leaves 75) and B configured. Spends devnet SOL only where a case slips through.
FLOW=confidential-validation
source "$(dirname "$0")/../lib.sh"
source "$(dirname "$0")/../lib-confidential.sh"

MINT="$(run_mint opt-in)"
B_ADDRESS="$(CHAIN address --role b)"
[[ "$(chain_field a "$MINT" configured)" == true ]] || fail "wallet A is not configured on $MINT; run confidential-optin first"
AVAILABLE_RAW="$(chain_field a "$MINT" decrypted.availableBalance)"
PUBLIC_RAW="$(chain_field a "$MINT" publicBalance)"
AVAILABLE=$((AVAILABLE_RAW / 1000000))
PUBLIC=$((PUBLIC_RAW / 1000000))
echo "wallet A: $PUBLIC public, $AVAILABLE available"

open_wizard "$MINT"

# try_amount <step> <button label> <amount> <what> [known-defect ticket]
# Passes when the wallet saw no transaction: the button stayed disabled, or the
# click produced an error before signing.
try_amount() {
    local step="$1" label="$2" amount="$3" what="$4" ticket="${5:-}" outcome error
    wallet_ctl 'reset()' >/dev/null
    tag_cards >/dev/null
    [[ "$step" == "$STEP_TRANSFER" ]] && card_fill_address "$step" "$B_ADDRESS"
    card_fill_amount "$step" "$amount"
    if ! card_enabled "$step" "$label"; then
        outcome="button disabled"
    else
        if error="$(run_card "$step" "$label" 120)"; then
            outcome="${error:+error: ${error:0:120}}"
            [[ -n "$outcome" ]] || outcome="SUCCEEDED"
        else
            outcome="did not settle"
        fi
    fi
    local signed
    signed="$(sign_count signTransaction)"
    note "step $step, $what ($amount): $outcome; wallet asked to sign $signed tx"
    if [[ -n "$ticket" ]]; then
        known_defect "$ticket" "step $step rejects $what without a transaction" equals "$signed" 0
    else
        soft_check "step $step rejects $what without a transaction" equals "$signed" 0
    fi
    # A rejected case leaves its value in the field; clear it for the next one.
    card_fill_amount "$step" "" 2>/dev/null || true
}

# Deposit has no client-side balance check: the over-balance deposit is signed,
# sent, fails on chain (the fee is spent) and the card shows the raw
# "Transaction … failed: {"InstructionError"…}".
for spec in \
    "$STEP_DEPOSIT|Deposit to pending|$((PUBLIC + 1))|more than the public balance|HOO-1427" \
    "$STEP_TRANSFER|Send confidentially|$((AVAILABLE + 1))|more than the available balance|" \
    "$STEP_WITHDRAW|Withdraw available → public|$((AVAILABLE + 1))|more than the available balance|"; do
    IFS='|' read -r s label over what ticket <<<"$spec"
    step "step $s ($label)"
    try_amount "$s" "$label" 0 "zero"
    try_amount "$s" "$label" -5 "a negative amount"
    try_amount "$s" "$label" abc "non-numeric input"
    try_amount "$s" "$label" 1.1234567 "more decimals than the mint's 6"
    try_amount "$s" "$label" 99999999999999999999 "a value beyond u64"
    try_amount "$s" "$label" "$over" "$what" "$ticket"
done

step "out-of-order steps on a configured account"
# Empty with a non-zero available balance: step 8 before step 7. Re-read the
# balance: a case above that slipped through may have moved tokens.
AVAILABLE_RAW="$(chain_field a "$MINT" decrypted.availableBalance)"
AVAILABLE=$((AVAILABLE_RAW / 1000000))
wallet_ctl 'reset()' >/dev/null
tag_cards >/dev/null
CONTEXTS_BEFORE="$(context_count a)"
EMPTY_ERROR="$(run_card "$STEP_EMPTY" "Empty confidential balance" 180 || true)"
note "empty with $AVAILABLE available: ${EMPTY_ERROR:-no error}; signed $(sign_count signTransaction) tx"
check "empty refuses a non-zero available balance" test -n "$EMPTY_ERROR"
# Today it says "cryptographic component mismatch".
known_defect HOO-1428 "empty with a balance says to withdraw first" grep -qiE "withdraw|not zero|non-zero|balance" <<<"$EMPTY_ERROR"
soft_check "empty with a balance asks the wallet for nothing" equals "$(sign_count signTransaction)" 0
soft_check "empty with a balance leaves no proof contexts" equals "$(context_count a)" "$CONTEXTS_BEFORE"
check "the available balance survives the refused empty" \
    equals "$(chain_field a "$MINT" decrypted.availableBalance)" "$AVAILABLE_RAW"

step "re-running completed steps"
check "configure cannot run twice" not card_enabled "$STEP_CONFIGURE" "Configure account"
wallet_ctl 'reset()' >/dev/null
# Whether this should be refused is the same product call HOO-1428 raises for
# step 3, so it is recorded rather than asserted.
APPLY_ERROR="$(run_card "$STEP_APPLY" "Apply pending → available" 120 || true)"
note "apply with nothing pending: ${APPLY_ERROR:-succeeded}; signed $(sign_count signTransaction) tx"

assert_no_page_errors
finish_flow
