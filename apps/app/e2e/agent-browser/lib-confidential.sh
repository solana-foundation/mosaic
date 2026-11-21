# Helpers for the confidential-transfer flows (/confidential/<mint>, HOO-891).
# Sourced after lib.sh, not executed.

# ---------------------------------------------------------------------------
# Chain: chain-confidential.mjs is chain.mjs plus confidential state, proof
# contexts and fixtures.
# ---------------------------------------------------------------------------

CHAIN() { node "$E2E_DIR/chain-confidential.mjs" "$@"; }
# One field of `state`, e.g. `chain_field a "$MINT" approved`.
# Nested fields work too: `chain_field b "$MINT" decrypted.pendingBalance`.
chain_field() { CHAIN state --role "$1" --mint "$2" | jq -r ".$3"; }
# Waits until a state field reaches a value: `await_chain a "$MINT" approved true`.
await_chain() { await_value 60 "$4" chain_field "$1" "$2" "$3"; }
# Live proof-context accounts the role owns (rent a broken plan left behind).
# Compare counts before and after a step: earlier runs strand some on purpose.
context_count() { CHAIN contexts --role "$1" | jq -r .count; }

# Prints this run's mint for a policy (opt-in, whitelist or fee), creating it
# on first use with 1000 tokens minted to wallet A. Flows share it through $OUT,
# so a funded flow run on its own still gets a mint. Reuse a run's opt-in mint
# (and its configured accounts) with REUSE_OUT=<run id>.
run_mint() {
    local policy="$1" file="$OUT/mint-$1.json" args=()
    if [[ ! -s "$file" ]]; then
        case "$policy" in
            fee) args=(--policy opt-in --transfer-fee) ;;
            *) args=(--policy "$policy") ;;
        esac
        CHAIN create-mint --role a "${args[@]}" --supply 1000 >"$file" || fail "could not create the $policy mint"
        printf '    created %s mint %s\n' "$policy" "$(jq -r .mint "$file")" >&2
    fi
    jq -r .mint "$file"
}

# Long-lived devnet mints from the 2026-07/08 UI QA (mosaic-ui-qa-matrix.md
# §10j). None of them is ours to sign for, which is what the zero-SOL flows
# need: they only read, or fail before anything is sent.
FIXTURE_OPTIN_CUSTOM=4pUJ5ZZW2AshJ6QkQD93Vhi7B5PjtQPYoL39UnayDm2G   # Custom, Confidential Balances opt-in
FIXTURE_OPTIN_STABLE=Gc3XLuySGqamEyPb5tWxnQus4wJP1tkTtPKBXNT1UuKT   # Stablecoin, opt-in
FIXTURE_OPTIN_SECURITY=CXDHxc5b8EAsD8RkyTVFFCKnz3MScPCz2ZFEYyU3dqSp # Tokenized Security, opt-in
FIXTURE_WHITELIST_STABLE=BDQ8AaQa8JK2kYpEo57vSELVDYfjQJk2MQUcm62bWTpL # Stablecoin, whitelist, authority 8Gjg…GRXw
FIXTURE_WHITELIST_AUTHORITY=8GjgCWGJxgAqRm9RnQanphVBmLgfhrLbpvehgCJ6GRXw # also a plain wallet, i.e. not a mint
FIXTURE_NO_CT_ARCADE=5mv3NqSN8yZeez8u3W54TWu6GCF7CF9GWmoSYirBdFUN     # Arcade, no confidential extension

# ---------------------------------------------------------------------------
# Transaction versions
# ---------------------------------------------------------------------------

V0_NOTICE="are being sent as version-0 transactions"

# @solana/connector 0.1.4's kit adapter (createKitTransactionSigner) hand-builds
# the legacy/v0 wire layout, `[numSigs][zeroed signatures][message]`, instead
# of using kit's transaction encoder. A version-1 transaction starts with its
# message, so the wallet receives bytes it cannot decode, and every v1 sign
# fails with "Failed to sign transaction 1 of 1". The app's v1 -> v0 fallback
# (V1_UNSUPPORTED in execute-confidential-plan.ts) does not recognise that text.
CONNECTOR_V1_FAILURE="version-1 transaction: Failed to sign transaction"

