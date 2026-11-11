#!/usr/bin/env bash
# e2e:
# QA matrix §4 and §8.12: token import, and the manage page for a mint this
# browser has never seen. Imports devnet fixtures created by another wallet.
# Spends nothing.
FLOW=qa-import
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

CONFIDENTIAL="$(fixture confidential)" # detected as no known template
ARCADE="$(fixture arcade)"
STABLECOIN="$(fixture stablecoin)"

goto "/"
clear_dashboard

step "import is reachable from an empty dashboard (§10 row 22, fixed by #114)"
check "the empty dashboard offers Import existing token" btn_present "Import existing token"

step "invalid address"
open_import
check "Import Token is disabled with no address" btn_disabled "Import Token"
ab find label "Token Address" fill "not-an-address" >/dev/null
ab find role button click --name "Import Token" >/dev/null
check "an invalid address is rejected" eventually 5 eval 'contains "$(dialog_text)" "Invalid Solana address format"'
known_defect unfiled:import-error-prefix "a format error is not announced as a failed import" \
    not_contains "$(dialog_text)" "Failed to import token."
escape_all

step "valid import with an explicit Token Type"
import_token "$CONFIDENTIAL" "Stablecoin"
check "the modal closes itself after success" eventually 6 eval 'equals "$(dialog_text)" ""'
check "the token is stored in mosaic_tokens" stored_has "$CONFIDENTIAL"
name="$(stored_tokens | jq -r --arg m "$CONFIDENTIAL" '.[] | select(.address == $m) | .name')"
check "the dashboard shows a card for it ($name)" eventually 5 eval 'contains "$(main_text)" "$name"'
card_type="$(js "[...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.innerText === 'Type')?.parentElement?.innerText ?? ''" | tr '\n' ' ')"
note "card type for an undetected mint imported as Stablecoin: '$card_type'"
known_defect unfiled:import-type-merge "the chosen Token Type is what the card shows" not_contains "$card_type" "Unknown +1"

step "a mint created by another wallet is listed under this one"
creator="$(stored_tokens | jq -r --arg m "$CONFIDENTIAL" '.[] | select(.address == $m) | .creatorWallet')"
check "creatorWallet is the connected wallet, not the mint's creator (§8.12)" equals "$creator" "$(wallet_address)"

step "re-import asks before overwriting"
stub_confirm true
import_token "$CONFIDENTIAL"
check "re-import asks for confirmation" equals "$(confirm_calls)" 1
check "the question says the token already exists" contains "$(confirm_last)" "already exists in your dashboard"
note "re-import uses a native window.confirm, unlike every other dialog in the app (§4 UX defect)"
ab wait --text "Successfully Imported" >/dev/null 2>&1 || true
escape_all

step "a detected template keeps its type"
import_token "$ARCADE" "Arcade Token"
check "the arcade fixture is stored with its pattern" contains "$(stored_tokens | jq -c --arg m "$ARCADE" '.[] | select(.address == $m) | .detectedPatterns')" "arcade-token"

step "§8.12: /manage for a mint this browser has not imported"
goto "/manage/$STABLECOIN"
wait_slow "Token Not Found"
check "an unknown mint shows Token Not Found" contains "$(main_text)" "Token Not Found"
check "Token Not Found offers Import this token" btn_present "Import this token"
dom_click "Import this token"
ab wait --text "Import Existing Token" >/dev/null
prefilled="$(js 'document.querySelector("[role=dialog] input")?.value ?? ""')"
soft_check "the import modal is prefilled with the mint" equals "$prefilled" "$STABLECOIN"
[[ "$prefilled" == "$STABLECOIN" ]] || ab find label "Token Address" fill "$STABLECOIN" >/dev/null
ab find role button click --name "Import Token" >/dev/null
wait_slow "Successfully Imported"
check "after importing, the manage page loads the token" eventually 30 eval 'contains "$(main_text)" "Token Overview"'

assert_no_page_errors
finish_flow
