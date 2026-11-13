#!/usr/bin/env bash
# e2e: funded
# QA matrix §3c combos 4-10: extension combinations nothing in the wizard
# validates. Each run records one of: blocked at the form, errored on submit,
# succeeded but dropped an extension (the case worth catching), or fully
# succeeded. About 8 mints.
FLOW=qa-create-combos
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

SUBMIT="Create Custom Token"
SYSTEM_PROGRAM=11111111111111111111111111111111
goto "/"

# A datetime-local value a day from now.
tomorrow() { date -v+1d '+%Y-%m-%dT%H:%M' 2>/dev/null || date -d '+1 day' '+%Y-%m-%dT%H:%M'; }

# Runs one combo and prints its outcome: "form", "error: …",
# "dropped: <expected> vs <chain>" or "ok <mint>".
combo() {
    local slug="$1"
    shift
    escape_all
    open_wizard "Custom Token"
    wizard_identity "QA combo $slug" "QC$slug"
    ab wait --text "Authority Parameters" >/dev/null
    set_extensions Metadata "$@"
    if has_config_step; then
        dialog_click "Continue" || { echo form; return; }
        ab wait --text "Configuration" >/dev/null
        [[ -z "${CONFIGURE:-}" ]] || "$CONFIGURE"
    fi
    if btn_disabled "$SUBMIT"; then
        echo form
        return
    fi
    local mint
    if ! mint="$(submit_and_read_mint "$SUBMIT" 2>"$OUT/combo-$slug.err")"; then
        local err
        err="$(tail -1 "$OUT/combo-$slug.err")"
        # Raw "Solana error #-32002" hides the program error; pull it out of the encoded context.
        local ctx
        ctx="$(grep -oE "'X19[A-Za-z0-9+/=]+'" <<<"$err" | tr -d "'" | head -1)"
        if [[ -n "$ctx" ]]; then
            err="$err [decoded: $(base64 -d <<<"$ctx" 2>/dev/null | tr '&' '\n' | sed -n 's/^logs=//p' | python3 -c 'import sys, urllib.parse; print(" ".join(l for l in urllib.parse.unquote(sys.stdin.read()).split(",") if "failed" in l))' 2>/dev/null)]"
        fi
        [[ "$err" != *"Failed to sign"* ]] || err="$err [wallet: $(js 'window.__mosaicTestWallet.lastError')]"
        echo "error: $err"
        return 1
    fi
    printf '%s\n' "$mint" >"$OUT/mint-combo-$slug.txt"
    local want got
    want="$(expected_kinds Metadata "$@")"
    got="$(chain_kinds "$mint")"
    if [[ "$want" == "$got" ]]; then echo "ok $mint"; else echo "dropped: want $want, chain $got ($mint)"; fi
}

# A combo, retried when public devnet rate-limited it.
combo_retry() {
    local out attempt
    for attempt in 1 2 3; do
        out="$(combo "$@")" && { echo "$out"; return; }
        is_rate_limited "$out" || { echo "$out"; return; }
        sleep $((attempt * 15))
    done
    echo "$out"
}

record() {
    local what="$1" outcome="$2"
    note "§3c $what → $outcome"
    check "§3c $what: nothing selected is silently dropped" not contains "$outcome" "dropped:"
}

# A combination Token-2022 accepts: it must be created, not just left undropped.
created() { check "§3c $1 is created" contains "$2" "ok "; }

