#!/usr/bin/env bash
# e2e:
# QA matrix §9: a wallet rejection, an unreachable RPC, persistence, a second
# tab, and the narrow (phone) layout. Spends nothing: the only transaction is
# rejected by the wallet before it is signed.
FLOW=qa-errors
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

STABLECOIN="$(fixture stablecoin)"
ARCADE="$(fixture arcade)"
RPC_PATTERN="*api.devnet.solana.com*"

goto "/"

step "the wallet rejects the transaction"
open_wizard "Custom Token"
wizard_identity "QA Reject" "QAREJ"
ab wait --text "Authority Parameters" >/dev/null
arm_reject
dialog_click "Create Custom Token"
check "the rejection comes back as Creation Failed" eventually 60 eval 'contains "$(dialog_text)" "Creation Failed"'
check "exactly one transaction reached the wallet, and it was rejected" equals "$(sign_count signTransaction)" 1
text="$(dialog_text)"
note "rejection copy: $(grep -A1 'Error:' <<<"$text" | tr '\n' ' ' | sed 's/ *Close *$//')"
check "no spinner is left running" not_contains "$text" "Creating..."
# §10 row 20: a user's own cancellation is reported as a failure.
known_defect unfiled:row20-rejection-copy "a rejection reads as a cancellation, not a failure" not_contains "$text" "Creation Failed"
escape_all

step "persistence across a reload"
import_token "$STABLECOIN"
eventually 6 eval 'equals "$(dialog_text)" ""' || escape_all
goto "/"
check "the imported token survives a reload (mosaic_tokens)" stored_has "$STABLECOIN"
check "and is still on the dashboard" eventually 10 eval 'contains "$(main_text)" "$(stored_tokens | jq -r --arg m "$STABLECOIN" ".[] | select(.address == \$m) | .name")"'

step "a second tab"
ab tab new --label qa2 "$BASE_URL/" >/dev/null
ab wait --text "Toggle theme" --timeout "$SLOW_TIMEOUT_MS" >/dev/null
ensure_connected
ab tab t1 >/dev/null 2>&1 || ab tab list >/dev/null
js 'localStorage.removeItem("mosaic_tokens")' >/dev/null
goto "/"
import_token "$ARCADE"
eventually 6 eval 'equals "$(dialog_text)" ""' || escape_all
ab tab qa2 >/dev/null
arcade_name="$(stored_tokens | jq -r --arg m "$ARCADE" '.[] | select(.address == $m) | .name')"
sleep 2
if contains "$(main_text)" "$arcade_name"; then synced=yes; else synced=no; fi
note "a token imported in another tab shows here without a reload: $synced"
ab reload >/dev/null
ensure_connected
check "the second tab shows it after a reload" eventually 15 eval 'contains "$(main_text)" "$arcade_name"'
ab tab close qa2 >/dev/null
ab tab t1 >/dev/null 2>&1 || true

step "an unreachable RPC"
goto "/"
ab network route "$RPC_PATTERN" --abort >/dev/null
open_import
ab find label "Token Address" fill "$(fixture paused)" >/dev/null
ab find role button click --name "Import Token" >/dev/null
check "import fails with a message instead of hanging" eventually 60 eval 'contains "$(dialog_text)" "Failed"'
note "unreachable RPC, import says: $(dialog_text | grep -i failed | head -1)"
check "the import button is usable again" btn_enabled "Import Token"
escape_all
ab network unroute >/dev/null
note "no RPC failover exists; the app has no fallback endpoint (§9)"

step "phone width (390×844)"
ab set viewport 390 844 >/dev/null
goto "/"
sleep 1
check "dashboard: no horizontal scroll at 390px" not has_horizontal_overflow
open_manage "$ARCADE"
sleep 1
# The title row (name + Explorer + Admin Actions) does not wrap, so Admin
# Actions runs off the right edge on a phone.
known_defect unfiled:manage-header-phone-overflow "manage page: no horizontal scroll at 390px" not has_horizontal_overflow
ab screenshot "$OUT/qa-errors-manage-390.png" >/dev/null
note "phone-width screenshot for a human look: $OUT/qa-errors-manage-390.png"
ab set viewport 1440 1600 >/dev/null

assert_no_page_errors
finish_flow
