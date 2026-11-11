#!/usr/bin/env bash
# e2e: funded
# QA matrix §5 Permissions tab: Edit (transfer an authority), an invalid
# address, Revoke with its warnings, and that a revoked authority can no longer
# act. Revocation is irreversible, so each run makes a fresh mint (1 mint).
FLOW=qa-authorities
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

goto "/"
A="$(wallet_address)"
B="$(CHAIN address --role b)"

# Clicks a control inside the Permissions card whose heading is $1:
# "edit", "revoke" (the trash icon, a dialog trigger), "confirm" (✓) or "cancel" (✗).
card_click() {
    js "(() => {
        const panel = document.querySelector('[role=tabpanel][data-state=active]');
        const h = [...panel.querySelectorAll('h3')].find(h => h.innerText.trim() === '$1');
        if (!h) return 'no card';
        let el = h;
        while (el.parentElement && el.parentElement !== panel && el.parentElement.querySelectorAll('h3').length === 1) el = el.parentElement;
        const buttons = [...el.querySelectorAll('button')];
        const b = {
            edit: buttons.find(b => b.innerText.trim() === 'Edit'),
            revoke: buttons.find(b => b.hasAttribute('aria-expanded')),
            confirm: buttons.find(b => b.querySelector('.lucide-check')),
            cancel: buttons.find(b => b.querySelector('.lucide-x')),
        }['$2'];
        if (!b) return 'no button';
        if (b.disabled) return 'disabled';
        b.click();
        return 'clicked';
    })()"
}

step "a fresh token"
CONFIGURE=""
MINT="$(retry_429 create_custom_token authz Metadata Pausable "Permanent Delegate")" || fail "creation failed"
close_result
printf '%s\n' "$MINT" >"$OUT/mint-authorities.txt"
open_manage "$MINT"
open_tab Permissions
check "eight authority rows" eventually 20 eval '[[ "$(tab_cards h3 | grep -c .)" == 8 ]]'

step "Edit: an invalid address is refused"
check "Edit opens an inline input" equals "$(card_click "Pausable Authority" edit)" clicked
ab find placeholder "Enter new authority address" fill "not-an-address" >/dev/null
check "✓ is disabled for an invalid address" equals "$(card_click "Pausable Authority" confirm)" disabled
card_click "Pausable Authority" cancel >/dev/null

step "Edit: transfer the metadata authority to wallet B"
card_click "Metadata Authority" edit >/dev/null
ab find placeholder "Enter new authority address" fill "$B" >/dev/null
check "✓ submits a valid address" equals "$(card_click "Metadata Authority" confirm)" clicked
eventually 60 eval 'contains "$(toasts)" "updated"' || note "no 'updated' toast: $(toasts)"
check "the metadata update authority is wallet B on chain" \
    await_value 60 "$B" mint_field "$MINT" '.extension.TokenMetadata.updateAuthority'
check "the row shows wallet B" eventually 20 eval 'contains "$(tab_card "Metadata Authority")" "${B:0:8}"'

step "Revoke: the dialogs warn, and Mint/Freeze warn harder"
card_click "Mint Authority" revoke >/dev/null
ab wait --text "Revoke Mint Authority?" >/dev/null
mint_warning="$(dialog_text)"
note "mint revoke dialog: $(tr '\n' ' ' <<<"$mint_warning" | cut -c1-300)"
escape_all
card_click "Pausable Authority" revoke >/dev/null
ab wait --text "Revoke Pausable Authority?" >/dev/null
pause_warning="$(dialog_text)"
check "Mint's revoke dialog says more than an ordinary one" eval '(( ${#mint_warning} > ${#pause_warning} ))'

step "Revoke the pausable authority"
dialog_click "Revoke Authority"
check "the pausable authority is gone on chain" await_value 60 "" mint_field "$MINT" '.extension.PausableConfig.authority // ""'
eventually 30 eval 'contains "$(tab_card "Pausable Authority")" "None"' || true
check "the row reads None" contains "$(tab_card "Pausable Authority")" "None"
note "pausable row after revoke: $(tab_card "Pausable Authority")"
goto "/manage/$MINT"
wait_slow "Token Overview"
check "Admin Actions no longer offers Pause" eventually 20 eval 'not_contains "$(admin_menu_items)" "Pause Token"'

step "Revoke the mint authority"
open_tab Permissions
eventually 20 eval '[[ "$(tab_cards h3 | grep -c .)" == 8 ]]' || true
card_click "Mint Authority" revoke >/dev/null
ab wait --text "Revoke Mint Authority?" >/dev/null
dialog_click "Revoke Authority"
check "the mint authority is gone on chain" await_value 60 "" mint_field "$MINT" '.mintAuthority // ""'
goto "/manage/$MINT"
wait_slow "Token Overview"
# manage/[address]/page.tsx: `foundToken.mintAuthority = authorities.mintAuthority
# || foundToken.mintAuthority` falls back to the stored value when the live one
# is null, so a revoked authority that was stored at creation stays in the menu.
# (Pause only disappeared above because Custom tokens never store it.)
eventually 20 eval 'not_contains "$(admin_menu_items)" "Mint Tokens"' || true
known_defect unfiled:revoked-authority-stale "Admin Actions no longer offers Mint Tokens after the revoke" not_contains "$(admin_menu_items)" "Mint Tokens"
open_tab Permissions
eventually 20 eval 'contains "$(tab_card "Mint Authority")" "None"' || true
note "mint row after the revoke and a reload: $(tab_card "Mint Authority")"
known_defect unfiled:revoked-authority-stale "the Permissions row reads None after a reload" contains "$(tab_card "Mint Authority")" "None"

assert_no_page_errors
finish_flow
