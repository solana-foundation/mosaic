#!/usr/bin/env bash
# e2e: sessions=nosign
# HOO-1424: a wallet that cannot sign the key-derivation message.
#
# Two wallets stand in for the real ones:
#   - wallet A told to refuse the message with Phantom's own error string
#     (`refuseSignMessage()`), and
#   - the "nosign" bundle, built without solana:signMessage at all.
#
# Assertions: the user is warned before spending, the step card carries the
# SDK's diagnostic, nothing is signed or created, and the wallet's own reason
# survives to the card with a single prompt.
#
# Zero SOL: the derivation fails before any transaction is built.
FLOW=confidential-wallet-failures
source "$(dirname "$0")/../lib.sh"
source "$(dirname "$0")/../lib-confidential.sh"

MINT="$FIXTURE_OPTIN_CUSTOM"
PHANTOM_REFUSAL="You cannot sign solana transactions using sign message"

step "wallet refuses the derivation message (Phantom's behaviour)"
open_wizard "$MINT"
wallet_ctl 'reset()' >/dev/null
wallet_ctl 'refuseSignMessage()' >/dev/null
card_run "Configure account"
card_settle "$STEP_CONFIGURE" 60 >/dev/null || fail "Configure did not settle"
ERROR="$(card_error "$STEP_CONFIGURE")"
printf '    card error: %s\n' "${ERROR:0:200}…"
check "the card shows the SDK diagnostic naming the message" contains "$ERROR" 'solana-conf-bal/v1'
check "the diagnostic explains why the bytes cannot change" contains "$ERROR" "cannot be changed to satisfy a wallet"
check "no transaction was signed" equals "$(sign_count signTransaction)" 0
check "no token account was created" equals "$(chain_field a "$MINT" exists)" false
# message-signer fallback: the registry's real error is replaced by the
# connector fallback's generic one, and the refusal is asked twice.
known_defect HOO-1424 "the wallet's own reason reaches the card" contains "$ERROR" "$PHANTOM_REFUSAL"
known_defect HOO-1424 "a refusal prompts the wallet once, not twice" equals "$(sign_count signMessage)" 1
wallet_ctl 'reset()' >/dev/null

step "wallet without signMessage at all"
as_wallet nosign open_wizard "$MINT"
check "the page warns before anything is spent" \
    contains "$(as_wallet nosign ab get text main)" "The connected wallet does not expose message signing"
as_wallet nosign card_run "Configure account"
as_wallet nosign card_settle "$STEP_CONFIGURE" 60 >/dev/null || fail "Configure did not settle (nosign)"
ERROR="$(as_wallet nosign card_error "$STEP_CONFIGURE")"
check "the card says the wallet cannot sign messages" contains "$ERROR" "exposes message signing"
check "no transaction was signed (nosign)" equals "$(as_wallet nosign sign_count signTransaction)" 0
# The notice is shown, yet the step that is certain to fail stays clickable,
# and its error is phrased as a refusal ("The signer refused…") rather than a
# missing capability.
known_defect HOO-1424 "Configure is disabled when the wallet cannot derive keys" \
    not as_wallet nosign card_enabled "$STEP_CONFIGURE" "Configure account"

assert_no_page_errors
finish_flow
