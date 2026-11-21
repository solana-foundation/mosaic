#!/usr/bin/env bash
# e2e: funded
# HOO-1429: interrupted multi-transaction plans.
#
# A version-0 transfer is 5 transactions (one per proof context, two for the
# range proof, then the transfer that also closes the contexts) and a withdraw
# is 4. The test wallet rejects the Nth one as a user would, and chain-confidential.mjs
# counts the proof-context accounts left open: their rent (~0.0078 SOL per
# transfer) is only refunded by the plan's final transaction.
#
# Needs wallets A and B configured on the opt-in mint with an available balance
# on A (confidential-optin.sh). Spends devnet SOL, and strands context rent on
# purpose when a middle transaction is rejected.
FLOW=confidential-interrupt
source "$(dirname "$0")/../lib.sh"
source "$(dirname "$0")/../lib-confidential.sh"

MINT="$(run_mint opt-in)"
B_ADDRESS="$(CHAIN address --role b)"
[[ "$(chain_field a "$MINT" configured)" == true ]] || fail "wallet A is not configured on $MINT; run confidential-optin first"
[[ "$(chain_field b "$MINT" configured)" == true ]] || fail "wallet B is not configured on $MINT; run confidential-optin first"

open_wizard "$MINT"

# Highest "Sending n/N" the card showed while a plan ran, as "n/N".
watch_progress() {
    local step="$1" seen="" text start=$SECONDS
    # Proof generation runs before the first prompt, so "Sending" can take a moment.
    until [[ "$(card_text "$step")" == *"Sending"* ]] || ((SECONDS - start > 30)); do sleep 0.5; done
    while :; do
        text="$(card_text "$step")"
        [[ "$text" =~ Sending\ ([0-9]+/[0-9]+) ]] && seen="${BASH_REMATCH[1]}"
        [[ "$text" == *"Sending"* ]] || break
        sleep 0.5
    done
    printf '%s' "$seen"
}

# click_and_watch <step> <label> <timeout>: clicks, records the progress, and
# waits for the card to settle, retrying a build-time devnet 429 (see run_card
# in lib.sh). Sets PROGRESS and ERROR.
click_and_watch() {
    local step="$1" label="$2" timeout="$3" attempt
    for attempt in 1 2 3 4; do
        card_run "$label"
        PROGRESS="$(watch_progress "$step")"
        card_settle "$step" "$timeout" >/dev/null || fail "$label did not settle"
        ERROR="$(card_error "$step")"
        if [[ -n "$ERROR" ]] && is_rate_limited "$ERROR" && [[ "$(sign_count signTransaction)" == 0 ]] && ((attempt < 4)); then
            printf 'xfail\t%s\t%s\n' "$FLOW" "HOO-1429: a 429 while building step $step surfaces as a raw 'Solana error #8100002' instead of being retried" >>"$RESULTS"
            sleep $((10 * attempt))
            continue
        fi
        return 0
    done
}

# interrupted <step> <label> <reject at> [address] <amount>
interrupted() {
    local step="$1" label="$2" at="$3" address="$4" amount="$5"
    local contexts_before error progress stranded
    contexts_before="$(context_count a)"
    wallet_ctl 'reset()' >/dev/null
    tag_cards >/dev/null
    [[ -n "$address" ]] && card_fill_address "$step" "$address"
    card_fill_amount "$step" "$amount"
    wallet_ctl "rejectSignTransaction($at)" >/dev/null
    click_and_watch "$step" "$label" 120
    progress="$PROGRESS" error="$ERROR"
    if [[ -z "$error" ]]; then
        # The plan finished before reaching transaction $at: at version 1 plans
        # are short enough for that. Nothing was interrupted, so nothing to check.
        note "$label: the plan had fewer than $at transactions (v$TX_VERSION); the rejection never fired"
        wallet_ctl 'reset()' >/dev/null
        return 0
    fi
    stranded="$(($(context_count a) - contexts_before))"
    note "$label, wallet rejects tx $at: last progress '${progress:-none}', $stranded contexts left open, error: ${error:0:160}"
    check "$label: rejecting tx $at fails the step" test -n "$error"
    # Today the card says "Failed to sign transaction 1 of 1" for a user
    # rejection at any position in the plan.
    known_defect HOO-1429 "$label: a rejection at tx $at reads as a rejection" grep -qiE "reject|declin|cancel" <<<"$error"
    if ((at > 1)); then
        known_defect HOO-1429 "$label: the card says which transaction failed (tx $at)" grep -qE "\b$at\b" <<<"$error"
        known_defect HOO-1429 "$label: rejecting tx $at strands no proof-context rent" equals "$stranded" 0
    else
        check "$label: rejecting the first tx leaves nothing behind" equals "$stranded" 0
    fi
}

