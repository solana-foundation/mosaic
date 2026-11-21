#!/usr/bin/env bash
# e2e: funded
# QA matrix §3c combos 1-3 and §7: sRFC-37 access lists on Custom tokens, one
# per mode. Add and remove wallet B through the Allowlist/Blocklist tab, check
# B's token account freezes and thaws on chain, that a duplicate is refused,
# and that transfers are blocked or allowed by mode. Wallet B only receives.
# 2 mints plus about a dozen transactions.
FLOW=qa-acl
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

goto "/"
A="$(wallet_address)"
B="$(CHAIN address --role b)"
bal() { CHAIN token --role a --mint "$MINT" --owner "$1" | jq -r '.publicBalance // "none"'; }
frozen() { CHAIN token --role a --mint "$MINT" --owner "$1" | jq -r 'if has("frozen") then .frozen else "none" end'; }

fill_mint_10() { dom_click "Use my wallet" && ab find placeholder "Enter amount to mint..." fill "10" >/dev/null; }
fill_transfer_b() {
    ab find placeholder "Enter recipient Solana address..." fill "$B" >/dev/null
    ab find placeholder "Enter amount to send..." fill "1" >/dev/null
}
fill_force_from_b() {
    ab find placeholder "Enter source wallet address..." fill "$B" >/dev/null
    ab find placeholder "Enter destination wallet address..." fill "$A" >/dev/null
    ab find placeholder "Enter amount to transfer..." fill "1" >/dev/null
}

# Runs a list operation until a predicate holds, retrying when the app shows
# its Error dialog for a public-devnet rate limit (8100002 / 429).
#   list_op <add|remove> <Allowlist|Blocklist> <address> <predicate...>
list_op() {
    local op="$1" label="$2" address="$3" attempt text
    shift 3
    QA_PRED=("$@")
    for attempt in 1 2 3; do
        open_tab "$label"
        if [[ "$op" == add ]]; then
            dom_click "Add address"
            ab find placeholder "Enter Solana address..." fill "$address" >/dev/null
            dialog_click "Add to $label"
        else
            js "(() => {
                const panel = document.querySelector('[role=tabpanel][data-state=active]');
                const row = [...panel.querySelectorAll('.divide-y > div')].find(r => r.innerText.includes('${address:0:4}'));
                const b = row && [...row.querySelectorAll('button')].find(b => b.innerText.trim() === 'Remove');
                if (!b) return false;
                b.click();
                return true;
            })()" | grep -q true || return 1
        fi
        eventually 90 eval '"${QA_PRED[@]}" || [[ "$(dialog_text)" == *"Solana error"* || "$(dialog_text)" == *"An error occurred"* ]]' || true
        "$@" && { escape_all; return 0; }
        text="$(dialog_text)"
        dialog_click "Close" || escape_all
        is_rate_limited "$text" || {
            echo "list $op of $address failed: $(tr '\n' ' ' <<<"$text" | cut -c1-300)" >&2
            return 1
        }
        echo "list $op rate limited; retrying in $((attempt * 10))s" >&2
        sleep $((attempt * 10))
        # A 429 after sending may still have landed.
        "$@" && return 0
    done
    return 1
}
is_frozen() { [[ "$(frozen "$1")" == "$2" ]]; }

list_shows() { contains "$(js 'document.querySelector("[role=tabpanel][data-state=active]")?.innerText ?? ""')" "${2:0:4}"; }

make_acl_token() {
    local mode="$1"
    acl_config() {
        if [[ "$mode" == allowlist ]]; then
            ab find role button click --name "Allowlist Only approved addresses can transfer" >/dev/null
        fi
    }
    CONFIGURE=acl_config
    # Permanent Delegate too, so the issuer has Force Transfer to try (HOO-954).
    retry_429 create_custom_token "acl$mode" Metadata "Permanent Delegate" "SRFC-37 (Token ACL)"
}

step "blocklist: create, mint 10 to A, send 1 to B"
MINT="$(make_acl_token blocklist)" || fail "blocklist creation failed"
close_result
printf '%s\n' "$MINT" >"$OUT/mint-acl-blocklist.txt"
check "the freeze authority is a Token-ACL PDA" equals "$(CHAIN account-owner --address "$(mint_field "$MINT" .freezeAuthority)")" "$TOKEN_ACL_PROGRAM"
open_manage "$MINT"
check "the third tab is Blocklist" eventually 20 eval 'contains "$(tab_names)" Blocklist'
ui_action "Mint 10 to A succeeds" "Mint Tokens" fill_mint_10 "Mint Tokens" "minted successfully"
check "A holds 10" await_value 60 "$(raw 10)" bal "$A"
ui_action "Transfer 1 to B succeeds" "Transfer Tokens" fill_transfer_b "Send Tokens" "Transfer Successful"
check "B holds 1" await_value 60 "$(raw 1)" bal "$B"

