#!/usr/bin/env bash
# Runs agent-browser flows against a running Mosaic app, on devnet, with test
# wallets injected.
#
# Usage (from apps/app): pnpm e2e:agent [flow|group ...]
#   no arguments     the `smoke` group
#   <flow>           flows/<flow>.sh
#   <group>          groups/<group>.group: one flow or @group per line, `#` comments,
#                    and an optional `tx-version: 0|1` line. A group made only of
#                    @groups and without a tx-version is a suite of runs: each of
#                    its groups runs as its own run.
#
# A flow declares what it needs in a header line, read before anything launches:
#   # e2e: sessions=b,nosign funded
#   sessions=  extra wallet sessions besides A: b (wallet B), nosign (A without signMessage)
#   funded     the flow spends devnet SOL, so pre-flight checks and refills wallet A
#
#   BASE_URL                    app under test (default http://localhost:3000)
#   TX_VERSION=0|1              the transaction version the wallets advertise
#                               (default: the group's tx-version, else 0)
#   MOSAIC_TEST_KEYPAIR_A       wallet A keypair (default $MOSAIC_TEST_KEYPAIR, else ~/.config/solana/mosaic-e2e-a.json)
#   MOSAIC_TEST_KEYPAIR_B       wallet B keypair (default ~/.config/solana/mosaic-e2e-b.json); required
#                               only by flows with sessions=b, otherwise wallet A's alt account
#   MOSAIC_TEST_KEYPAIR_MASTER  optional faucet-funded wallet that refills A
#                               (default ~/.config/solana/mosaic-e2e-master.json)
#                               All three resolve through keypairs.mjs, as the wallet bundles do.
#   SOLANA_RPC_URL              RPC for pre-flight and chain.mjs (default public devnet); only
#                               funded runs read balances
#   MIN_SOL_A / TOP_UP_A        refill A from master below MIN_SOL_A (0.3), by TOP_UP_A (0.5)
#   HEADED=1                    show the browser windows instead of running headless
#   KEEP_OPEN=1                 leave the sessions open afterwards for poking around
#   AB_SESSION                  session name prefix (default: mosaic-e2e-<run id>)
#   REUSE_OUT=<run id>          copy that run's handed-over files (mint-*.json, *.txt)
#                               into this run, e.g. to resume after a failure
#
# Exit status: 0 green (XFAILs allowed), 1 a check failed, 3 blocked (see block_run).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$HERE/../.." && pwd)"
GROUPS_DIR="$HERE/groups"

group_file() { printf '%s/%s.group' "$GROUPS_DIR" "$1"; }
# A group's entries, without comments, blank lines or directives.
group_entries() { sed -e 's/#.*//' -e '/^[[:space:]]*$/d' -e '/^[a-z-]*:/d' "$(group_file "$1")" | tr -d ' \t\r' | tr '\n' ' '; }
group_tx_version() { sed -n 's/^tx-version:[[:space:]]*\([01]\).*/\1/p' "$(group_file "$1")" | head -1; }