# Rejection points: the first, a middle and the last transaction of the plan.
# A version-1 transfer is much shorter, so it gets the first and the second.
if [[ "$TX_VERSION" == 0 ]]; then REJECT_AT=(1 3 "$TRANSFER_TXS_V0"); else REJECT_AT=(1 2); fi

step "transfer: the wallet rejects transaction ${REJECT_AT[*]}"
PENDING_B="$(chain_field b "$MINT" decrypted.pendingBalance)"
AVAILABLE_A="$(chain_field a "$MINT" decrypted.availableBalance)"
COMPLETED=0
for at in "${REJECT_AT[@]}"; do
    BEFORE="$(chain_field a "$MINT" decrypted.availableBalance)"
    interrupted "$STEP_TRANSFER" "Send confidentially" "$at" "$B_ADDRESS" 1
    [[ "$(chain_field a "$MINT" decrypted.availableBalance)" == "$BEFORE" ]] || COMPLETED=$((COMPLETED + 1))
done
# A plan shorter than the rejection point completes, and moves 1 each time.
check "on chain: interrupted transfers moved nothing out of A" \
    equals "$(chain_field a "$MINT" decrypted.availableBalance)" "$((AVAILABLE_A - COMPLETED * $(raw 1)))"
check "on chain: B received only the transfers that completed" \
    equals "$(chain_field b "$MINT" decrypted.pendingBalance)" "$((PENDING_B + COMPLETED * $(raw 1)))"
PENDING_B="$(chain_field b "$MINT" decrypted.pendingBalance)"

step "a clean retry afterwards goes through once, with an accurate progress count"
wallet_ctl 'reset()' >/dev/null
tag_cards >/dev/null
card_fill_address "$STEP_TRANSFER" "$B_ADDRESS"
card_fill_amount "$STEP_TRANSFER" 1
click_and_watch "$STEP_TRANSFER" "Send confidentially" 300
check "the retry succeeds" equals "$ERROR" ""
soft_check "the progress count ends at the plan's length ($PROGRESS)" \
    equals "${PROGRESS#*/}" "$(card_tx_count "$STEP_TRANSFER")"
check "on chain: B received exactly 1 (no double charge)" \
    await_chain b "$MINT" decrypted.pendingBalance "$((PENDING_B + $(raw 1)))"

step "withdraw: the wallet rejects a middle transaction"
interrupted "$STEP_WITHDRAW" "Withdraw available → public" 2 "" 1

step "leaving the page mid-plan"
# At version 1 the plan may be a single transaction, with no "middle" to leave in.
CONTEXTS_BEFORE="$(context_count a)"
wallet_ctl 'reset()' >/dev/null
wallet_ctl 'delaySignMs(1500)' >/dev/null
tag_cards >/dev/null
card_fill_address "$STEP_TRANSFER" "$B_ADDRESS"
card_fill_amount "$STEP_TRANSFER" 1
card_run "Send confidentially"
ab wait --text "Sending ${REJECT_AT[1]}/" --timeout 60000 >/dev/null || true
goto "/"
sleep 20
STRANDED="$(($(context_count a) - CONTEXTS_BEFORE))"
note "navigating away at tx ${REJECT_AT[1]} (v$TX_VERSION) left $STRANDED proof contexts open"
known_defect HOO-1429 "navigating away mid-transfer strands no proof-context rent" equals "$STRANDED" 0

step "two plans at once: start a transfer, then click withdraw"
open_wizard "$MINT"
CONTEXTS_BEFORE="$(context_count a)"
wallet_ctl 'reset()' >/dev/null
wallet_ctl 'delaySignMs(1500)' >/dev/null
card_fill_address "$STEP_TRANSFER" "$B_ADDRESS"
card_fill_amount "$STEP_TRANSFER" 1
card_fill_amount "$STEP_WITHDRAW" 1
card_run "Send confidentially"
sleep 2
card_run "Withdraw available → public"
TRANSFER="$(card_settle "$STEP_TRANSFER" 300 >/dev/null && { card_error "$STEP_TRANSFER" || true; })"
WITHDRAW="$(card_settle "$STEP_WITHDRAW" 300 >/dev/null && { card_error "$STEP_WITHDRAW" || true; })"
note "concurrent transfer: ${TRANSFER:-succeeded}; concurrent withdraw: ${WITHDRAW:-succeeded}"
soft_check "concurrent plans leave no proof contexts open" equals "$(context_count a)" "$CONTEXTS_BEFORE"
wallet_ctl 'reset()' >/dev/null

ab errors --clear >/dev/null
finish_flow
