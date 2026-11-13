#!/usr/bin/env bash
# e2e:
# QA matrix §3a (wizard half), §3b, §3d and §8.6: the Custom Token wizard.
# Which extensions open the Configuration step, the two declared conflicts,
# and which layer catches each invalid configuration value: the form (submit
# disabled) or the create call (Creation Failed). The wallet is armed to
# reject before every submit, so nothing can be spent; the sign counter shows
# whether a submit got as far as the wallet.
FLOW=qa-custom-wizard
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

SUBMIT="Create Custom Token"
SYSTEM_PROGRAM=11111111111111111111111111111111

goto "/"

# Opens a fresh Custom Token wizard on its Extensions step with exactly these extensions.
custom_extensions() {
    escape_all
    open_wizard "Custom Token"
    wizard_identity "QA Custom" "QAC"
    ab wait --text "Authority Parameters" >/dev/null
    set_extensions "$@"
}

# Same, then on to the Configuration step.
custom_config() {
    custom_extensions Metadata "$@"
    dialog_click "Continue" || fail "no Configuration step for: $*"
    ab wait --text "Configuration" >/dev/null
}

# Submits the wizard with the wallet armed to reject, and prints where the
# input was stopped: "form" (submit disabled), "create: <error>" (Creation
# Failed before any signature), "wallet" (a transaction reached the wallet) or
# "none" (nothing happened within 30s).
submit_layer() {
    if btn_disabled "$SUBMIT"; then
        echo form
        return
    fi
    arm_reject
    dialog_click "$SUBMIT"
    local deadline=$((SECONDS + 30)) text
    while ((SECONDS < deadline)); do
        if ! no_sign_requests; then
            echo wallet
            return
        fi
        text="$(dialog_text)"
        if [[ "$text" == *"Creation Failed"* ]]; then
            echo "create: $(grep -A1 'Error:' <<<"$text" | tr '\n' ' ' | sed 's/Error: *//; s/  */ /g; s/ *Close *$//')"
            return
        fi
        sleep 0.5
    done
    echo none
}

# Records how an invalid value was caught: never at the wallet (a hard check),
# and ideally at the form (§10 row 5, unfiled, says numeric rules only fire on submit).
expect_rejected() {
    local what="$1" layer="$2" want_msg="$3"
    note "$what → $layer"
    check "$what never reaches the wallet" not equals "$layer" wallet
    check "$what is rejected" not equals "$layer" none
    if [[ "$layer" == create:* ]]; then
        check "$what: the error names the rule ('$want_msg')" contains "$layer" "$want_msg"
    fi
    known_defect unfiled:row5-inline-validation "$what is caught by the form, before submit" equals "$layer" form
}

step "§3a: which extensions open the Configuration step"
custom_extensions Metadata
check "Metadata alone: two steps (submit on the Extensions step)" btn_present "$SUBMIT"
for ext in "Pausable" "Permanent Delegate" "Non-Transferable"; do
    set_extensions Metadata "$ext"
    check "$ext: no Configuration step" btn_present "$SUBMIT"
done
for ext in "Transfer Fee" "Interest Bearing" "Transfer Hook" "SRFC-37 (Token ACL)" "Scaled UI Amount" \
    "Default Account State" "Confidential Balances"; do
    set_extensions Metadata "$ext"
    check "$ext: opens the Configuration step" has_config_step
done
set_extensions "Pausable"
check "Metadata can be deselected" not contains "$(selected_extensions)" "Metadata"
check "a token without Metadata can still be submitted" btn_enabled "$SUBMIT"

step "§3b: declared conflicts block the wizard"
for other in "Transfer Fee" "Transfer Hook"; do
    set_extensions Metadata "Non-Transferable" "$other"
    text="$(dialog_text)"
    check "Non-Transferable + $other: amber alert" contains "$text" "Non-transferable tokens cannot have transfer fees or transfer hooks"
    check "Non-Transferable + $other: both badges destructive" equals \
        "$(js '[...document.querySelectorAll("[role=dialog] [data-slot=badge]")].filter(b => b.classList.contains("bg-destructive")).length')" 2
    check "Non-Transferable + $other: Continue is disabled" btn_disabled "Continue"
done

step "§3d: Transfer Hook"
custom_config "Transfer Hook"
check "blank program ID disables submit" btn_disabled "$SUBMIT"
ab fill "#transferHookProgramId" "not-a-program" >/dev/null
expect_rejected "transfer hook program ID 'not-a-program'" "$(submit_layer)" "valid Solana address"
custom_config "Transfer Hook"
ab fill "#transferHookProgramId" "$SYSTEM_PROGRAM" >/dev/null
check "a valid program ID enables submit" btn_enabled "$SUBMIT"

step "§3d: Transfer Fee"
custom_config "Transfer Fee"
for preset in "0.1%:10" "0.5%:50" "1%:100" "2%:200" "5%:500"; do
    dialog_click "${preset%%:*}"
    check "fee preset ${preset%%:*} sets ${preset#*:} bps" equals "$(js 'document.getElementById("transferFeeBasisPoints").value')" "${preset#*:}"
done
check "a fee without a maximum cap disables submit" btn_disabled "$SUBMIT"
ab fill "#transferFeeMaximum" "100000000" >/dev/null
dialog_click "1%"
check "preview: 1% of 1,000 tokens is a 10 token fee" eventually 3 eval 'contains "$(dialog_text)" "10 tokens"'
check "a fee with a cap enables submit" btn_enabled "$SUBMIT"
ab fill "#transferFeeBasisPoints" "10001" >/dev/null
expect_rejected "transfer fee 10001 bps" "$(submit_layer)" "between 0 and 10000"

step "§3d: Interest Bearing"
custom_config "Interest Bearing"
for preset in "1%:100" "3%:300" "5%:500" "8%:800" "10%:1000"; do
    dialog_click "${preset%%:*}"
    check "rate preset ${preset%%:*} sets ${preset#*:} bps" equals "$(js 'document.getElementById("interestRate").value')" "${preset#*:}"
done
ab fill "#interestRate" "-5" >/dev/null
expect_rejected "interest rate -5 bps" "$(submit_layer)" "greater than or equal to zero"

step "§3d: Scaled UI Amount"
custom_config "Scaled UI Amount"
ab fill "#scaledUiAmountMultiplier_static" "0" >/dev/null
expect_rejected "scaled UI multiplier 0" "$(submit_layer)" "greater than zero"
custom_config "Scaled UI Amount"
ab fill "#scaledUiAmountMultiplier_static" "-1" >/dev/null
expect_rejected "scaled UI multiplier -1" "$(submit_layer)" "greater than zero"
custom_config "Scaled UI Amount"
ab find role button click --name "Scheduled Plan a change" >/dev/null
expect_rejected "scheduled scaled UI without an effective time" "$(submit_layer)" "effective date"
custom_config "Scaled UI Amount"
ab find role button click --name "Scheduled Plan a change" >/dev/null
set_input scaledUiAmountEffectiveTimestamp "2020-01-01T00:00"
expect_rejected "scheduled scaled UI in the past" "$(submit_layer)" "in the future"

step "§3d: Confidential Balances auditor key"
custom_config "Confidential Balances"
ab fill "#custom-token-auditorElgamalPubkey" "not-a-key" >/dev/null
check "an invalid auditor key disables submit" btn_disabled "$SUBMIT"
set_input custom-token-auditorElgamalPubkey ""
check "an empty auditor key is allowed" btn_enabled "$SUBMIT"

escape_all
check "no transaction reached the wallet during the whole flow" no_sign_requests
assert_no_page_errors
finish_flow
