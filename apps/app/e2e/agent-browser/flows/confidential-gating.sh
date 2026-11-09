#!/usr/bin/env bash
# e2e:
# What the wizard says before anything is configured, and what it does with
# addresses and wallet states it should refuse.
#
#   HOO-1428  disabled cards state a true reason (unconfigured account)
#   HOO-1421  on a whitelist mint, a non-authority sees why it cannot approve
#   HOO-1430  no wallet, a URL that is not a confidential mint, wallet-side
#             disconnect and account switch
#
# Zero SOL: existing fixtures only, and nothing here is ever signed.
FLOW=confidential-gating
source "$(dirname "$0")/../lib.sh"
source "$(dirname "$0")/../lib-confidential.sh"

NEEDS_CONFIGURE="Configure the account first (step 1)."

# card_says <step> <text>
card_says() { contains "$(card_text "$1")" "$2"; }

step "opt-in mint, unconfigured account ($FIXTURE_OPTIN_CUSTOM)"
open_wizard "$FIXTURE_OPTIN_CUSTOM"
# The mint config and the account state load from chain after first paint.
ab wait --text "auto-approves new accounts" --timeout 30000 >/dev/null
check "step 1 Configure is enabled" card_enabled "$STEP_CONFIGURE" "Configure account"
check "step 2 explains an opt-in mint needs no approval" \
    card_says "$STEP_APPROVE" "This mint auto-approves new accounts — approval is not required."
for s in "$STEP_CREDITS" "$STEP_DEPOSIT" "$STEP_APPLY" "$STEP_TRANSFER" "$STEP_WITHDRAW" "$STEP_EMPTY"; do
    check "step $s asks for configure first" card_says "$s" "$NEEDS_CONFIGURE"
done
check "the balance panel reads Not configured" contains "$(panel_text)" "Not configured"

step "whitelist mint whose confidential authority is someone else ($FIXTURE_WHITELIST_STABLE)"
open_wizard "$FIXTURE_WHITELIST_STABLE"
ab wait --text "can approve accounts" --timeout 30000 >/dev/null || true
check "step 2 names the authority that can approve" \
    card_says "$STEP_APPROVE" "Only the mint's confidential authority ($FIXTURE_WHITELIST_AUTHORITY) can approve accounts."
check "step 2 is disabled for a non-authority" not card_enabled "$STEP_APPROVE" "Approve account"

step "a mint without the confidential extension ($FIXTURE_NO_CT_ARCADE)"
open_wizard "$FIXTURE_NO_CT_ARCADE"
ab wait --text "does not support confidential transfers" --timeout 30000 >/dev/null || true
check "step 2 says the mint does not support confidential transfers" \
    card_says "$STEP_APPROVE" "This mint does not support confidential transfers."
# The wizard renders all eight cards for any address (confidential-wizard.tsx
# has no early return), so Configure stays enabled and would spend on a doomed
# transaction.
known_defect HOO-1430 "Configure is disabled on a mint without the confidential extension" \
    not card_enabled "$STEP_CONFIGURE" "Configure account"

step "a wallet address instead of a mint ($FIXTURE_WHITELIST_AUTHORITY)"
open_wizard "$FIXTURE_WHITELIST_AUTHORITY"
sleep 8
known_defect HOO-1430 "the page says the address is not a mint" \
    contains "$(ab get text main)" "not a mint"
known_defect HOO-1430 "Configure is disabled for an address that is not a mint" \
    not card_enabled "$STEP_CONFIGURE" "Configure account"

step "an address that is not base58 at all"
ab errors --clear >/dev/null
goto "/confidential/not-a-mint"
wait_slow "Empty confidential balance"
tag_cards >/dev/null
sleep 8
# resolveAta throws on the invalid address and nothing catches it, so every
# card waits on "Resolving your token account…" forever.
known_defect HOO-1430 "an invalid address gets a message instead of an endless 'Resolving…'" \
    not card_says "$STEP_CONFIGURE" "Resolving your token account"
ab errors --clear >/dev/null

step "no wallet connected"
goto "/confidential/$FIXTURE_OPTIN_CUSTOM"
wait_slow "Empty confidential balance"
ab find role button click --name "$(wallet_short)" >/dev/null
ab find role button click --name "Disconnect" --exact >/dev/null
check "disconnecting in the app shows the wallet gate" wait_slow "Please connect your Solana wallet to use confidential transfers."
ensure_connected

step "wallet-side events (the user acts in the extension, not the app)"
open_wizard "$FIXTURE_OPTIN_CUSTOM"
A_SHORT="$(wallet_short)"
B_ADDRESS="$(wallet_ctl 'switchAccount()')"
sleep 3
# @solana/connector 0.1.4 updates `accounts` on a wallet `change` event but never
# `selectedAccount`, so the app keeps acting as the old account.
known_defect connector-0.1.4 "switching accounts in the wallet switches the app to ${B_ADDRESS:0:4}…" \
    not contains "$(ab get text header)" "$A_SHORT"
wallet_ctl 'switchAccount()' >/dev/null
sleep 2
wallet_ctl 'disconnect()' >/dev/null
sleep 3
# The connector returns early on a `change` event with no accounts.
known_defect connector-0.1.4 "disconnecting in the wallet shows the wallet gate" \
    contains "$(ab get text main)" "Please connect your Solana wallet"
# Leave the session connected for the next flow.
ab reload >/dev/null
ensure_connected

assert_no_page_errors
finish_flow
