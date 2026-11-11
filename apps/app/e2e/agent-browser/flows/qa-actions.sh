#!/usr/bin/env bash
# e2e: funded
# QA matrix §6 (success paths) and §8.8: every Admin Actions item on a fresh
# Custom token (Metadata, Pausable, Permanent Delegate; wallet A holds every
# authority), each checked on chain. Wallet B is only a destination and never
# signs, so it needs no session. Ends with a tokenized security for the
# permissioned-burn and scaled-UI checks. About 2 mints, a few dozen fees.
FLOW=qa-actions
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

goto "/"
A="$(wallet_address)"
B="$(CHAIN address --role b)"
MEMO="qa memo $(date +%s)"

bal() { CHAIN token --role a --mint "$MINT" --owner "$1" | jq -r '.publicBalance // "none"'; }
frozen() { CHAIN token --role a --mint "$MINT" --owner "$1" | jq -r 'if has("frozen") then .frozen else "none" end'; }

step "create the token under test"
CONFIGURE=""
MINT="$(retry_429 create_custom_token actions Metadata Pausable "Permanent Delegate")" || fail "creation failed"
close_result
printf '%s\n' "$MINT" >"$OUT/mint-actions.txt"
open_manage "$MINT"
WANT_MENU="Mint Tokens,Transfer Tokens,Burn Tokens,Update Metadata,Force Transfer,Force Burn,Freeze Account,Thaw Account,Close Token Account,Pause Token,Remove from Storage"
eventually 20 eval 'equals "$(admin_menu_items)" "$WANT_MENU"' || note "menu: $(admin_menu_items)"
check "all authority-gated items are offered" equals "$(admin_menu_items)" "$WANT_MENU"

step "mint 100 to the connected wallet"
fill_mint() { dom_click "Use my wallet" && ab find placeholder "Enter amount to mint..." fill "100" >/dev/null; }
ui_action "Mint Tokens succeeds" "Mint Tokens" fill_mint "Mint Tokens" "minted successfully"
check "wallet A holds 100 on chain" await_value 60 "$(raw 100)" bal "$A"
check "supply is 100 on chain" equals "$(mint_field "$MINT" .supply)" "$(raw 100)"
goto "/manage/$MINT"
wait_slow "Token Overview"
check "the overview shows supply 100" eventually 20 eval 'equals "$(overview_value Supply | tr -d ,)" 100'

step "transfer 10 to wallet B with a memo"
fill_transfer() {
    ab find placeholder "Enter recipient Solana address..." fill "$B" >/dev/null
    ab find placeholder "Enter amount to send..." fill "10" >/dev/null
    ab find placeholder "Add a memo to the transaction..." fill "$MEMO" >/dev/null
}
ui_action "Transfer Tokens succeeds" "Transfer Tokens" fill_transfer "Send Tokens" "Transfer Successful"
check "wallet B holds 10 on chain" await_value 60 "$(raw 10)" bal "$B"
check "wallet A holds 90" equals "$(bal "$A")" "$(raw 90)"
b_ata="$(CHAIN token --role a --mint "$MINT" --owner "$B" | jq -r .tokenAccount)"
check "the memo is on chain" eventually 30 eval 'contains "$(CHAIN memos --address "$b_ata")" "$MEMO"'

step "burn 5"
fill_burn() { ab find placeholder "Enter amount to burn..." fill "5" >/dev/null; }
ui_action "Burn Tokens succeeds" "Burn Tokens" fill_burn "Burn Tokens" "burned successfully"
check "wallet A holds 85" await_value 60 "$(raw 85)" bal "$A"

step "freeze and thaw wallet B by wallet address"
fill_freeze() { ab find label "Wallet Address" fill "$B" >/dev/null 2>&1 || ab fill "[role=alertdialog] input" "$B" >/dev/null; }
ui_action "Freeze Account succeeds" "Freeze Account" fill_freeze "Freeze Account" "Account Frozen"
check "B's token account is frozen on chain" await_value 60 true frozen "$B"
ui_action "Thaw Account succeeds" "Thaw Account" fill_freeze "Thaw Account" "Account Thawed"
check "B's token account is thawed on chain" await_value 60 false frozen "$B"

