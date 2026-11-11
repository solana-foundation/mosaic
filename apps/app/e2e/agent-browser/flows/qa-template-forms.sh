#!/usr/bin/env bash
# e2e:
# QA matrix §2 (pre-submit half) and §8.2/§8.10: the three template wizards up
# to, but not including, the create button. Identity gate, decimals, each
# template's feature step, the tokenized-security multiplier preview, and the
# authority-parameter step's validation. Spends nothing.
FLOW=qa-template-forms
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

goto "/"

identity_gate() {
    check "$1: Continue is disabled with no name or symbol" btn_disabled "Continue"
    ab find label "Token Name" fill "QA $1" >/dev/null
    check "$1: Continue is disabled with only a name" btn_disabled "Continue"
    ab find label "Symbol" fill "QA" >/dev/null
    check "$1: Continue is enabled with name and symbol" btn_enabled "Continue"
    # §8.10: decimals are two fixed buttons; the SDK accepts 0-9 (and more since #126).
    check "$1: decimals offer 6 and 9" eval 'btn_present 6 && btn_present 9'
    note "$1: decimals 0-5, 7, 8 are not offered (§8.10, a product question)"
    dialog_click "Continue"
    sleep 0.5
}

authority_gate() {
    local submit="$1" count="$2"
    shift 2
    local fields
    fields="$(js '[...document.querySelectorAll("[role=dialog] label")].map(l => l.innerText.trim()).filter(t => /Authority$/.test(t)).join(",")')"
    check "$submit: $count authority fields ($fields)" equals "$(tr ',' '\n' <<<"$fields" | grep -c .)" "$count"
    check "$submit: submit is enabled with every authority left empty" btn_enabled "$submit"
    ab find label "$1" fill "not-an-address" >/dev/null
    check "$submit: an invalid '$1' disables submit" btn_disabled "$submit"
    ab find label "$1" fill "$(CHAIN address --role b)" >/dev/null
    check "$submit: a valid '$1' re-enables submit" btn_enabled "$submit"
    ab find label "$1" fill "" >/dev/null
}

step "stablecoin"
open_wizard "Stablecoin"
identity_gate "Stablecoin"
features="$(dialog_text)"
check "stablecoin features: Access Control Mode with Allowlist and Blocklist" \
    eval 'contains "$features" "Access Control Mode" && contains "$features" "Allowlist" && contains "$features" "Blocklist"'
check "stablecoin features: confidential policy (Approval required / Opt-in)" \
    eval 'contains "$features" "Approval required" && contains "$features" "Opt-in"'
# §8.2: enableSrfc37 is hard-coded false (stablecoin-create-form.tsx), so the
# Access Control Mode choice never reaches the chain (lib/stablecoin.ts says as much).
known_defect unfiled:srfc37-templates "stablecoin offers a way to turn sRFC-37 on" contains "$features" "SRFC-37"
dialog_click "Continue"
sleep 0.5
authority_gate "Create Stablecoin" 5 "Pausable Authority"
escape_all

step "tokenized security"
goto "/"
open_wizard "Tokenized Security"
identity_gate "Tokenized Security"
check "default multiplier preview is 1,000 × 1" contains "$(dialog_text)" "1,000 tokens × 1 = 1,000 displayed"
ab find label "Display Multiplier" fill "2.5" >/dev/null
check "preview follows the multiplier (× 2.5)" eventually 3 eval 'contains "$(dialog_text)" "1,000 tokens × 2.5 = 2,500 displayed"'
known_defect unfiled:srfc37-templates "tokenized security offers a way to turn sRFC-37 on" contains "$(dialog_text)" "SRFC-37"
dialog_click "Continue"
sleep 0.5
authority_gate "Create Tokenized Security" 7 "Permissioned Burn Authority"
escape_all

step "arcade token"
goto "/"
open_wizard "Arcade Token"
identity_gate "Arcade Token"
features="$(dialog_text)"
for f in "Metadata" "Pausable" "Default Account State" "Permanent Delegate"; do
    check "arcade features list $f" contains "$features" "$f"
done
check "arcade features are read-only (no inputs)" equals "$(js 'document.querySelectorAll("[role=dialog] input").length')" 0
check "arcade has no confidential balances" not_contains "$features" "Confidential"
note "arcade title reads '$(js 'document.querySelector("[role=dialog] h2")?.innerText')' (grammar)"
dialog_click "Continue"
sleep 0.5
authority_gate "Create Arcade Token" 4 "Permanent Delegate Authority"
escape_all

assert_no_page_errors
finish_flow