# A suite of runs: every entry is an @group and the group sets no tx-version.
# Run each entry as its own run, since each can need its own wallet build
# (transaction version).
if (($# == 1)) && [[ -f "$(group_file "$1")" ]] && [[ -z "$(group_tx_version "$1")" ]]; then
    entries=($(group_entries "$1"))
    suite=1
    for e in "${entries[@]}"; do [[ "$e" == @* ]] || suite=0; done
    if ((suite)); then
        status=0
        for e in "${entries[@]}"; do
            bash "$0" "${e#@}" || { rc=$?; ((status == 0 || rc == 1)) && status=$rc; }
        done
        exit $status
    fi
fi

# Expand the arguments into flows, and take the transaction version from the
# groups that set one.
FLOWS=()
GROUP_TX=""
expand() {
    local name="$1" e
    if [[ -f "$(group_file "$name")" ]]; then
        local tx
        tx="$(group_tx_version "$name")"
        if [[ -n "$tx" ]]; then
            [[ -z "$GROUP_TX" || "$GROUP_TX" == "$tx" ]] || {
                echo "run.sh: groups with different tx-versions; run them separately" >&2
                exit 1
            }
            GROUP_TX="$tx"
        fi
        for e in $(group_entries "$name"); do expand "${e#@}"; done
    else
        FLOWS+=("$name")
    fi
}
for arg in "${@:-smoke}"; do expand "$arg"; done

export TX_VERSION="${TX_VERSION:-${GROUP_TX:-0}}"
[[ "$TX_VERSION" == 0 || "$TX_VERSION" == 1 ]] || { echo "TX_VERSION must be 0 or 1" >&2; exit 1; }

RUN_ID="$(date +%Y%m%d-%H%M%S)-v$TX_VERSION"
# A run started in the same second as another gets a directory of its own.
[[ ! -e "$APP_ROOT/.agent-browser/runs/$RUN_ID" ]] || RUN_ID="$RUN_ID-$$"
OUT="$APP_ROOT/.agent-browser/runs/$RUN_ID"
# Fresh sessions per run: init scripts only apply when a session's browser
# launches, and closing then reopening one name races the daemon's shutdown.
AB_SESSION="${AB_SESSION:-mosaic-e2e-$RUN_ID}"
export OUT AB_SESSION
source "$HERE/lib.sh"

if [[ -n "${REUSE_OUT:-}" ]]; then
    src="$APP_ROOT/.agent-browser/runs/$REUSE_OUT"
    [[ -d "$src" ]] || fail "no run $REUSE_OUT"
    find "$src" -maxdepth 1 \( -name 'mint-*.json' -o -name '*.txt' \) -exec cp {} "$OUT/" \;
fi

# What the flows ask for (their `# e2e:` header lines).
flow_meta() { sed -n 's/^# e2e:[[:space:]]*//p' "$HERE/flows/$1.sh" | head -1; }
SESSIONS=(a)
FUNDED=0
for flow in "${FLOWS[@]}"; do
    [[ -f "$HERE/flows/$flow.sh" ]] || fail "no such flow or group: $flow"
    meta=" $(flow_meta "$flow") "
    [[ "$meta" == *" funded "* ]] && FUNDED=1
    roles="$(sed -n 's/.* sessions=\([a-z,]*\).*/\1/p' <<<"$meta")"
    for role in ${roles//,/ }; do
        [[ " ${SESSIONS[*]} " == *" $role "* ]] || SESSIONS+=("$role")
    done
done
has_session() { [[ " ${SESSIONS[*]} " == *" $1 "* ]]; }

# Sessions whose browser launch has started, space-separated (a plain string:
# macOS bash 3.2 treats an empty array as unset under `set -u`). Cleanup only
# touches these: agent-browser starts a browser on demand for any other name.
LAUNCHED=""
summarise() {
    [[ -s "$RESULTS" ]] || return 0
    local kind
    printf '\n\033[1mresults, transactions v%s\033[0m (%s)\n' "$TX_VERSION" "$RESULTS"
    for kind in pass fail xfail xpass blocked; do
        printf '  %-7s %s\n' "$kind" "$(grep -c "^$kind	" "$RESULTS" || true)"
    done
    grep -E '^(fail|xfail|xpass|blocked)	' "$RESULTS" | awk -F'\t' '{printf "    %-7s %-30s %s\n", $1, $2, $3}' || true
}

close_sessions() {
    [[ -n "$LAUNCHED" ]] || return 0
    local role
    if [[ "${KEEP_OPEN:-}" == 1 ]]; then
        echo "sessions left open: agent-browser --session $AB_SESSION snapshot -i (roles:$LAUNCHED)"
    else
        for role in $LAUNCHED; do as_wallet "$role" ab close >/dev/null 2>&1 || true; done
    fi
}

cleanup() {
    local status=$? role
    if [[ $status -ne 0 ]]; then
        for role in $LAUNCHED; do
            as_wallet "$role" ab screenshot "$OUT/failure-$role.png" >/dev/null 2>&1 &&
                echo "failure screenshot: $OUT/failure-$role.png" >&2
            as_wallet "$role" ab console >"$OUT/console-$role.log" 2>&1 || true
        done
        # A Next.js dev overlay or uncaught exception usually explains a timed-out wait.
        if [[ -n "$LAUNCHED" ]]; then ab errors >&2 || true; fi
    fi
    summarise
    close_sessions
    exit $status
}
# Armed before anything launches, so a failed pre-flight or launch (or Ctrl-C)
# still closes the browsers already started.
trap cleanup EXIT
trap 'exit 130' INT TERM

# Values from chain.mjs are checked before they are used, and compared through
# awk variables rather than spliced into an awk program.
NUMBER_RE='^[0-9]+(\.[0-9]+)?([eE]-?[0-9]+)?$'
ADDRESS_RE='^[1-9A-HJ-NP-Za-km-z]{32,44}$'
is_number() { [[ "$1" =~ $NUMBER_RE ]]; }
lt() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a + 0 < b + 0) }'; }
# A role's SOL balance; fails the run unless chain.mjs printed a number.
balance_of() {
    local sol
    sol="$(CHAIN balance --role "$1")" || fail "could not read wallet $1's balance (RPC: ${SOLANA_RPC_URL:-public devnet})"
    is_number "$sol" || fail "wallet $1's balance is not a number: '$sol'"
    printf '%s\n' "$sol"
}

MIN_SOL_A="${MIN_SOL_A:-0.3}"
MIN_SOL_B="${MIN_SOL_B:-0.03}"
TOP_UP_A="${TOP_UP_A:-0.5}"
for setting in MIN_SOL_A MIN_SOL_B TOP_UP_A; do
    is_number "${!setting}" || fail "$setting must be a number of SOL, got '${!setting}'"
done

step "pre-flight"
command -v agent-browser >/dev/null || fail "agent-browser not installed: npm i -g agent-browser && agent-browser install"
command -v jq >/dev/null || fail "jq not installed"
curl -sf -o /dev/null "$BASE_URL/" || fail "no app at $BASE_URL; start it with: pnpm build && pnpm start (or pnpm dev)"

# Keypairs resolve through keypairs.mjs, the same way the wallet bundles do.
A_ADDRESS="$(CHAIN address --role a)" || fail "no wallet A keypair (see keypairs.mjs)"
[[ "$A_ADDRESS" =~ $ADDRESS_RE ]] || fail "wallet A's address is not an address: '$A_ADDRESS'"
export TEST_WALLET_SHORT="${A_ADDRESS:0:4}...${A_ADDRESS: -4}"
echo "wallet A $A_ADDRESS"
# Wallet B is required only by flows that open its session; otherwise it is
# wallet A's alt account (switchAccount()) when its keypair exists.
if has_session b; then
    B_ADDRESS="$(CHAIN address --role b)" || fail "the flows need wallet B (sessions=b), and its keypair cannot be read"
else
    B_ADDRESS="$(CHAIN address --role b 2>/dev/null)" || B_ADDRESS=""
fi
if [[ -n "$B_ADDRESS" ]]; then
    echo "wallet B $B_ADDRESS"
else
    echo "no wallet B keypair: wallet A is built without an alt account, so switchAccount() is unavailable"
fi

# Only a funded run reads balances, so the others need no devnet at all.
if ((FUNDED)); then
    A_SOL="$(balance_of a)"
    echo "wallet A holds $A_SOL SOL"
    if lt "$A_SOL" "$MIN_SOL_A"; then
        # Refill A from the master wallet when there is one, rather than asking for the faucet.
        MASTER_ADDRESS="$(CHAIN address --role master 2>/dev/null)" || MASTER_ADDRESS=""
        if [[ -n "$MASTER_ADDRESS" ]]; then
            MASTER_SOL="$(balance_of master)"
            echo "master wallet $MASTER_ADDRESS: $MASTER_SOL SOL"
            if ! lt "$MASTER_SOL" "$(awk -v t="$TOP_UP_A" 'BEGIN { print t + 0.01 }')"; then
                echo "topping up wallet A with $TOP_UP_A SOL from the master wallet"
                CHAIN fund --role master --to "$A_ADDRESS" --sol "$TOP_UP_A" >/dev/null
                A_SOL="$(balance_of a)"
            fi
        fi
    fi
    if lt "$A_SOL" "$MIN_SOL_A"; then
        fail "the funded flows need at least $MIN_SOL_A devnet SOL on wallet A; top up the master wallet (or $A_ADDRESS) at https://faucet.solana.com"
    fi
    if has_session b; then
        B_SOL="$(balance_of b)"
        echo "wallet B holds $B_SOL SOL"
        if lt "$B_SOL" "$MIN_SOL_B"; then
            echo "topping up wallet B from wallet A"
            CHAIN fund --role a --to "$B_ADDRESS" --sol 0.05 >/dev/null
        fi
    fi
fi

step "build the test wallets (transactions: version $TX_VERSION)"
# Plain strings, not arrays: macOS bash 3.2 treats an empty array as unset under `set -u`.
V1=""
[[ "$TX_VERSION" == 1 ]] && V1="--tx-v1"
ALT=""
[[ -n "$B_ADDRESS" ]] && ALT="--alt-role b"
build() { node "$HERE/build-test-wallet.mjs" "$@"; }
for role in "${SESSIONS[@]}"; do
    case "$role" in
        a) build --role a $ALT $V1 --out test-wallet-a.js ;;
        b) build --role b $V1 --out test-wallet-b.js ;;
        nosign) build --role a --no-sign-message --out test-wallet-a-nosign.js ;;
        *) fail "unknown session role '$role' in a flow's '# e2e: sessions=' line" ;;
    esac
