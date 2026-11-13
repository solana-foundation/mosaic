#!/usr/bin/env bash
# e2e:
# Connect the injected test wallet from the disconnected dashboard, then check
# that a reload auto-connects it (the connector's stored wallet). Auto-connect
# never fires under `next dev` (see the README's Gotchas), so against a dev
# server the reload check is skipped with a note.
FLOW=connect
source "$(dirname "$0")/../lib.sh"

: "${TEST_WALLET_SHORT:?set by run.sh: the address of wallet A as the header shortens it}"

step "open the disconnected dashboard"
ab open "$BASE_URL/" >/dev/null
wait_slow "Welcome to Mosaic"
check "a fresh session starts disconnected" is_disconnected

step "connect Mosaic Test Wallet"
connect_wallet
# The bundle embeds the key run.sh resolved for wallet A.
check "the page's wallet is wallet A ($TEST_WALLET_SHORT)" equals "$(wallet_short)" "$TEST_WALLET_SHORT"
wait_slow "Create Token"

step "reload and expect auto-connect"
if is_dev_server; then
    note "reload auto-connect not checked: the app is a next dev server, where it never fires"
else
    ab reload >/dev/null
    check "a reload reconnects the wallet" wait_connected "$SLOW_TIMEOUT_MS"
fi

assert_no_page_errors
finish_flow
