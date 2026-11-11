#!/usr/bin/env bash
# e2e:
# QA matrix §1: app shell, wallet and network settings. Spends nothing.
FLOW=qa-shell
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

STABLECOIN="$(fixture stablecoin)"

step "disconnected: dashboard and manage page"
ab open "$BASE_URL/" >/dev/null
wait_slow "Toggle theme"
# Disconnect through the wallet menu if a previous flow left the wallet connected.
if ! is_disconnected; then
    ab find role button click --name "Mosaic Test Wallet" >/dev/null
    ab find role button click --name "Disconnect" >/dev/null
fi
ab wait --text "Welcome to Mosaic" >/dev/null
check "disconnected dashboard shows the welcome screen" contains "$(main_text)" "Welcome to Mosaic"
check "disconnected dashboard offers no token actions" not_contains "$(main_text)" "Create Token"
ab open "$BASE_URL/manage/$STABLECOIN" >/dev/null
wait_slow "Wallet Required"
check "/manage while disconnected asks for a wallet" contains "$(main_text)" "Wallet Required"

step "connect and read the header"
goto "/"
check "header shows the truncated address" contains "$(js 'document.body.innerText')" "$(wallet_short)"

step "wallet menu: balance, copy, network settings"
ab find role button click --name "Mosaic Test Wallet" >/dev/null
ab wait --text "Balance" >/dev/null
sol="$(sol_of a)"
SOL_SHOWN="$(awk -v s="$sol" 'BEGIN { printf "%.1f", s }') SOL"
check "the menu shows the SOL balance ($SOL_SHOWN; chain: $sol)" eventually 15 eval 'contains "$(popper_text)" "$SOL_SHOWN"'
check "the menu has Copy, Network Settings and Disconnect" \
    eval 'btn_present Copy && btn_present "Network Settings" && btn_present Disconnect'
ab find role button click --name "Network Settings" >/dev/null
ab wait --text "Add Custom RPC" >/dev/null
for net in Devnet Mainnet Testnet; do
    check "network list has $net" contains "$(popper_text)" "$net"
done

step "custom RPC: add, persist, select, remove"
ab find role button click --name "Add Custom RPC" >/dev/null
check "Add is disabled while both fields are empty" btn_disabled "Add"
ab find placeholder "Label (e.g., Helius Mainnet)" fill "QA RPC" >/dev/null
check "Add is disabled with only a label" btn_disabled "Add"
ab find placeholder "RPC URL" fill "https://api.devnet.solana.com" >/dev/null
check "Add is enabled with label and URL" btn_enabled "Add"
ab find role button click --name "Add" --exact >/dev/null
ab wait --text "QA RPC" >/dev/null
check "the new RPC carries a Custom chip" contains "$(popper_text)" "Custom"
check "the RPC is stored in mosaic_rpc_settings" contains "$(ls_get mosaic_rpc_settings)" '"label":"QA RPC"'
js '[...document.querySelectorAll("[data-radix-popper-content-wrapper] [role=button]")].find(e => e.innerText.includes("QA RPC"))?.click() ?? null' >/dev/null
sleep 1.5
known_defect unfiled:custom-rpc "selecting a custom RPC switches to it" not_contains "$(toasts)" "Failed to switch"
note "custom RPC switch toast: $(toasts)"
js 'document.querySelector("button[title=\"Remove custom RPC\"]")?.click() ?? null' >/dev/null
check "removing the RPC clears it from storage" eventually 5 eval 'not_contains "$(ls_get mosaic_rpc_settings)" "QA RPC"'
escape_all

step "theme toggles and persists across a reload"
before="$(js 'document.documentElement.className')"
ab find role button click --name "Toggle theme" >/dev/null
sleep 0.3
after="$(js 'document.documentElement.className')"
check "theme changes ($before → $after)" not equals "$before" "$after"
goto "/"
check "theme survives a reload" equals "$(js 'document.documentElement.className')" "$after"
ab find role button click --name "Toggle theme" >/dev/null

step "disconnect and reconnect"
ab find role button click --name "Mosaic Test Wallet" >/dev/null
ab find role button click --name "Disconnect" >/dev/null
ab wait --text "Welcome to Mosaic" >/dev/null
check "disconnect returns to the welcome screen" is_disconnected
goto "/"
check "reconnects" not is_disconnected

assert_no_page_errors
finish_flow