done

launch() {
    local role="$1" bundle="test-wallet-$1.js"
    [[ "$role" == nosign ]] && bundle=test-wallet-a-nosign.js
    local args=(--init-script "$APP_ROOT/.agent-browser/$bundle")
    [[ "${HEADED:-}" == 1 ]] && args+=(--headed)
    # Recorded before the browser starts, so cleanup also closes a session
    # whose launch failed halfway.
    LAUNCHED="$LAUNCHED $role"
    as_wallet "$role" ab "${args[@]}" open about:blank >/dev/null
    # Tall enough that sticky panels clear the page header.
    as_wallet "$role" ab set viewport 1440 1600 >/dev/null
}
step "launch fresh browser sessions ($AB_SESSION: ${SESSIONS[*]})"
for role in "${SESSIONS[@]}"; do launch "$role"; done

for flow in "${FLOWS[@]}"; do
    printf '\n\033[1;34m=== %s ===\033[0m\n' "$flow"
    # block_run can fire inside a $(...) subshell, which only ends that
    # subshell; the flow then fails on its next check. So look for the marker
    # whether the flow passed or failed.
    flow_status=0
    bash "$HERE/flows/$flow.sh" || flow_status=$?
    if [[ -f "$OUT/BLOCKED" ]]; then
        printf '\n\033[35m■ run blocked during %s; remaining flows skipped\033[0m\n' "$flow"
        trap - EXIT
        summarise
        close_sessions
        exit 3
    fi
    ((flow_status == 0)) || exit "$flow_status"
done

ab screenshot "$OUT/final.png" >/dev/null
printf '\n\033[32m✓ all flows passed\033[0m (%s)\n' "$OUT"