step "force transfer and force burn from wallet B's account"
fill_force_same() {
    ab find placeholder "Enter source wallet address..." fill "$B" >/dev/null
    ab find placeholder "Enter destination wallet address..." fill "$B" >/dev/null
    ab find placeholder "Enter amount to transfer..." fill "1" >/dev/null
}
admin_action "Force Transfer"
arm_reject
fill_force_same
sleep 0.3
if btn_enabled "Force Transfer"; then
    dialog_click "Force Transfer"
    sleep 5
fi
note "force transfer with source == destination: submit $(button_state "Force Transfer"); dialog: $(dialog_text | grep -iE 'same|error|fail' | head -1)"
check "source == destination never reaches the wallet" no_sign_requests
wallet_ctl 'reset()' >/dev/null
escape_all
eventually 5 eval 'equals "$(dialog_text)" ""' || escape_all
fill_force() {
    ab find placeholder "Enter source wallet address..." fill "$B" >/dev/null
    ab find placeholder "Enter destination wallet address..." fill "$A" >/dev/null
    ab find placeholder "Enter amount to transfer..." fill "3" >/dev/null
}
ui_action "Force Transfer succeeds" "Force Transfer" fill_force "Force Transfer" "Force Transfer Successful"
check "B holds 7 after the force transfer" await_value 60 "$(raw 7)" bal "$B"
check "A holds 88" equals "$(bal "$A")" "$(raw 88)"
fill_force_burn() {
    ab find placeholder "Enter wallet or token account address..." fill "$B" >/dev/null
    ab find placeholder "Enter amount to burn..." fill "2" >/dev/null
}
ui_action "Force Burn succeeds" "Force Burn" fill_force_burn "Force Burn" "Force Burn Successful"
check "B holds 5 after the force burn" await_value 60 "$(raw 5)" bal "$B"

step "pause and unpause"
admin_action "Pause Token"
dialog_click "Confirm Pause"
check "the mint is paused on chain" await_value 60 true mint_field "$MINT" .extension.PausableConfig.paused
escape_all
check "the menu now offers Unpause Token" eventually 20 eval 'contains "$(admin_menu_items)" "Unpause Token"'
arm_reject
check "Transfer Tokens on a paused token fails" not action "Transfer Tokens" fill_transfer "Send Tokens" "Transfer Successful"
note "transfer while paused says: $(grep -iE 'error|fail|paus' <<<"$LAST_ACTION_TEXT" | head -2 | tr '\n' ' ')"
known_defect unfiled:row1-paused-actions "a transfer on a paused token says the token is paused" contains "$LAST_ACTION_TEXT" "paused"
wallet_ctl 'reset()' >/dev/null
admin_action "Unpause Token"
dialog_click "Confirm Unpause"
check "the mint is unpaused on chain" await_value 60 false mint_field "$MINT" .extension.PausableConfig.paused
escape_all

step "update metadata: symbol only (HOO-955)"
fill_symbol() { ab fill "[role=alertdialog] input >> nth=1" "QNEW" >/dev/null 2>&1 || set_input "$(js '[...document.querySelectorAll("[role=alertdialog] input")][1]?.id ?? ""')" "QNEW"; }
admin_action "Update Metadata"
fill_symbol
sleep 0.3
submit="$(js '[...document.querySelectorAll("[role=alertdialog] button")].map(b => b.innerText.trim()).filter(t => /Update/.test(t))[0] ?? ""')"
[[ -z "$submit" ]] || dialog_click "$submit" || true
sleep 8
note "update metadata says: $(dialog_text | grep -iE 'error|fail|success|missing' | head -1)"
escape_all
known_defect HOO-955 "the new symbol reaches the chain" eventually 20 eval 'equals "$(mint_field "$MINT" .extension.TokenMetadata.symbol)" QNEW'

step "burn the rest with Max, then close the account, rent to wallet B"
fill_burn_max() { dom_click "Max" || dialog_click "MAX"; }
ui_action "Burn with Max succeeds" "Burn Tokens" fill_burn_max "Burn Tokens" "burned successfully"
# The burn modal's balance is read once; after the force transfer above (+3)
# Max still burns the old 85, leaving 3 behind.
await_value 60 0 bal "$A" 2>/dev/null || true
left="$(bal "$A")"
known_defect unfiled:burn-max-stale "Max burns the whole current balance (left: $left raw)" equals "$left" 0
if [[ "$left" != 0 ]]; then
    fill_burn_left() { ab find placeholder "Enter amount to burn..." fill "$(awk -v r="$left" 'BEGIN { printf "%g", r / 1e6 }')" >/dev/null; }
    ui_action "Burn the remainder succeeds" "Burn Tokens" fill_burn_left "Burn Tokens" "burned successfully"