# Expected plan lengths. Version 0 is measured (2026-09-02, and every run
# since); version 1 folds proof setup into fewer transactions, so it is only
# expected to be shorter.
TRANSFER_TXS_V0=5
WITHDRAW_TXS_V0=4
# expect_plan_length <what> <observed> <v0 length>
expect_plan_length() {
    local what="$1" got="$2" v0="$3"
    if [[ "$TX_VERSION" == 0 ]]; then
        soft_check "$what is $v0 transactions at version 0" equals "$got" "$v0"
    else
        soft_check "$what takes fewer transactions at version 1 ($got) than at version 0 ($v0)" test "${got:-99}" -lt "$v0"
    fi
}

# ---------------------------------------------------------------------------
# The wizard
# ---------------------------------------------------------------------------

# Puts data-e2e-step="N" on each wizard card, N being the card's step number.
# The amount inputs have no accessible name (their <label> is not tied to the
# input) and share the "0.00" placeholder, so cards are the only way to tell
# them apart. React leaves attributes it does not own alone, so tags survive
# re-renders; call again after a navigation.
tag_cards() {
    js '(() => { let n = 0; for (const h of document.querySelectorAll("h3")) { const card = h.closest(".rounded-2xl"); const num = card?.querySelector(".rounded-full")?.textContent?.trim(); if (card && /^[1-8]$/.test(num ?? "")) { card.dataset.e2eStep = num; n++; } } return n; })()'
}

# Wizard step numbers by name.
STEP_CONFIGURE=1 STEP_APPROVE=2 STEP_CREDITS=3 STEP_DEPOSIT=4 STEP_APPLY=5 STEP_TRANSFER=6 STEP_WITHDRAW=7 STEP_EMPTY=8

# Opens the wizard for a mint, waits for all eight cards, and checks the app
# plans in this run's transaction version: the version-0 notice shows exactly
# when the app falls back to version 0 (it hides while the RPC probe runs).
open_wizard() {
    goto "/confidential/$1"
    wait_slow "Empty confidential balance"
    local tagged
    tagged="$(tag_cards)"
    [[ "$tagged" == 8 ]] || fail "expected 8 wizard cards, tagged $tagged"
    if [[ "$TX_VERSION" == 0 ]]; then
        ab wait --text "$V0_NOTICE" --timeout 20000 >/dev/null 2>&1 ||
            fail "the wizard is not on version-0 transactions"
    else
        sleep 5
        not contains "$(ab get text main)" "$V0_NOTICE" ||
            fail "the wizard fell back to version-0 transactions; does the RPC run Agave >= 4.2.2?"
    fi
}

# The visible text of one card.
card_text() {
    js "document.querySelector('[data-e2e-step=\"$1\"]')?.innerText ?? ''"
}

