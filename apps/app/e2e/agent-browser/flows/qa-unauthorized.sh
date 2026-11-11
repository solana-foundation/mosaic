#!/usr/bin/env bash
# e2e:
# QA matrix §6 (shown/hidden grid and unauthorized paths) and §8.7, on the
# devnet fixtures. The test wallet holds none of their authorities, so every
# authority-gated action must show its unauthorized view instead of a form.
# The wallet is armed to reject throughout, so nothing can be spent.
FLOW=qa-unauthorized
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

# Admin Actions items the stored token's authorities should produce
# (manage/[address]/page.tsx: shown when the mint *has* the authority).
expected_menu() {
    local state="$1" items=()
    [[ "$(jq -r '.mintAuthority // ""' <<<"$state")" == "" ]] || items+=("Mint Tokens")
    items+=("Transfer Tokens" "Burn Tokens")
    [[ "$(jq -r '.extension.TokenMetadata.updateAuthority // ""' <<<"$state")" == "" ]] || items+=("Update Metadata")
    [[ "$(jq -r '.extension.PermanentDelegate.delegate // ""' <<<"$state")" == "" ]] || items+=("Force Transfer" "Force Burn")
    [[ "$(jq -r '.freezeAuthority // ""' <<<"$state")" == "" ]] || items+=("Freeze Account" "Thaw Account")
    items+=("Close Token Account")
    if [[ "$(jq -r '.extension.PausableConfig.authority // ""' <<<"$state")" != "" ]]; then
        [[ "$(jq -r '.extension.PausableConfig.paused' <<<"$state")" == true ]] && items+=("Unpause Token") || items+=("Pause Token")
    fi
    items+=("Remove from Storage")
    local IFS=,
    echo "${items[*]}"
}

# Opens an Admin Actions item and checks its unauthorized view.
expect_unauthorized() {
    local key="$1" item="$2" title="$3" text
    admin_action "$item"
    text="$(dialog_text)"
    check "$key: $item shows '$title'" contains "$text" "$title"
    check "$key: $item names the connected wallet" contains "$text" "$(wallet_address)"
    check "$key: $item offers no form, only Understood" btn_present "Understood"
    dialog_click "Understood" || escape_all
    # The page stays aria-hidden until the dialog has fully closed.
    eventually 5 eval 'equals "$(dialog_text)" ""' || escape_all
    sleep 0.3
}

# Pause and Unpause have no up-front unauthorized view: the confirm modal
# checks the authority when confirmed and is meant to show "Authority
# Required". Confirm is a Radix AlertDialogAction, which closes the dialog on
# click, so the message has nowhere to render.
expect_pause_refused() {
    local key="$1" action="$2" seen
    arm_reject
    admin_action "$action Token"
    check "$key: $action opens its confirmation" contains "$(dialog_text)" "You are about to $(tr '[:upper:]' '[:lower:]' <<<"$action")"
    dialog_click "Confirm $action"
    sleep 3
    seen="$(dialog_text) $(toasts)"
    note "$key: after Confirm $action as a non-authority the user sees: '$seen'"
    check "$key: confirming $action as a non-authority never reaches the wallet" no_sign_requests
    known_defect unfiled:pause-refusal-hidden "$key: confirming $action as a non-authority explains why it was refused" \
        contains "$seen" "pause authority"
    escape_all
    eventually 5 eval 'equals "$(dialog_text)" ""' || escape_all
}

