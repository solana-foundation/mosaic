#!/usr/bin/env bash
# e2e: funded
# QA matrix §3a (on-chain half): one Custom Token per extension, plus one with
# Metadata deselected. Each mint's on-chain extension set must be exactly what
# was selected (nothing dropped, nothing extra), and each configured value
# must reach the chain. About 12 mints. Hands the mints to later flows as
# $OUT/mint-custom-<slug>.txt.
FLOW=qa-create-custom
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

SYSTEM_PROGRAM=11111111111111111111111111111111
goto "/"
A="$(wallet_address)"

configure_transfer_fee() { dialog_click "1%" && ab fill "#transferFeeMaximum" "1000000" >/dev/null; }
configure_interest() { ab fill "#interestRate" "550" >/dev/null; }
configure_hook() { ab fill "#transferHookProgramId" "$SYSTEM_PROGRAM" >/dev/null; }
configure_scaled() { ab fill "#scaledUiAmountMultiplier_static" "2.5" >/dev/null; }
configure_frozen() { ab find role button click --name "Frozen New accounts must be thawed before use" >/dev/null; }
configure_optin() { ab find role button click --name "Opt-in Any holder can enable confidential balances themselves" >/dev/null; }

# slug | wizard label | configure function
SINGLES="pausable|Pausable|
delegate|Permanent Delegate|
das|Default Account State|configure_frozen
confidential|Confidential Balances|configure_optin
scaled|Scaled UI Amount|configure_scaled
fee|Transfer Fee|configure_transfer_fee
interest|Interest Bearing|configure_interest
nontransferable|Non-Transferable|
hook|Transfer Hook|configure_hook
acl|SRFC-37 (Token ACL)|"

while IFS='|' read -r slug label CONFIGURE; do
    step "$label alone"
    mint="$(retry_429 create_custom_token "$slug" Metadata "$label")" || fail "$label: creation failed"
    close_result
    printf '%s\n' "$mint" >"$OUT/mint-custom-$slug.txt"
    state="$(mint_json "$mint")"
    printf '%s\n' "$state" >"$OUT/mint-custom-$slug.json"
    check "$label: on-chain extensions are exactly what was selected ($mint)" \
        equals "$(jq -c '.extensions | sort' <<<"$state")" "$(expected_kinds Metadata "$label")"
    check "$label: mint authority is the connected wallet" equals "$(jq -r .mintAuthority <<<"$state")" "$A"
    case "$slug" in
        das) check "Default Account State: Frozen reached the chain" equals "$(jq -r '.extension.DefaultAccountState.state' <<<"$state")" 2 ;;
        confidential) check "Confidential Balances: Opt-in means auto-approve" equals "$(jq -r '.extension.ConfidentialTransferMint.autoApproveNewAccounts' <<<"$state")" true ;;
        scaled) check "Scaled UI Amount: multiplier 2.5 reached the chain" equals "$(jq -r '.extension.ScaledUiAmountConfig.multiplier' <<<"$state")" 2.5 ;;
        fee)
            check "Transfer Fee: 100 bps" equals "$(jq -r '.extension.TransferFeeConfig.newerTransferFee.transferFeeBasisPoints' <<<"$state")" 100
            check "Transfer Fee: maximum 1000000" equals "$(jq -r '.extension.TransferFeeConfig.newerTransferFee.maximumFee' <<<"$state")" 1000000
            ;;
        interest) check "Interest Bearing: 550 bps" equals "$(jq -r '.extension.InterestBearingConfig.currentRate' <<<"$state")" 550 ;;
        hook) check "Transfer Hook: program id round-trips" equals "$(jq -r '.extension.TransferHook.programId' <<<"$state")" "$SYSTEM_PROGRAM" ;;
        acl)
            freeze="$(jq -r .freezeAuthority <<<"$state")"
            check "SRFC-37: freeze authority is a Token-ACL PDA" equals "$(CHAIN account-owner --address "$freeze")" "$TOKEN_ACL_PROGRAM"
            ;;
        *) freeze="$(jq -r .freezeAuthority <<<"$state")"
           check "$label: freeze authority is the connected wallet" equals "$freeze" "$A" ;;
    esac
    sleep 2 # public devnet rate limit
done <<<"$SINGLES"

step "Metadata deselected"
CONFIGURE=""
mint="$(retry_429 create_custom_token nometa Pausable)" || fail "no-metadata creation failed"
close_result
printf '%s\n' "$mint" >"$OUT/mint-custom-nometa.txt"
check "no metadata: only PausableConfig on chain" equals "$(chain_kinds "$mint")" '["PausableConfig"]'

step "the dashboard lists what was created"
goto "/"
for slug in pausable fee acl; do
    check "dashboard has the $slug token" stored_has "$(cat "$OUT/mint-custom-$slug.txt")"
done

assert_no_page_errors
finish_flow
