#!/usr/bin/env bash
# e2e: sessions=b
# HOO-1422: the wizard is reachable from /manage/<mint> without a deep link.
#
# The Confidential button is gated on the token's stored extension list.
# Creation writes human labels ("Confidential Balances (Opt-in)" or
# "(Approval required)"), import writes SDK names ("ConfidentialTransferMint"),
# so both shapes are checked. The creation labels are seeded into localStorage
# exactly as the three creation libs write them, which tests the gate without
# spending SOL. Creating a token through the forms first is not covered yet.
#
# Zero SOL: only existing devnet fixtures, nothing is signed.
FLOW=confidential-entry
source "$(dirname "$0")/../lib.sh"
source "$(dirname "$0")/../lib-confidential.sh"

has_confidential_button() {
    [[ "$(js "!!document.querySelector('a[href=\"/confidential/$1\"]')")" == true ]]
}

open_manage() {
    goto "/manage/$1"
    wait_slow "Admin Actions"
    # The extension list loads from storage first and the chain second.
    sleep 2
}

step "seed tokens with the labels the creation forms write"
# Storage and the test wallet only exist once the app's origin is loaded.
goto "/"
OWNER="$(wallet_address)"
SEED="$(jq -nc --arg o "$OWNER" \
    --arg custom "$FIXTURE_OPTIN_CUSTOM" --arg stable "$FIXTURE_OPTIN_STABLE" \
    --arg security "$FIXTURE_OPTIN_SECURITY" --arg whitelist "$FIXTURE_WHITELIST_STABLE" \
    --arg arcade "$FIXTURE_NO_CT_ARCADE" '
    def token($addr; $type; $ext): {name: ("seed " + $type), symbol: "SEED", address: $addr, type: $type,
        decimals: 6, supply: "0", extensions: $ext, createdAt: "2026-11-09T00:00:00Z", creatorWallet: $o};
    {version: 0, state: {tokens: [
        token($custom; "custom"; ["Metadata", "Confidential Balances (Opt-in)"]),
        token($stable; "stablecoin"; ["Metadata", "Pausable", "Default Account State (Initialized)", "Confidential Balances (Opt-in)", "Permanent Delegate"]),
        token($security; "tokenized-security"; ["Metadata", "Pausable", "Confidential Balances (Opt-in)", "Scaled UI Amount", "Permissioned Burn"]),
        token($whitelist; "stablecoin"; ["Metadata", "Pausable", "Default Account State (Initialized)", "Confidential Balances (Approval required)", "Permanent Delegate"]),
        token($arcade; "arcade-token"; ["Metadata", "Pausable", "Default Account State (Initialized)", "Permanent Delegate"])
    ]}}')"
js "localStorage.setItem('mosaic_tokens', $(jq -Rn --arg s "$SEED" '$s')), 'ok'" >/dev/null

for mint in "$FIXTURE_OPTIN_CUSTOM" "$FIXTURE_OPTIN_STABLE" "$FIXTURE_OPTIN_SECURITY" "$FIXTURE_WHITELIST_STABLE"; do
    open_manage "$mint"
    check "Confidential button on a created token ($mint)" has_confidential_button "$mint"
done

open_manage "$FIXTURE_NO_CT_ARCADE"
check "no Confidential button on a token without the extension" not has_confidential_button "$FIXTURE_NO_CT_ARCADE"

step "the button leads to the wizard"
open_manage "$FIXTURE_OPTIN_CUSTOM"
ab find role link click --name "Confidential" >/dev/null
check "clicking Confidential opens the wizard" wait_slow "Empty confidential balance"

step "a wallet that did not create the token: import from the not-found page"
# Wallet B's session has an empty dashboard, so /manage starts at "Token Not Found".
as_wallet b goto "/manage/$FIXTURE_OPTIN_STABLE"
as_wallet b wait_slow "Import this token"
as_wallet b ab find role button click --name "Import this token" >/dev/null
as_wallet b ab wait --text "Import Existing Token" >/dev/null
as_wallet b ab find role button click --name "Import Token" --exact >/dev/null
as_wallet b wait_slow "Admin Actions"
sleep 2
check "a non-creator reaches the Confidential button after importing" as_wallet b has_confidential_button "$FIXTURE_OPTIN_STABLE"

assert_no_page_errors
finish_flow