goto "/"
for key in stablecoin security arcade confidential paused scaled blocklist allowlist; do
    mint="$(fixture "$key")"
    state="$(cat "$OUT/fixture-$key.json" 2>/dev/null || mint_json "$mint")"
    step "$key: Admin Actions grid"
    open_manage "$mint"
    QA_WANT_MENU="$(expected_menu "$state")"
    # The paused state is read after the page renders, through the SDK's
    # getTokenPauseState, which returns false on *any* RPC error. Under a
    # public-devnet 429 a paused mint therefore offers Pause Token. Judge the
    # rest of the menu strictly; give the pause label time and two reloads.
    eventually 15 eval 'equals "$(admin_menu_items)" "$QA_WANT_MENU"' || true
    for retry in 1 2; do
        got="$(admin_menu_items)"
        [[ "$got" != "$QA_WANT_MENU" ]] || break
        sleep 10
        goto "/manage/$mint"
        wait_slow "Token Overview"
        eventually 15 eval 'equals "$(admin_menu_items)" "$QA_WANT_MENU"' || true
    done
    got="$(admin_menu_items)"
    strip_pause() { sed -E 's/,(Un)?[Pp]ause Token//' <<<"$1"; }
    check "$key: Admin Actions items match the mint's authorities" equals "$(strip_pause "$got")" "$(strip_pause "$QA_WANT_MENU")"
    if [[ "$got" != "$QA_WANT_MENU" ]]; then
        # Only reachable when the pause read kept failing, so it can never XPASS.
        known_defect unfiled:pause-state-read-error "$key: the pause item reflects the on-chain paused state (getTokenPauseState hides RPC errors as 'not paused')" false
        note "$key: menu '$got', expected '$QA_WANT_MENU'"
    fi
done

step "unauthorized views (six) and the pause/unpause authority check"
open_manage "$(fixture stablecoin)"
arm_reject
expect_unauthorized stablecoin "Mint Tokens" "Mint Authority Required"
expect_unauthorized stablecoin "Freeze Account" "Freeze Authority Required"
expect_unauthorized stablecoin "Thaw Account" "Freeze Authority Required"
expect_unauthorized stablecoin "Force Transfer" "Permanent Delegate Required"
expect_unauthorized stablecoin "Force Burn" "Permanent Delegate Required"
expect_pause_refused stablecoin "Pause"
# Update Metadata has no unauthorized view: it opens the edit form, with a hint
# that only the metadata authority can update. Probe how far a change gets.
admin_action "Update Metadata"
text="$(dialog_text)"
known_defect unfiled:metadata-no-unauthorized-view "stablecoin: Update Metadata shows 'Metadata Authority Required' to a non-authority" \
    contains "$text" "Metadata Authority Required"
check "stablecoin: Update Metadata at least says only the metadata authority can update" contains "$text" "Only the metadata authority"
symbol="$(js 'document.querySelectorAll("[role=dialog] input, [role=alertdialog] input")[1]?.value ?? ""')"
if ((${#symbol} > 10)); then
    note "stablecoin: the on-chain symbol '$symbol' (${#symbol} chars) is prefilled over the form's 10-character limit and shows as invalid"
fi
escape_all
eventually 5 eval 'equals "$(dialog_text)" ""' || escape_all
open_manage "$(fixture paused)"
arm_reject
if contains "$(admin_menu_items)" "Unpause Token"; then
    expect_pause_refused paused "Unpause"
else
    note "paused: the menu offers Pause Token (pause state read failed), so the Unpause refusal could not be exercised this run"
fi
check "no unauthorized view reached the wallet" no_sign_requests
escape_all

step "§8.7: the Extensions-tab pause switch is guarded like the Admin Actions path"
open_tab Extensions
arm_reject
switch="$(js '!!document.querySelector("[role=tabpanel][data-state=active] [role=switch]")')"
check "the Pausable row is a switch" equals "$switch" true
js 'document.querySelector("[role=tabpanel][data-state=active] [role=switch]").click()' >/dev/null
sleep 5
# Fixed since the matrix run: lib/pause.ts checks the signer against the pause
# authority before building, so both entry points refuse without signing.
check "the pause switch does not ask the wallet to sign when it lacks the pause authority" no_sign_requests
pausable="$(tab_card Pausable)"
note "after the pause switch as a non-authority the user sees: '$pausable' / toasts: '$(toasts)'"
# The switch path does say why (inline in the row), unlike Confirm Pause in Admin Actions.
check "the pause switch explains why it was refused" contains "$pausable" "Only the pause authority"
check "the mint is still paused on chain" equals "$(mint_field "$(fixture paused)" .extension.PausableConfig.paused)" true

escape_all
assert_no_page_errors
finish_flow
