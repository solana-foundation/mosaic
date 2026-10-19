# Shared helpers for the agent-browser smoke flows. Sourced, not executed.
#
# Every flow drives the same named agent-browser session, so state (the
# connected wallet, localStorage, the open page) carries from one flow to the
# next. run.sh launches that session with the test-wallet init script.
#
# Scripts target elements only through semantic locators (`find role|label|
# placeholder|text`) and `wait --text`. Never use snapshot refs (@e1, ...) here:
# they are reassigned on every snapshot and are only meant for interactive use.

set -euo pipefail

: "${BASE_URL:=http://localhost:3000}"
: "${AB_SESSION:=mosaic-e2e}" # run.sh sets a per-run name
# Run artifacts: screenshots and values handed between flows (e.g. mint.txt).
: "${OUT:=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.agent-browser/runs/latest}"
# Devnet confirmations, and the dev server's first compile of a route, regularly
# take longer than agent-browser's 25s default.
: "${SLOW_TIMEOUT_MS:=90000}"

mkdir -p "$OUT"

ab() {
    agent-browser --session "$AB_SESSION" "$@"
}

# `wait --text` with a timeout long enough for a devnet transaction to land or a
# cold route to compile. Use the per-call --timeout: changing
# AGENT_BROWSER_DEFAULT_TIMEOUT between commands makes the daemon relaunch the
# browser, without the init script.
wait_slow() {
    ab wait --text "$1" --timeout "$SLOW_TIMEOUT_MS"
}

step() {
    printf '\n\033[1m▸ %s\033[0m\n' "$*"
}

fail() {
    printf '\033[31m✗ %s\033[0m\n' "$*" >&2
    exit 1
}

# Fails the flow if the page has thrown since the last check, then clears the
# buffer so each flow only answers for its own errors.
assert_no_page_errors() {
    local errors
    errors="$(ab errors)"
    ab errors --clear >/dev/null
    if [[ -n "$errors" ]]; then
        printf '%s\n' "$errors" >&2
        fail "page errors in ${FLOW:-flow}"
    fi
}