step "blocklist: add B"
check "adding B freezes B's token account on chain" list_op add Blocklist "$B" is_frozen "$B" true
check "the tab lists B" eventually 30 eval 'list_shows Blocklist "$B"'
open_tab Blocklist
dom_click "Add address"
ab find placeholder "Enter Solana address..." fill "$B" >/dev/null
dialog_click "Add to Blocklist"
check "adding B again says 'Address already in list'" eventually 10 eval 'contains "$(main_text) $(dialog_text) $(toasts)" "Address already in list"'
escape_all

step "blocklist: a listed B cannot receive"
ui_action "Transfer 1 to a blocklisted B (expected to fail)" "Transfer Tokens" fill_transfer_b "Send Tokens" "Transfer Successful"
sleep 10
check "B still holds 1" equals "$(bal "$B")" "$(raw 1)"
note "transfer to a blocklisted wallet says: $(tr '\n' ' ' <<<"$LAST_ACTION_TEXT" | grep -oE '(Solana error #[-0-9]+|[A-Z][^.]*(failed|Failed|frozen)[^.]*)' | head -1)"

step "HOO-954: the issuer cannot claw back from a blocklisted account"
ui_action "Force Transfer from blocklisted B" "Force Transfer" fill_force_from_b "Force Transfer" "Force Transfer Successful"
sleep 10
known_defect HOO-954 "force transfer moves tokens out of a blocklisted (frozen) account" equals "$(bal "$B")" 0

step "blocklist: remove B"
check "removing B thaws its token account on chain" list_op remove Blocklist "$B" is_frozen "$B" false
# B holds 1 while HOO-954 stands, 0 once the clawback above works: expect one more than now.
b_before="$(bal "$B")"
ui_action "Transfer 1 to B after removal succeeds" "Transfer Tokens" fill_transfer_b "Send Tokens" "Transfer Successful"
check "B gains 1 (from $b_before raw)" await_value 60 "$((b_before + $(raw 1)))" bal "$B"

step "allowlist: create, list A, mint 10 to A"
goto "/"
MINT="$(make_acl_token allowlist)" || fail "allowlist creation failed"
close_result
printf '%s\n' "$MINT" >"$OUT/mint-acl-allowlist.txt"
check "allowlist: accounts are born frozen" equals "$(mint_field "$MINT" .extension.DefaultAccountState.state)" 2
open_manage "$MINT"
# The mode is read from the list config; when that read fails (a 429) the
# label falls back to Blocklist, even for the creator (HOO-953's catch → null
# branch). Reload before judging.
for retry in 1 2 3; do
    eventually 20 eval 'contains "$(tab_names)" Allowlist' && break
    note "tabs read '$(tab_names)' (attempt $retry); reloading"
    sleep 10
    goto "/manage/$MINT"
    wait_slow "Token Overview"
done
check "the third tab is Allowlist (creator view)" contains "$(tab_names)" Allowlist
check "listing A shows it in the tab" list_op add Allowlist "$A" list_shows Allowlist "$A"
ui_action "Mint 10 to a listed A succeeds" "Mint Tokens" fill_mint_10 "Mint Tokens" "minted successfully"
check "A holds 10" await_value 60 "$(raw 10)" bal "$A"
check "A's account is usable (thawed)" equals "$(frozen "$A")" false

step "allowlist: an unlisted B cannot receive"
ui_action "Transfer 1 to an unlisted B (expected to fail)" "Transfer Tokens" fill_transfer_b "Send Tokens" "Transfer Successful"
sleep 10
check "B received nothing" eval '[[ "$(bal "$B")" == none || "$(bal "$B")" == 0 ]]'
note "transfer to an unlisted wallet says: $(tr '\n' ' ' <<<"$LAST_ACTION_TEXT" | grep -oE '(Solana error #[-0-9]+|[A-Z][^.]*(failed|Failed|validation)[^.]*)' | head -1)"

step "allowlist: list B, then it can receive"
check "listing B shows it in the tab" list_op add Allowlist "$B" list_shows Allowlist "$B"
ui_action "Transfer 1 to a listed B succeeds" "Transfer Tokens" fill_transfer_b "Send Tokens" "Transfer Successful"
check "B holds 1" await_value 90 "$(raw 1)" bal "$B"

step "allowlist: removing B freezes its account"
check "removing B freezes its account again" list_op remove Allowlist "$B" is_frozen "$B" true

assert_no_page_errors
finish_flow
