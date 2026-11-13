#!/usr/bin/env bash
# e2e: sessions=empty
# QA matrix §9 "Insufficient SOL": a wallet generated for this run that has
# never held SOL tries to create a token. The wallet signs, the transaction
# fails preflight, and nothing can be spent because there is nothing to spend.
FLOW=qa-insufficient-sol
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

AB_ACTIVE="$AB_SESSION-empty"

step "connect the empty wallet"
goto "/"
address="$(wallet_address)"
check "the wallet holds no SOL ($address)" equals "$(CHAIN balance --address "$address")" 0

step "create a token with no SOL for rent or fees"
open_wizard "Custom Token"
wizard_identity "QA Broke" "QABRK"
ab wait --text "Authority Parameters" >/dev/null
dialog_click "Create Custom Token"
check "creation fails" eventually 90 eval 'contains "$(dialog_text)" "Creation Failed"'
text="$(dialog_text)"
error="$(grep -A1 'Error:' <<<"$text" | tr '\n' ' ' | sed 's/Error: *//; s/  */ /g; s/ *Close *$//')"
note "insufficient-SOL copy: $error"
note "sign requests: $(sign_count signTransaction)"
# Today: "Solana error #-32002; Decode this error by running `npx @solana/errors decode …`".
known_defect unfiled:insufficient-sol-copy "the error says the wallet needs SOL" eval 'grep -qiE "insufficient|not enough|SOL balance|fund" <<<"$error"'

escape_all
assert_no_page_errors
finish_flow
