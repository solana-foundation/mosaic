# Shared helpers for the agent-browser flows. Sourced, not executed.
#
# run.sh launches named agent-browser sessions, each with a test-wallet init
# script: $AB_SESSION is wallet A, "$AB_SESSION-b" is wallet B and
# "$AB_SESSION-nosign" is wallet A built without signMessage (the B and nosign
# sessions only exist when a flow asks for them, see run.sh). State (the
# connected wallet, localStorage, the open page) carries from one flow to the
# next within a session.
#
# Scripts target elements through semantic locators (`find role|label|
# placeholder|text`), `wait --text`, and attributes a suite adds to the page
# itself. Never use snapshot refs (@e1, ...) here: they are reassigned on every
# snapshot and are only meant for interactive use.
#
# A suite with helpers of its own keeps them in lib-<suite>.sh, sourced after
# this file.

set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${BASE_URL:=http://localhost:3000}"
: "${AB_SESSION:=mosaic-e2e}" # run.sh sets a per-run name
# Run artifacts: screenshots, results.tsv, and values handed between flows (e.g. mint.txt).
: "${OUT:=$(cd "$E2E_DIR/../.." && pwd)/.agent-browser/runs/latest}"
# Devnet confirmations, and the dev server's first compile of a route, regularly
# take longer than agent-browser's 25s default.
: "${SLOW_TIMEOUT_MS:=90000}"
# Which session `ab` drives; `as_wallet` switches it for one command.
: "${AB_ACTIVE:=$AB_SESSION}"
# The transaction version this run's wallets advertise (run.sh sets it).
: "${TX_VERSION:=0}"

mkdir -p "$OUT"
RESULTS="$OUT/results.tsv"

# A command that fails outside a check (a locator that finds nothing, a wait
# that times out) ends the flow through `set -e`. Say which one, and record it.
# An EXIT trap rather than ERR: bash 3.2 (macOS) skips the ERR trap when a
# failing `[[ ... ]]` ends the shell. $BASH_COMMAND must be the trap's first
# expansion, before the trap's own commands replace it. run.sh sets its own
# EXIT trap after sourcing this file, so this only applies to flows.
#
# It also makes a failed soft_check fail the flow when it ends, whether or not
# the flow reached finish_flow, so the exit status and results.tsv agree.
on_exit() {
    local status=$? command="$1"
    if ((status == 0)) && [[ -n "${SOFT_FAILED:-}" ]]; then
        printf '\033[31m✗ %s had failed checks\033[0m\n' "${FLOW:-flow}" >&2
        exit 1
    fi
    ((status == 0)) || [[ -n "${FAILURE_RECORDED:-}" ]] || {
        printf '\033[31m✗ %s stopped at `%s` (exit %s)\033[0m\n' "${FLOW:-flow}" "$command" "$status" >&2
        printf 'fail\t%s\tstopped at: %s\n' "${FLOW:-?}" "$command" >>"$RESULTS"
    }
}
trap 'on_exit "$BASH_COMMAND"' EXIT

ab() {
    agent-browser --session "$AB_ACTIVE" "$@"
}

# Runs one command against another wallet's session: `as_wallet b ab open ...`.
# Roles: a (default session), b, nosign.
as_wallet() {
    local role="$1"
    shift
    local session="$AB_SESSION"
    [[ "$role" == a ]] || session="$AB_SESSION-$role"
    AB_ACTIVE="$session" "$@"
}

# `wait --text` with a timeout long enough for a devnet transaction to land or a
# cold route to compile. Use the per-call --timeout: changing
# AGENT_BROWSER_DEFAULT_TIMEOUT between commands makes the daemon relaunch the
# browser, without the init script.
wait_slow() {
    ab wait --text "$1" --timeout "$SLOW_TIMEOUT_MS" >/dev/null
}

step() {
    printf '\n\033[1m▸ %s\033[0m\n' "$*"
}

fail() {
    printf '\033[31m✗ %s\033[0m\n' "$*" >&2
    printf 'fail\t%s\t%s\n' "${FLOW:-?}" "$*" >>"$RESULTS"
    FAILURE_RECORDED=1
    exit 1
}

# Evaluates a JavaScript expression in the page and prints its value, with
# strings unquoted. agent-browser prints eval results as JSON, except for
# `undefined`, so that is mapped to null first.
js() {
    ab eval "(() => { const v = ($1); return v === undefined ? null : v; })()" |
        jq -r 'if type == "string" then . elif . == null then "" else tojson end'
}

# ---------------------------------------------------------------------------
# Results: every check is one line of $OUT/results.tsv, which run.sh summarises.
#
#   check "<what>" <command...>             pass or fail (fail stops the flow)
#   soft_check "<what>" <command...>        records a fail but keeps going;
#                                           the flow fails when it ends
#   known_defect HOO-123 "<what>" <cmd...>  a check that is expected to fail
#                                           until the ticket is fixed: failing
#                                           is XFAIL, passing is XPASS (time to
#                                           turn it into a plain check)
#   note "<observation>"                    neither pass nor fail, for write-ups
#   block_run "<reason>"                    the rest of the run is meaningless;
#                                           run.sh stops and exits 3
#
# Read page text into a variable before checking it, never inline:
#   text="$(ab get text main)"              stops the flow if the read fails
#   check "no error banner" not_contains "$text" "Error"
# An inline "$(ab get text main)" argument swallows the failure and hands the
# predicate an empty string.
# ---------------------------------------------------------------------------

check() {
    local what="$1"
    shift
    if "$@"; then
        printf '  \033[32m✓\033[0m %s\n' "$what"
        printf 'pass\t%s\t%s\n' "${FLOW:-?}" "$what" >>"$RESULTS"
    else
        fail "$what"
    fi
}

soft_check() {
    local what="$1"
    shift
    if "$@"; then
        printf '  \033[32m✓\033[0m %s\n' "$what"
        printf 'pass\t%s\t%s\n' "${FLOW:-?}" "$what" >>"$RESULTS"
    else
        printf '  \033[31m✗\033[0m %s (continuing)\n' "$what"
        printf 'fail\t%s\t%s\n' "${FLOW:-?}" "$what" >>"$RESULTS"
        SOFT_FAILED=1
    fi
}

known_defect() {
    local ticket="$1" what="$2"
    shift 2
    if "$@"; then
        printf '  \033[33m!\033[0m XPASS %s: %s, fixed? make it a plain check\n' "$ticket" "$what"
        printf 'xpass\t%s\t%s: %s\n' "${FLOW:-?}" "$ticket" "$what" >>"$RESULTS"
    else
        printf '  \033[33m~\033[0m XFAIL %s: %s\n' "$ticket" "$what"
        printf 'xfail\t%s\t%s: %s\n' "${FLOW:-?}" "$ticket" "$what" >>"$RESULTS"
    fi
}

note() {
    printf '  \033[36mi\033[0m %s\n' "$*"
    printf 'info\t%s\t%s\n' "${FLOW:-?}" "$*" >>"$RESULTS"
}

# Stops the whole run as blocked. It can fire inside a $(...) subshell, which
# only ends that subshell, so run.sh looks for the marker after every flow.
block_run() {
    printf '\033[35m■ blocked: %s\033[0m\n' "$*" >&2
    printf 'blocked\t%s\t%s\n' "${FLOW:-?}" "$*" >>"$RESULTS"
    touch "$OUT/BLOCKED"
    exit 0
}

# Ends a flow: fails it if any soft_check failed. A flow that ends without it
# fails the same way (see on_exit); calling it stops a flow early.
finish_flow() {
    [[ -z "${SOFT_FAILED:-}" ]] || {
        printf '\033[31m✗ %s had failed checks\033[0m\n' "${FLOW:-flow}" >&2
        FAILURE_RECORDED=1
        exit 1
    }
}

# Small predicates for check/known_defect.
not() { ! "$@"; }
contains() { [[ "$1" == *"$2"* ]]; }
# Empty text fails: it is far more often a read that failed than a blank page.
not_contains() { [[ -n "$1" && "$1" != *"$2"* ]]; }
equals() { [[ "$1" == "$2" ]]; }

# Fails the flow if a page in any of the run's sessions ($E2E_ROLES, set by
# run.sh) has thrown since the last check, then clears the buffers so each flow
# only answers for its own errors.
assert_no_page_errors() {
    local role errors failed=""
    for role in ${E2E_ROLES:-a}; do
        errors="$(as_wallet "$role" ab errors)"
        as_wallet "$role" ab errors --clear >/dev/null
        if [[ -n "$errors" ]]; then
            printf '[%s] %s\n' "$role" "$errors" >&2
            failed="$failed $role"
        fi
    done
    [[ -z "$failed" ]] || fail "page errors in ${FLOW:-flow} (sessions:$failed)"
}

# Public devnet answers bursts with HTTP 429, which @solana/kit reports as
# "Solana error #8100002".
is_rate_limited() { grep -qE '8100002|429|Too Many Requests' <<<"$1"; }

# ---------------------------------------------------------------------------
# Wallet
# ---------------------------------------------------------------------------

# A JavaScript predicate that holds once the header shows the page's test
# wallet connected: the connected wallet button's only text is the short
# address (connect-button.tsx). This is the positive signal to wait for. The
# absence of the Connect Wallet button is not: it is also absent while the
# connector is connecting, on an error page, and when an eval fails.
connected_js() {
    printf '%s' '(() => { const w = window.__mosaicTestWallet; if (!w) return false; const s = w.address.slice(0, 4) + "..." + w.address.slice(-4); return [...document.querySelectorAll("button")].some(b => b.textContent.trim() === s); })()'
}
is_connected() { [[ "$(js "$(connected_js)")" == true ]]; }
# Whether the header shows the "Connect Wallet" button.
disconnected_js() {
    printf '%s' '[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Connect Wallet")'
}
# Waits up to `ms` (default 20000) for the header to show the wallet connected.
wait_connected() { ab wait --fn "$(connected_js)" --timeout "${1:-20000}" >/dev/null 2>&1; }

is_disconnected() { [[ "$(js "$(disconnected_js)")" == true ]]; }

# Connects Mosaic Test Wallet through the header's Connect Wallet button, and
# fails the flow unless the header then shows it connected.
connect_wallet() {
    ab find role button click --name "Connect Wallet" >/dev/null
    # The connector's wallet list can trail registration on a cold load; until
    # it catches up the modal shows "Get Phantom"-style install links.
    if ! ab wait --text "Mosaic Test Wallet" --timeout 20000 >/dev/null 2>&1; then
        ab press Escape >/dev/null
        ab reload >/dev/null
        ab find role button click --name "Connect Wallet" >/dev/null
        ab wait --text "Mosaic Test Wallet" --timeout 30000 >/dev/null
    fi
    # A late auto-connect can close the modal first; that is connected too.
    is_connected || ab find role button click --name "Mosaic Test Wallet" >/dev/null
    wait_connected 20000 || fail "the wallet did not connect: the header never showed $(wallet_short)"
}

# Makes sure the page's test wallet is connected, connecting it if the header
# offers Connect Wallet, and fails the flow when the page shows neither.
#
# Needed after every full page load under `next dev`: React StrictMode mounts
# the connector's provider twice, and the first unmount calls
# `ConnectorClient.destroy()`, which disconnects and clears the stored wallet,
# so auto-connect never fires there. Production builds auto-connect normally
# (verified with `next build && next start`), which is why it waits first.
ensure_connected() {
    # agent-browser occasionally relaunches its browser ("[agent-browser]
    # relaunched browser"), and the new one has no init script, so no wallet.
    if [[ "$(js '!!window.__mosaicTestWallet')" != true ]]; then
        # test-wallet.ts leaves this marker where it cannot run at all.
        [[ -z "$(js 'window.__mosaicTestWalletUnavailable')" ]] ||
            block_run "the test wallet needs a secure context: BASE_URL must be https or localhost, not $BASE_URL"
        block_run "the browser lost the test wallet (agent-browser relaunched it without the init script); rerun"
    fi
    # Give auto-connect (production builds) a moment before stepping in, or the
    # modal opens just as it connects and closes under the click.
    wait_connected 5000 && return 0
    # Still connecting (a cold start, a slow devnet): wait for either outcome.
    ab wait --fn "($(connected_js)) || ($(disconnected_js))" --timeout "$SLOW_TIMEOUT_MS" >/dev/null 2>&1 || true
    is_connected && return 0
    is_disconnected ||
        fail "the page shows neither the connected wallet nor a Connect Wallet button (an error page, or stuck connecting)"
    connect_wallet
}

# Opens a path and makes sure the wallet is connected afterwards.
goto() {
    ab open "$BASE_URL$1" >/dev/null
    # The header renders on every route, and its "Toggle theme" text only once
    # the page has hydrated; give a cold route time to compile.
    ab wait --text "Toggle theme" --timeout "$SLOW_TIMEOUT_MS" >/dev/null ||
        fail "$1 did not render the app header within $((SLOW_TIMEOUT_MS / 1000))s"
    ensure_connected
}

# Whether the app under test is `next dev` rather than a production build: a
# dev server's pages carry the build id "development" in their inline React
# Server Components payload, and render Next's dev overlay (<nextjs-portal>).
is_dev_server() {
    [[ "$(curl -s "$BASE_URL/")" == *'\"b\":\"development\"'* ]] ||
        [[ "$(js '!!document.querySelector("nextjs-portal")')" == true ]]
}

# The connected test wallet's address, and its short header form ("SAYh...iuyC").
wallet_address() { js 'window.__mosaicTestWallet.address'; }
wallet_short() {
    local address
    address="$(wallet_address)"
    printf '%s...%s' "${address:0:4}" "${address: -4}"
}

# Drives the test wallet's failure modes; see TestWalletControl in test-wallet.ts.
#   wallet_ctl 'refuseSignMessage()'   wallet_ctl 'rejectSignTransaction(3)'   wallet_ctl 'reset()'
wallet_ctl() { js "window.__mosaicTestWallet.$1"; }
# Sign requests seen since the page loaded or the last reset(), e.g. `sign_count signTransaction`.
sign_count() { js "window.__mosaicTestWallet.counts.$1"; }

# ---------------------------------------------------------------------------
# Page
# ---------------------------------------------------------------------------

# Clicks a button by its visible text or title through the DOM. Use it where a
# pointer click lands on something else, e.g. a button in a sticky panel that
# sits under the sticky page header.
dom_click() {
    local name="${1//\"/\\\"}"
    [[ "$(js "(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === \"$name\" || b.title === \"$name\"); if (!b || b.disabled) return false; b.click(); return true; })()")" == true ]]
}

# Like dom_click, but waits up to 30s for the button to be enabled.
dom_click_when_enabled() {
    local deadline=$((SECONDS + 30))
    until dom_click "$1"; do
        ((SECONDS < deadline)) || return 1
        sleep 1
    done
}

# ---------------------------------------------------------------------------
# Chain (chain.mjs; a suite's lib can point CHAIN at its own chain-*.mjs)
# ---------------------------------------------------------------------------

CHAIN() { node "$E2E_DIR/chain.mjs" "$@"; }
sol_of() { CHAIN balance --role "$1"; }
# One field of the role's token account, e.g. `token_field a "$MINT" publicBalance`.
token_field() { CHAIN token --role "$1" --mint "$2" | jq -r ".$3"; }
# One field of a mint, e.g. `mint_field "$MINT" decimals`.
mint_field() { CHAIN mint --mint "$1" | jq -r ".$2"; }

# Token amounts in raw units: `raw 25` is 25000000 at the default 6 decimals.
# Raw amounts are u64, past both Bash arithmetic (signed 64-bit) and awk
# (doubles, exact to 2^53), so raw and raw_add count in BigInt.
raw() {
    node -e '
        const [n, d] = process.argv.slice(1);
        const m = /^(\d+)(?:\.(\d+))?$/.exec(n);
        const frac = m?.[2] ?? "";
        if (!m || !/^\d+$/.test(d) || frac.length > Number(d)) {
            console.error(`raw: ${n} is not an amount at ${d} decimals`);
            process.exit(1);
        }
        console.log((BigInt(m[1]) * 10n ** BigInt(d) + BigInt(frac.padEnd(Number(d), "0") || "0")).toString());
    ' "$1" "${2:-6}"
}
# The sum of raw amounts: `raw_add "$BEFORE" "$(raw 100)"`.
raw_add() { node -e 'console.log(process.argv.slice(1).reduce((s, a) => s + BigInt(a), 0n).toString())' "$@"; }

# Polls a command's output until it equals a value (devnet reads lag
# confirmations): `await_value 60 "$(raw 900)" token_field a "$MINT" publicBalance`.
# It always polls at least once, and a poll that fails (a 429 that outlasts
# chain.mjs's backoff, a network blip) counts as "not yet", not as the end of
# the flow.
await_value() {
    local timeout="$1" want="$2" got="" deadline
    shift 2
    deadline=$((SECONDS + timeout))
    while true; do
        got="$("$@")" || got="(the poll failed)"
        [[ "$got" == "$want" ]] && return 0
        ((SECONDS < deadline)) || break
        # Gentle: this shares the public endpoint's rate limit with the app.
        sleep "${AWAIT_POLL_S:-5}"
    done
    echo "chain: '$*' is '$got', expected '$want'" >&2
    return 1
}