fi
check "wallet A holds 0" await_value 60 0 bal "$A"
b_sol_before="$(CHAIN balance --address "$B")"
fill_close() {
    js '(() => { const s = document.querySelector("[role=alertdialog] [role=switch]"); if (s && s.getAttribute("data-state") !== "checked") s.click(); return 1; })()' >/dev/null
    sleep 0.3
    ab find placeholder "Enter destination address for rent..." fill "$B" >/dev/null
}
ui_action "Close Token Account succeeds" "Close Token Account" fill_close "Close Account" "Account Closed"
check "A's token account is gone" await_value 60 none bal "$A"
b_sol_after="$(CHAIN balance --address "$B")"
check "the rent went to wallet B ($b_sol_before → $b_sol_after)" eval 'awk -v a="$b_sol_before" -v b="$b_sol_after" "BEGIN { exit !(b > a) }"'

step "remove from storage"
admin_action "Remove from Storage"
confirm="$(js '[...document.querySelectorAll("[role=alertdialog] button")].map(b => b.innerText.trim()).filter(t => /Remove|Delete/.test(t)).slice(-1)[0] ?? ""')"
dialog_click "$confirm"
check "redirected to the dashboard" eventually 15 eval '[[ "$(js location.pathname)" == / ]]'
check "the token is gone from mosaic_tokens" not stored_has "$MINT"

step "§8.8: burn on a tokenized security (PermissionedBurnChecked)"
goto "/"
escape_all
open_wizard "Tokenized Security"
wizard_identity "QA Sec Burn" "QSECB"
sleep 0.5
dialog_click "Continue"
ab wait --text "Authority Parameters" >/dev/null
SEC="$(submit_and_read_mint "Create Tokenized Security")" || fail "security creation failed"
close_result
printf '%s\n' "$SEC" >"$OUT/mint-actions-security.txt"
MINT="$SEC"
open_manage "$SEC"
fill_mint_10() { dom_click "Use my wallet" && ab find placeholder "Enter amount to mint..." fill "10" >/dev/null; }
ui_action "Mint 10 on the security succeeds" "Mint Tokens" fill_mint_10 "Mint Tokens" "minted successfully"
check "wallet A holds 10 of the security" await_value 60 "$(raw 10)" bal "$A"
fill_burn_1() { ab find placeholder "Enter amount to burn..." fill "1" >/dev/null; }
action "Burn Tokens" fill_burn_1 "Burn Tokens" "burned successfully" || true
note "burn on a tokenized security says: $(grep -iE 'error|fail|success|signer|burned' <<<"$LAST_ACTION_TEXT" | head -2 | tr '\n' ' ')"
# management/burn.ts routes it to PermissionedBurnChecked, which needs the
# permissioned-burn authority as a second signer. The form defaults that
# authority to the connected wallet, so the holder is also the second signer
# and the burn goes through. (A token whose burn authority is someone else
# would still fail, with nothing in the UI to say why: §8.8's Extensions row.)
check "Burn on a tokenized security burns the tokens (burn authority = holder)" await_value 60 "$(raw 9)" bal "$A"

step "scaled UI multiplier Save (HOO-955, row 25)"
open_tab Extensions
card="$(tab_card "Scaled UI Amount")"
note "scaled UI row: $card"
js '(() => { const panel = document.querySelector("[role=tabpanel][data-state=active]"); const h = [...panel.querySelectorAll("h4")].find(h => h.innerText.trim() === "Scaled UI Amount"); let el = h; while (el.parentElement && el.parentElement.querySelectorAll("h4").length === 1) el = el.parentElement; [...el.querySelectorAll("button")].find(b => b.innerText.trim() === "Edit")?.click(); return 1; })()' >/dev/null
sleep 0.5
js '(() => { const i = [...document.querySelectorAll("[role=tabpanel][data-state=active] input")].pop(); if (!i) return 0; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "3"); i.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()' >/dev/null
dom_click "Save" || true
sleep 8
note "scaled UI Save says: $(tab_card "Scaled UI Amount")"
known_defect HOO-955 "the new multiplier reaches the chain" eventually 20 eval 'equals "$(mint_field "$SEC" .extension.ScaledUiAmountConfig.multiplier)" 3'

assert_no_page_errors
finish_flow
