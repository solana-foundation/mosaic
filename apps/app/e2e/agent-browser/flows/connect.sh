#!/usr/bin/env bash
# Connect the injected test wallet from the disconnected dashboard, then check
# that a reload auto-connects it (`recentlyConnectedWallet` + connector storage).
FLOW=connect
source "$(dirname "$0")/../lib.sh"

: "${TEST_WALLET_SHORT:?set by run.sh, e.g. E3XF...29S5}"

step "open the disconnected dashboard"
ab open "$BASE_URL/"
wait_slow "Welcome to Mosaic"

step "connect Mosaic Test Wallet"
ab find role button click --name "Connect Wallet"
ab wait --text "Connect your wallet"
# The connector's wallet list can lag the init script's registration by a few
# seconds; until then the modal shows "Get Phantom"-style install links.
ab wait --text "Mosaic Test Wallet"
ab find role button click --name "Mosaic Test Wallet"
ab wait --text "$TEST_WALLET_SHORT"
ab wait --text "Create Token"

step "reload and expect auto-connect"
ab reload
ab wait --text "$TEST_WALLET_SHORT"

assert_no_page_errors