step "§3c 4: Scaled UI Amount, scheduled and rebasing"
scheduled() {
    ab find role button click --name "Scheduled Plan a change" >/dev/null
    ab fill "#scaledUiAmountMultiplier_scheduled" "1" >/dev/null
    ab fill "#scaledUiAmountNewMultiplier" "2" >/dev/null
    set_input scaledUiAmountEffectiveTimestamp "$(tomorrow)"
}
CONFIGURE=scheduled
outcome="$(combo_retry sched "Scaled UI Amount")"
record "scaled UI scheduled" "$outcome"
created "scaled UI scheduled" "$outcome"
if [[ "$outcome" == ok* ]]; then
    cfg="$(mint_field "${outcome#ok }" .extension.ScaledUiAmountConfig)"
    note "scheduled config on chain: $(jq -c . <<<"$cfg")"
    check "scheduled: new multiplier 2 on chain" equals "$(jq -r .newMultiplier <<<"$cfg")" 2
    check "scheduled: effective time is in the future" eval '(( $(jq -r .newMultiplierEffectiveTimestamp <<<"$cfg") > $(date +%s) ))'
fi
rebasing() {
    ab find role button click --name "Rebasing Updates over time" >/dev/null
    ab fill "#scaledUiAmountMultiplier_rebasing" "1.5" >/dev/null
}
CONFIGURE=rebasing
outcome="$(combo_retry rebase "Scaled UI Amount")"
record "scaled UI rebasing" "$outcome"
created "scaled UI rebasing" "$outcome"
[[ "$outcome" != ok* ]] || check "rebasing: multiplier 1.5 on chain" equals "$(mint_field "${outcome#ok }" .extension.ScaledUiAmountConfig.multiplier)" 1.5

step "§3c 5: Transfer Fee at 10000 bps with a cap"
fee_max() { ab fill "#transferFeeBasisPoints" "10000" >/dev/null && ab fill "#transferFeeMaximum" "5000000" >/dev/null; }
CONFIGURE=fee_max
outcome="$(combo_retry fee100 "Transfer Fee")"
record "transfer fee 10000 bps" "$outcome"
created "transfer fee 10000 bps" "$outcome"
[[ "$outcome" != ok* ]] || check "10000 bps reached the chain" equals \
    "$(mint_field "${outcome#ok }" .extension.TransferFeeConfig.newerTransferFee.transferFeeBasisPoints)" 10000

step "§3c 6: Interest Bearing + Scaled UI Amount (two UI-amount extensions)"
ib_scaled() { ab fill "#interestRate" "300" >/dev/null; }
CONFIGURE=ib_scaled
outcome="$(combo_retry ibsc "Interest Bearing" "Scaled UI Amount")"
record "interest bearing + scaled UI" "$outcome"
# Token-2022 rejects the pair (0x33, InvalidExtensionCombination) and the app shows a raw -32002.
known_defect unfiled:s3c-invalid-combos "interest bearing + scaled UI is blocked in the wizard, not by the chain" equals "$outcome" form

step "§3c 7: Non-Transferable + Confidential Balances"
CONFIGURE=""
outcome="$(combo_retry ntcb "Non-Transferable" "Confidential Balances")"
record "non-transferable + confidential" "$outcome"
known_defect unfiled:s3c-invalid-combos "non-transferable + confidential is blocked in the wizard, not by the chain" equals "$outcome" form

step "§3c 8: Confidential Balances + Transfer Hook"
hook() { ab fill "#transferHookProgramId" "$SYSTEM_PROGRAM" >/dev/null; }
CONFIGURE=hook
outcome="$(combo_retry cbth "Confidential Balances" "Transfer Hook")"
record "confidential + transfer hook" "$outcome"
created "confidential + transfer hook" "$outcome"

step "§3c 8b: Confidential Balances + Transfer Fee"
fee_only() { dialog_click "1%" && ab fill "#transferFeeMaximum" "1000000" >/dev/null; }
CONFIGURE=fee_only
outcome="$(combo_retry cbtf "Confidential Balances" "Transfer Fee")"
record "confidential + transfer fee" "$outcome"
# Token-2022 needs a confidential-transfer-fee config for this pair; the app sets none.
known_defect unfiled:s3c-invalid-combos "confidential + transfer fee is created, or blocked in the wizard" \
    eval 'contains "$outcome" "ok " || equals "$outcome" form'

step "§3c 9: Transfer Fee + Interest Bearing + Pausable + Permanent Delegate"
fee_ib() { dialog_click "1%" && ab fill "#transferFeeMaximum" "1000000" >/dev/null && ab fill "#interestRate" "500" >/dev/null; }
CONFIGURE=fee_ib
outcome="$(combo_retry sink "Transfer Fee" "Interest Bearing" "Pausable" "Permanent Delegate")"
record "valid kitchen sink" "$outcome"
check "§3c 9 fully succeeds" contains "$outcome" "ok "

step "§3c 10: every extension that can coexist (transaction size)"
everything() {
    dialog_click "1%"
    ab fill "#transferFeeMaximum" "1000000" >/dev/null
    ab fill "#transferHookProgramId" "$SYSTEM_PROGRAM" >/dev/null
}
CONFIGURE=everything
outcome="$(combo_retry all "Pausable" "Permanent Delegate" "Default Account State" \
    "Scaled UI Amount" "Transfer Fee" "Transfer Hook" "SRFC-37 (Token ACL)")"
# Everything but the pairs Token-2022 refuses (Non-Transferable with fee or
# hook, Interest Bearing with Scaled UI, Confidential with fee): the matrix's
# 1232-byte transaction-size hazard (templates/mmf.ts documents it).
record "every extension that can coexist" "$outcome"
check "the largest valid selection is created" contains "$outcome" "ok "

assert_no_page_errors
finish_flow
