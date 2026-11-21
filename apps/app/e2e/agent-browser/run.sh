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
#   MOSAIC_TEST_KEYPAIR_B       wallet B keypair (default ~/.config/solana/mosaic-e2e-b.json)
#   MOSAIC_TEST_KEYPAIR_MASTER  optional faucet-funded wallet that refills A
#                               (default ~/.config/solana/mosaic-e2e-master.json)
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
OUT="$APP_ROOT/.agent-browser/runs/$RUN_ID"
# Fresh sessions per run: init scripts only apply when a session's browser
# launches, and closing then reopening one name races the daemon's shutdown.
AB_SESSION="${AB_SESSION:-mosaic-e2e-$RUN_ID}"
export MOSAIC_TEST_KEYPAIR_A="${MOSAIC_TEST_KEYPAIR_A:-${MOSAIC_TEST_KEYPAIR:-$HOME/.config/solana/mosaic-e2e-a.json}}"
export MOSAIC_TEST_KEYPAIR_B="${MOSAIC_TEST_KEYPAIR_B:-$HOME/.config/solana/mosaic-e2e-b.json}"
export MOSAIC_TEST_KEYPAIR_MASTER="${MOSAIC_TEST_KEYPAIR_MASTER:-$HOME/.config/solana/mosaic-e2e-master.json}"
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
MIN_SOL_A="${MIN_SOL_A:-0.3}"
MIN_SOL_B="${MIN_SOL_B:-0.03}"

step "pre-flight"
command -v agent-browser >/dev/null || fail "agent-browser not installed: npm i -g agent-browser && agent-browser install"
command -v jq >/dev/null || fail "jq not installed"
curl -sf -o /dev/null "$BASE_URL/" || fail "no app at $BASE_URL; start it with: pnpm build && pnpm start (or pnpm dev)"

A_ADDRESS="$(CHAIN address --role a)"
B_ADDRESS="$(CHAIN address --role b)"
export TEST_WALLET_SHORT="${A_ADDRESS:0:4}...${A_ADDRESS: -4}"
A_SOL="$(CHAIN balance --role a)"
B_SOL="$(CHAIN balance --role b)"
echo "wallet A $A_ADDRESS: $A_SOL SOL"
echo "wallet B $B_ADDRESS: $B_SOL SOL"
if ((FUNDED)); then
    # Refill A from the master wallet when there is one, rather than asking for the faucet.
    if awk "BEGIN{exit !($A_SOL < $MIN_SOL_A)}" && [[ -f "$MOSAIC_TEST_KEYPAIR_MASTER" ]]; then
        MASTER_SOL="$(CHAIN balance --role master)"
        TOP_UP="${TOP_UP_A:-0.5}"
        echo "master wallet $(CHAIN address --role master): $MASTER_SOL SOL"
        if awk "BEGIN{exit !($MASTER_SOL >= $TOP_UP + 0.01)}"; then
            echo "topping up wallet A with $TOP_UP SOL from the master wallet"
            CHAIN fund --role master --to "$A_ADDRESS" --sol "$TOP_UP" >/dev/null
            A_SOL="$(CHAIN balance --role a)"
        fi
    fi
    awk "BEGIN{exit !($A_SOL < $MIN_SOL_A)}" &&
        fail "the funded flows need at least $MIN_SOL_A devnet SOL on wallet A; top up the master wallet (or $A_ADDRESS) at https://faucet.solana.com"
    if [[ " ${SESSIONS[*]} " == *" b "* ]] && awk "BEGIN{exit !($B_SOL < $MIN_SOL_B)}"; then
        echo "topping up wallet B from wallet A"
        CHAIN fund --role a --to "$B_ADDRESS" --sol 0.05 >/dev/null
    fi
fi

step "build the test wallets (transactions: version $TX_VERSION)"
# A plain string, not an array: macOS bash 3.2 treats an empty array as unset under `set -u`.
V1=""
[[ "$TX_VERSION" == 1 ]] && V1="--tx-v1"
build() { node "$HERE/build-test-wallet.mjs" "$@"; }
for role in "${SESSIONS[@]}"; do
    case "$role" in
        a) build --keypair "$MOSAIC_TEST_KEYPAIR_A" --alt "$MOSAIC_TEST_KEYPAIR_B" $V1 --out test-wallet-a.js ;;
        b) build --keypair "$MOSAIC_TEST_KEYPAIR_B" $V1 --out test-wallet-b.js ;;
        nosign) build --keypair "$MOSAIC_TEST_KEYPAIR_A" --no-sign-message --out test-wallet-a-nosign.js ;;
        *) fail "unknown session role '$role' in a flow's '# e2e: sessions=' line" ;;
    esac
done

launch() {
    local role="$1" bundle="test-wallet-$1.js"
    [[ "$role" == nosign ]] && bundle=test-wallet-a-nosign.js
    local args=(--init-script "$APP_ROOT/.agent-browser/$bundle")
    [[ "${HEADED:-}" == 1 ]] && args+=(--headed)
    as_wallet "$role" ab "${args[@]}" open about:blank >/dev/null
    # Tall enough that sticky panels clear the page header.
    as_wallet "$role" ab set viewport 1440 1600 >/dev/null
}
step "launch fresh browser sessions ($AB_SESSION: ${SESSIONS[*]})"
for role in "${SESSIONS[@]}"; do launch "$role"; done

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
    if [[ "${KEEP_OPEN:-}" == 1 ]]; then
        echo "sessions left open: agent-browser --session $AB_SESSION snapshot -i (roles: ${SESSIONS[*]})"
    else
        for role in "${SESSIONS[@]}"; do as_wallet "$role" ab close >/dev/null 2>&1 || true; done
    fi
}

cleanup() {
    local status=$?
    if [[ $status -ne 0 ]]; then
        for role in "${SESSIONS[@]}"; do
            as_wallet "$role" ab screenshot "$OUT/failure-$role.png" >/dev/null 2>&1 &&
                echo "failure screenshot: $OUT/failure-$role.png" >&2
            as_wallet "$role" ab console >"$OUT/console-$role.log" 2>&1 || true
        done
        # A Next.js dev overlay or uncaught exception usually explains a timed-out wait.
        ab errors >&2 || true
    fi
    summarise
    close_sessions
    exit $status
}
trap cleanup EXIT

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
