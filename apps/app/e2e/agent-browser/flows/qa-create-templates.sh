#!/usr/bin/env bash
# e2e: funded
# QA matrix §2 (on-chain half) and §8.2: the three templates, created with
# their defaults and checked against chain. A stablecoin created with
# Allowlist shows whether the Access Control Mode choice reaches the chain.
# About 4 mints. Hands them on as $OUT/mint-<template>.txt.
FLOW=qa-create-templates
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

goto "/"
A="$(wallet_address)"

create_template() {
    local template="$1" name="$2" symbol="$3" submit="$4"
    escape_all
    open_wizard "$template"
    wizard_identity "$name" "$symbol"
    sleep 0.5
    [[ -z "${FEATURES:-}" ]] || "$FEATURES"
    dialog_click "Continue"
    ab wait --text "Authority Parameters" >/dev/null
    submit_and_read_mint "$submit"
}

# The template's on-chain extension set and authorities against the fixture of the same kind.
check_template() {
    local kind="$1" fixture_key="$2" mint="$3" state
    state="$(mint_json "$mint")"
    printf '%s\n' "$state" >"$OUT/mint-$kind.json"
    check "$kind: on-chain extensions match the template ($mint)" equals \
        "$(jq -c '.extensions | sort' <<<"$state")" "$(jq -c ".mints[\"$fixture_key\"].extensions | sort" "$FIXTURES")"
    check "$kind: mint authority is the connected wallet" equals "$(jq -r .mintAuthority <<<"$state")" "$A"
    check "$kind: freeze authority is set (HOO-626 watch item)" not equals "$(jq -r '.freezeAuthority // ""' <<<"$state")" ""
    check "$kind: decimals 6" equals "$(jq -r .decimals <<<"$state")" 6
    check "$kind: supply 0" equals "$(jq -r .supply <<<"$state")" 0
}

step "arcade token"
FEATURES=""
start=$SECONDS
mint="$(retry_429 create_template "Arcade Token" "QA Arcade" "QARC" "Create Arcade Token")" || fail "arcade creation failed"
note "arcade: submit to success in $((SECONDS - start))s (its form has a 60s confirmation timeout)"
close_result
printf '%s\n' "$mint" >"$OUT/mint-arcade.txt"
check_template arcade arcade "$mint"
check "arcade: no ConfidentialTransferMint" not contains "$(cat "$OUT/mint-arcade.json")" ConfidentialTransferMint

step "tokenized security, multiplier 2.5"
security_features() { ab find label "Display Multiplier" fill "2.5" >/dev/null; }
FEATURES=security_features
mint="$(retry_429 create_template "Tokenized Security" "QA Security" "QSEC" "Create Tokenized Security")" || fail "security creation failed"
close_result
printf '%s\n' "$mint" >"$OUT/mint-security.txt"
check_template security security "$mint"
check "security: multiplier 2.5 reached the chain" equals "$(jq -r '.extension.ScaledUiAmountConfig.multiplier' "$OUT/mint-security.json")" 2.5
check "security: freeze authority is the connected wallet" equals "$(jq -r .freezeAuthority "$OUT/mint-security.json")" "$A"

step "stablecoin, defaults"
FEATURES=""
mint="$(retry_429 create_template "Stablecoin" "QA Stable" "QUSD" "Create Stablecoin")" || fail "stablecoin creation failed"
close_result
printf '%s\n' "$mint" >"$OUT/mint-stablecoin.txt"
check_template stablecoin stablecoin "$mint"
check "stablecoin: default account state Initialized" equals "$(jq -r '.extension.DefaultAccountState.state' "$OUT/mint-stablecoin.json")" 1
check "stablecoin: Manage Token link lands on the mint" eval 'goto "/manage/$mint" && wait_slow "Token Overview" && contains "$(main_text)" "Token Overview"'
goto "/"

step "§8.2: stablecoin with Access Control Mode = Allowlist"
stable_allowlist() { ab find role button click --name "Allowlist Only approved addresses can transfer" >/dev/null; }
FEATURES=stable_allowlist
mint="$(retry_429 create_template "Stablecoin" "QA Stable AL" "QUSDA" "Create Stablecoin")" || fail "allowlist stablecoin creation failed"
close_result
printf '%s\n' "$mint" >"$OUT/mint-stablecoin-allowlist.txt"
freeze="$(mint_field "$mint" .freezeAuthority)"
owner="$(CHAIN account-owner --address "$freeze")"
note "stablecoin with Allowlist: freeze authority $freeze, owned by $owner"
known_defect unfiled:srfc37-templates "a stablecoin created with Allowlist is put under Token ACL" equals "$owner" "$TOKEN_ACL_PROGRAM"

assert_no_page_errors
finish_flow