# Whether a card's action button (found by its label) is enabled:
# `card_enabled $STEP_DEPOSIT "Deposit to pending"`.
card_enabled() {
    local label="${2//\"/\\\"}"
    [[ "$(js "[...document.querySelectorAll('[data-e2e-step=\"$1\"] button')].find(b => b.textContent.trim() === \"$label\")?.disabled === false")" == true ]]
}

# Fills a card's amount or address field. Uses agent-browser's fill so React
# sees real input events.
card_fill_amount() { ab fill "[data-e2e-step=\"$1\"] input[placeholder=\"0.00\"]" "$2" >/dev/null; }
card_fill_address() { ab fill "[data-e2e-step=\"$1\"] input[placeholder\$=\"address...\"]" "$2" >/dev/null; }

# Clicks a card's action button by its label, e.g. `card_run "Deposit to pending"`.
card_run() { ab find role button click --name "$1" --exact >/dev/null; }

# Waits until a card shows either its success box or an error, then prints the
# card text. Exits 1 on timeout.
card_settle() {
    local step="$1" timeout_s="${2:-180}" text deadline=$((SECONDS + ${2:-180}))
    while ((SECONDS < deadline)); do
        text="$(card_text "$step")"
        if [[ "$text" != *"Sending"* ]] && [[ "$text" == *"Success — "* || -n "$(card_error "$step")" ]]; then
            printf '%s' "$text"
            return 0
        fi
        sleep 2
    done
    echo "card $step did not settle within ${timeout_s}s" >&2
    return 1
}

# A card's error line, empty when there is none.
card_error() {
    js "document.querySelector('[data-e2e-step=\"$1\"] p.text-destructive')?.innerText ?? ''"
}

# How many transactions a card's success box reports, or empty.
card_tx_count() {
    card_text "$1" | sed -n 's/.*Success — \([0-9]*\) transaction.*/\1/p' | head -1
}

# What run_card prints for a post-signing 429, so callers can tell it apart.
RATE_LIMITED_AFTER_SIGNING="(rate-limited after signing)"

# Clicks a card's action and waits for it to settle, retrying a 429 that hit
# before the wallet signed anything. Prints the card's error, empty on success.
# Exits 1 if the card never settles.
#
# Public devnet rate-limits, and the wizard builds plans over a plain
# createSolanaRpc: only the executor's own send/status calls back off. A 429
# while building therefore fails the step before anything is signed, with the
# raw "Solana error #8100002" on the card. That is recorded as a known defect
# and the step is retried, which is safe because nothing was sent.
#
# A 429 *after* signing is never retried: the executor polls confirmations
# with a bounded backoff, so a rate-limit storm can make the card report a
# failure for transactions that landed, and clicking again sends them twice.
# That case is recorded as a known defect and left to the flow's chain checks.
run_card() {
    local step="$1" label="$2" timeout="${3:-300}" error attempt signed_before signed_after
    for attempt in 1 2 3 4; do
        signed_before="$(sign_count signTransaction)"
        # Spread the load on the public endpoint a little between steps.
        sleep "${STEP_PAUSE_S:-3}"
        card_run "$label"
        card_settle "$step" "$timeout" >/dev/null || return 1
        error="$(card_error "$step")"
        signed_after="$(sign_count signTransaction)"
        if [[ -n "$error" ]] && is_rate_limited "$error" && [[ "$signed_after" != "$signed_before" ]]; then
            printf '  \033[33m~\033[0m XFAIL HOO-1429: step %s reported a 429 after the wallet signed %s tx; not retrying, the chain decides\n' \
                "$step" "$((signed_after - signed_before))" >&2
            printf 'xfail\t%s\t%s\n' "${FLOW:-?}" "HOO-1429: step $step reports failure on a 429 after $((signed_after - signed_before)) tx were signed, though they may have landed (retrying would send them twice): ${error:0:100}" >>"$RESULTS"
            printf '%s:%s' "$RATE_LIMITED_AFTER_SIGNING" "$((signed_after - signed_before))"
            return 0
        fi
        if [[ -n "$error" ]] && is_rate_limited "$error" && ((attempt < 4)); then
            printf '  \033[33m~\033[0m XFAIL HOO-1429: step %s hit a devnet 429 while building; retrying\n' "$step" >&2
            printf 'xfail\t%s\t%s\n' "${FLOW:-?}" "HOO-1429: a 429 while building step $step surfaces as a raw 'Solana error #8100002' instead of being retried" >>"$RESULTS"
            sleep $((10 * attempt))
            continue
        fi
        printf '%s' "$error"
        return 0
    done
}

# Runs a step to completion and fails the flow unless it succeeded. Prints the
# transaction count (after a post-signing 429: how many the wallet signed).
run_step_ok() {
    local step="$1" label="$2" error
    error="$(run_card "$step" "$label")" || fail "step $step ($label) did not finish"
    [[ "$TX_VERSION" == 1 && "$error" == *"$CONNECTOR_V1_FAILURE"* ]] &&
        block_run "connector-0.1.4: step $step cannot sign a version-1 transaction (the connector frames it as v0 for the wallet, and the app's v1 -> v0 fallback does not catch it)"
    # The flow's chain checks decide whether it landed; report what was signed.
    if [[ "$error" == "$RATE_LIMITED_AFTER_SIGNING:"* ]]; then
        printf '%s' "${error#*:}"
        return 0
    fi
    [[ -z "$error" ]] || fail "step $step ($label) failed: $error"
    card_tx_count "$step"
}

# ---------------------------------------------------------------------------
# The balance panel
# ---------------------------------------------------------------------------

panel_text() {
    js '(() => { const r = [...document.querySelectorAll("p")].find(p => p.textContent === "Public (non-confidential)"); return r?.closest(".rounded-2xl, [class*=card]")?.innerText ?? ""; })()'
}

# The panel is sticky, so its header can sit under the page header: click
# through the DOM, and wait out the panel disabling its buttons while it reloads.
panel_refresh() { dom_click_when_enabled "Refresh" || fail "no enabled Refresh button"; }
panel_reveal() { dom_click_when_enabled "Reveal" || fail "no enabled Reveal button"; }
