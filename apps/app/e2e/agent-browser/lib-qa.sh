# Helpers for the qa-* suites (the UI QA matrix). Sourced after lib.sh.
#
# Fixtures: fixtures/qa-devnet.json lists devnet mints made by hand during the
# manual QA pass. Their authorities belong to a wallet the test wallets do not
# hold, so they are also the "connected wallet is not the authority" case.

FIXTURES="$E2E_DIR/fixtures/qa-devnet.json"

# A fixture field: `fixture stablecoin` is the mint, `fixture stablecoin template` another field.
fixture() { jq -r ".mints[\"$1\"].${2:-mint}" "$FIXTURES"; }
fixture_keys() { jq -r '.mints | keys[]' "$FIXTURES"; }

# The mint as chain.mjs reads it (JSON), and one jq path of it.
mint_json() { CHAIN mint --mint "$1"; }
mint_field() { CHAIN mint --mint "$1" | jq -r "$2"; }

# Display names the Extensions tab uses for each on-chain extension kind
# (EXTENSION_CONFIG in features/token-management/components/token-extensions.tsx).
ext_display_name() {
    case "$1" in
        TokenMetadata) echo "Metadata" ;;
        MetadataPointer) echo "Metadata Pointer" ;;
        PausableConfig) echo "Pausable" ;;
        DefaultAccountState) echo "Default Account State" ;;
        ConfidentialTransferMint) echo "Confidential Balances" ;;
        ScaledUiAmountConfig) echo "Scaled UI Amount" ;;
        PermanentDelegate) echo "Permanent Delegate" ;;
        TransferFeeConfig) echo "Transfer Fee" ;;
        InterestBearingConfig) echo "Interest Bearing" ;;
        NonTransferable) echo "Non-Transferable" ;;
        TransferHook) echo "Transfer Hook" ;;
        *) echo "$1" ;;
    esac
}

# ---------------------------------------------------------------------------
# Page reads
# ---------------------------------------------------------------------------

ls_get() { js "localStorage.getItem('$1')"; }
# Visible text of the open dialog (Radix Dialog or AlertDialog), empty if none.
dialog_text() { js '(() => { const d = [...document.querySelectorAll("[role=dialog],[role=alertdialog]")].pop(); return d ? d.innerText : ""; })()'; }
# Text of the open popover or dropdown menu (wallet menu, network settings, selectors).
popper_text() { js 'document.querySelector("[data-radix-popper-content-wrapper]")?.innerText ?? ""'; }
main_text() { js 'document.querySelector("main")?.innerText ?? document.body.innerText'; }
toasts() { js '[...document.querySelectorAll("[data-sonner-toast]")].map(t => t.innerText.replace(/\s+/g, " ")).join(" | ")'; }

# A button's state by its exact visible text (or aria-label, or title), inside the topmost
# open dialog when there is one: prints "enabled", "disabled" or "missing".
button_state() {
    local name="${1//\"/\\\"}"
    js "(() => {
        const roots = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')];
        const root = roots.length ? roots[roots.length - 1] : document;
        const b = [...root.querySelectorAll('button')].find(b => b.innerText.trim() === \"$name\" || b.getAttribute('aria-label') === \"$name\" || b.title === \"$name\");
        return !b ? 'missing' : b.disabled ? 'disabled' : 'enabled';
    })()"
}
btn_enabled() { [[ "$(button_state "$1")" == enabled ]]; }
btn_disabled() { [[ "$(button_state "$1")" == disabled ]]; }
btn_present() { case "$(button_state "$1")" in enabled | disabled) return 0 ;; *) return 1 ;; esac; }
btn_missing() { [[ "$(button_state "$1")" == missing ]]; }

# Clicks a button by exact text inside the topmost dialog (or the page).
dialog_click() {
    local name="${1//\"/\\\"}"
    [[ "$(js "(() => {
        const roots = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')];
        const root = roots.length ? roots[roots.length - 1] : document;
        const b = [...root.querySelectorAll('button')].find(b => b.innerText.trim() === \"$name\");
        if (!b || b.disabled) return false;
        b.click();
        return true;
    })()")" == true ]]
}

# Sets an input's value by element id the way React sees a user edit (native
# setter + input event). Use it where `ab fill` cannot express the value, such
# as clearing a field or typing into a datetime-local input.
set_input() {
    local id="$1" value="${2//\\/\\\\}"
    value="${value//\"/\\\"}"
    js "(() => {
        const i = document.getElementById('$1');
        if (!i) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, \"$value\");
        i.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    })()" | grep -q true
}

# Waits up to $2 seconds (default 10) for a predicate command to pass.
eventually() {
    local timeout="$1"
    shift
    local deadline=$((SECONDS + timeout))
    until "$@"; do
        ((SECONDS < deadline)) || return 1
        sleep 0.5
    done
}

# Closes whatever dialog or menu is open.
escape_all() {
    ab press Escape >/dev/null 2>&1 || true
    ab press Escape >/dev/null 2>&1 || true
}

# Whether the page scrolls sideways (content wider than the viewport).
has_horizontal_overflow() {
    [[ "$(js 'document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')" == true ]]
}

# ---------------------------------------------------------------------------
# Wallet guard for the free suites
# ---------------------------------------------------------------------------

# Arms the wallet to reject the next transaction, so a submit that does reach
# the wallet costs nothing. Afterwards `sign_count signTransaction` says whether
# it got that far. Counters reset on a full page load, so arm after `goto`.
arm_reject() {
    wallet_ctl 'reset()' >/dev/null
    wallet_ctl 'rejectSignTransaction(1)' >/dev/null
}
no_sign_requests() { [[ "$(sign_count signTransaction)" == 0 ]]; }

# Replaces window.confirm with one that records its message and answers $1
# (true by default). Read the calls back with `confirm_calls`.
stub_confirm() {
    js "(() => { window.__qaConfirms = []; window.confirm = m => { window.__qaConfirms.push(String(m)); return ${1:-true}; }; return true; })()" >/dev/null
}
confirm_calls() { js '(window.__qaConfirms ?? []).length'; }
confirm_last() { js '(window.__qaConfirms ?? []).slice(-1)[0] ?? ""'; }

# ---------------------------------------------------------------------------
# Dashboard and import
# ---------------------------------------------------------------------------

# Removes every token from this browser's dashboard (mosaic_tokens) and reloads.
clear_dashboard() {
    js 'localStorage.removeItem("mosaic_tokens")' >/dev/null
    goto "/"
}

# Opens the import modal from the dashboard (empty-state card or header icon).
open_import() {
    if ! ab find role button click --name "Import existing token" >/dev/null 2>&1; then
        ab find role button click --name "Import token" >/dev/null
    fi
    ab wait --text "Import Existing Token" >/dev/null
}

# Imports a mint through the modal, optionally choosing a Token Type
# ("Stablecoin", "Arcade Token", "Tokenized Security"), and waits for the
# success state; the modal then closes itself. Public devnet sometimes fails
# the metadata fetch ("Failed to fetch token metadata", a 429 underneath), so
# that error is retried up to three times.
import_token() {
    local mint="$1" type="${2:-}" attempt text
    # Re-importing asks through a native window.confirm, which blocks the page
    # for every later command. Answer it yes unless a flow stubbed it itself.
    [[ "$(js '!!window.__qaConfirms')" == true ]] || stub_confirm true
    open_import
    ab find label "Token Address" fill "$mint" >/dev/null
    if [[ -n "$type" ]]; then
        ab find role combobox click --name "Token Type (Optional)" >/dev/null
        ab find role option click --name "$type" >/dev/null
    fi
    for attempt in 1 2 3; do
        ab find role button click --name "Import Token" >/dev/null
        eventually 60 eval '[[ "$(dialog_text)" == *"Successfully Imported"* || "$(dialog_text)" == *"Failed to import"* || -z "$(dialog_text)" ]]' || {
            echo "import of $mint did not finish within 60s: $(dialog_text | tr '\n' ' ' | cut -c1-300)" >&2
            return 1
        }
        text="$(dialog_text)"
        # Success is the success copy, or the modal having closed itself with the token stored.
        [[ "$text" == *"Successfully Imported"* ]] && return 0
        if [[ -z "$text" ]]; then
            stored_has "$mint" && return 0
            echo "import of $mint closed the modal without storing the token" >&2
            return 1
        fi
        [[ "$text" == *"Failed to fetch"* ]] || {
            echo "import of $mint failed: $text" >&2
            return 1
        }
        sleep $((attempt * 5))
    done
    echo "import of $mint kept failing: $text" >&2
    return 1
}

# The dashboard's stored tokens as JSON (the zustand-persisted store).
stored_tokens() { ls_get mosaic_tokens | jq -c '.state.tokens // []'; }
stored_has() { [[ "$(stored_tokens | jq --arg m "$1" 'any(.[]; .address == $m)')" == true ]]; }

# ---------------------------------------------------------------------------
# Token creation wizard
# ---------------------------------------------------------------------------

# Opens Create Token and picks a template by its heading
# ("Custom Token", "Stablecoin", "Tokenized Security", "Arcade Token").
open_wizard() {
    if ! dom_click "Create Token"; then
        ab find role button click --name "Create" --exact >/dev/null
    fi
    ab wait --text "Create New Token" >/dev/null
    ab find role heading click --name "$1" >/dev/null
    ab wait --text "Token Identity" >/dev/null
}

# Fills the identity step (name, symbol) and continues.
wizard_identity() {
    ab find label "Token Name" fill "$1" >/dev/null
    ab find label "Symbol" fill "$2" >/dev/null
    dialog_click "Continue"
}

# Sets the Custom Token extension selection to exactly the given labels
# ("Metadata" included only if listed; it starts selected).
set_extensions() {
    local wanted
    wanted="$(printf '%s\n' "$@" | jq -R . | jq -sc .)"
    # Open the popover through its trigger, whose text is "N extensions selected".
    js '(() => { const b = [...document.querySelectorAll("[role=dialog] button")].find(b => /extensions? selected|Select extensions/.test(b.innerText)); b?.click(); return !!b; })()' >/dev/null
    sleep 0.3
    js "(() => {
        const wanted = new Set($wanted);
        const pop = document.querySelector('[data-radix-popper-content-wrapper]');
        if (!pop) return 'no popover';
        for (const row of pop.querySelectorAll('div.cursor-pointer')) {
            const label = row.querySelector(':scope > span')?.innerText.trim();
            const checked = row.querySelector('[role=checkbox]')?.getAttribute('data-state') === 'checked';
            if (wanted.has(label) !== checked) row.click();
        }
        return 'ok';
    })()" >/dev/null
    sleep 0.3
    # Close the popover again (Escape would only close the popover, but be explicit).
    ab press Escape >/dev/null
    sleep 0.2
}

# The labels of the selected-extension badges under the selector.
selected_extensions() {
    js '[...document.querySelectorAll("[role=dialog] [data-slot=badge]")].map(b => b.innerText.trim()).filter(Boolean).join(",")'
}

# Whether the wizard has a third (Configuration) step from where it stands on
# the Extensions step: the primary button reads Continue instead of the submit label.
has_config_step() { btn_present "Continue"; }

# ---------------------------------------------------------------------------
# Manage page
# ---------------------------------------------------------------------------

# Opens /manage/<mint>, importing the mint first if this browser does not have it.
open_manage() {
    local mint="$1"
    if ! stored_has "$mint"; then
        goto "/"
        import_token "$mint"
        eventually 6 eval 'equals "$(dialog_text)" ""' || escape_all
    fi
    goto "/manage/$mint"
    wait_slow "Token Overview"
}

# The value printed under a label in the Token Overview card, e.g. `overview_value Supply`.
overview_value() {
    main_text | awk -v want="$1" 'found && NF { print; exit } $0 == want { found = 1 }'
}

# Each card in the active tab panel as "Heading<TAB>card text" lines (one line
# per card, newlines in the card flattened to " | ").
tab_cards() {
    js "(() => {
        const panel = document.querySelector('[role=tabpanel][data-state=active]');
        if (!panel) return '';
        return [...panel.querySelectorAll('${1:-h3, h4}')].map(h => {
            let el = h;
            while (el.parentElement && el.parentElement !== panel && el.parentElement.querySelectorAll('h3, h4').length === 1) el = el.parentElement;
            return h.innerText.trim() + '\t' + el.innerText.replace(/\s*\n\s*/g, ' | ');
        }).join('\n');
    })()"
}
tab_headings() { tab_cards "$@" | cut -f1; }
# The card text for one heading in the active tab.
tab_card() { tab_cards | awk -F'\t' -v h="$1" '$1 == h { print $2 }'; }

open_tab() {
    QA_WANT_TAB="$1"
    ab find role tab click --name "$1" >/dev/null
    eventually 5 eval '[[ "$(active_tab)" == "$QA_WANT_TAB" ]]'
}
active_tab() { js 'document.querySelector("[role=tab][data-state=active]")?.innerText.trim() ?? ""'; }
tab_names() { js '[...document.querySelectorAll("[role=tab]")].map(t => t.innerText.trim()).join(",")'; }

# The items of the Admin Actions menu, comma-separated. Leaves the menu closed.
admin_menu_items() {
    menu_open || ab find role button click --name "Admin Actions" >/dev/null
    eventually 5 eval '[[ -n "$(js "document.querySelector(\"[role=menu]\")?.innerText ?? \"\"")" ]]'
    js '[...document.querySelectorAll("[role=menuitem]")].map(i => i.innerText.trim()).join(",")'
    ab press Escape >/dev/null
}

menu_open() { [[ "$(js '!!document.querySelector("[role=menu]")')" == true ]]; }

# Opens one Admin Actions item and leaves its modal open. The items keep the
# menu open behind their modal (onSelect preventDefault), so after the modal
# closes the menu is still up and its trigger is aria-hidden: reuse it.
admin_action() {
    # A relaunched browser has no test wallet; stop instead of failing every step after.
    [[ "$(js '!!window.__mosaicTestWallet')" == true ]] ||
        block_run "the browser lost the test wallet (agent-browser relaunched it without the init script); rerun"
    menu_open || ab find role button click --name "Admin Actions" >/dev/null
    ab find role menuitem click --name "$1" >/dev/null
    eventually 5 eval '[[ -n "$(dialog_text)" ]]'
}

# Truncated authority as the Permissions tab prints it: first 8 characters.
short8() { printf '%s' "${1:0:8}"; }

# ---------------------------------------------------------------------------
# Creating tokens (funded suites)
# ---------------------------------------------------------------------------

TOKEN_ACL_PROGRAM=TACLkU6CiCdkQN2MjoyDkVg2yAH9zkxiHDsiztQ52TP

# On-chain extension kinds a wizard extension label produces.
ext_kinds_for_label() {
    case "$1" in
        Metadata) echo "MetadataPointer TokenMetadata" ;;
        Pausable) echo PausableConfig ;;
        "Permanent Delegate") echo PermanentDelegate ;;
        "Default Account State") echo DefaultAccountState ;;
        "Confidential Balances") echo ConfidentialTransferMint ;;
        "Scaled UI Amount") echo ScaledUiAmountConfig ;;
        "Transfer Fee") echo TransferFeeConfig ;;
        "Interest Bearing") echo InterestBearingConfig ;;
        "Non-Transferable") echo NonTransferable ;;
        "Transfer Hook") echo TransferHook ;;
        # sRFC-37 adds no mint extension of its own; the template sets a default
        # account state and hands the freeze authority to a Token-ACL PDA.
        "SRFC-37 (Token ACL)") echo DefaultAccountState ;;
    esac
}

# The sorted, de-duplicated JSON array of kinds for a list of wizard labels.
expected_kinds() {
    local label
    for label in "$@"; do ext_kinds_for_label "$label"; done | tr ' ' '\n' | grep . | sort -u | jq -R . | jq -sc .
}
chain_kinds() { mint_json "$1" | jq -c '.extensions | sort'; }

# Submits the open wizard (submit label $1) and waits for its success screen.
# Prints the new mint address; the created mint is also appended to
# $OUT/created.txt so a run's spend can be traced.
submit_and_read_mint() {
    local submit="$1" text path mint
    dialog_click "$submit" || {
        echo "submit '$submit' is not enabled" >&2
        return 1
    }
    eventually 120 eval '[[ "$(dialog_text)" == *"Created Successfully"* || "$(dialog_text)" == *"Creation Failed"* ]]' || {
        echo "no result within 120s" >&2
        return 1
    }
    text="$(dialog_text)"
    if [[ "$text" != *"Created Successfully"* ]]; then
        grep -A1 'Error:' <<<"$text" | tr '\n' ' ' >"$OUT/last-create-error"
        echo "creation failed: $(cat "$OUT/last-create-error")" >&2
        return 1
    fi
    path="$(js '[...document.querySelectorAll("[role=dialog] a[href^=\"/manage/\"]")].map(a => a.getAttribute("href"))[0] ?? ""')"
    mint="${path#/manage/}"
    [[ "$mint" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || {
        echo "no mint address on the success screen ('$path')" >&2
        return 1
    }
    printf '%s\t%s\n' "${FLOW:-?}" "$mint" >>"$OUT/created.txt"
    printf '%s\n' "$mint"
}

# Runs a creation command (it prints the mint), and runs it again up to twice
# when it failed on a public-devnet rate limit (HTTP 429, "Solana error
# #8100002"). A 429 after a signature could mean the first try landed anyway;
# that costs a duplicate mint, never a wrong result.
retry_429() {
    local attempt out
    for attempt in 1 2 3; do
        rm -f "$OUT/last-create-error"
        if out="$("$@")"; then
            printf '%s\n' "$out"
            return 0
        fi
        is_rate_limited "$(cat "$OUT/last-create-error" 2>/dev/null)" || return 1
        echo "rate limited; retrying in $((attempt * 15))s" >&2
        sleep $((attempt * 15))
    done
    return 1
}

# Creates a Custom Token named "QA <slug>" with exactly the given wizard
# extensions; $CONFIGURE (a function name, may be empty) fills the
# Configuration step. Prints the mint.
create_custom_token() {
    local slug="$1"
    shift
    escape_all
    open_wizard "Custom Token"
    wizard_identity "QA $slug" "Q$(tr '[:lower:]' '[:upper:]' <<<"$slug" | tr -dc 'A-Z0-9' | head -c 6)"
    ab wait --text "Authority Parameters" >/dev/null
    set_extensions "$@"
    if has_config_step; then
        dialog_click "Continue"
        ab wait --text "Configuration" >/dev/null
        [[ -z "${CONFIGURE:-}" ]] || "$CONFIGURE"
    fi
    submit_and_read_mint "Create Custom Token"
}

# Closes a success screen through its Done button.
close_result() {
    dialog_click "Done" || escape_all
    eventually 5 eval 'equals "$(dialog_text)" ""' || escape_all
}

# ---------------------------------------------------------------------------
# Admin Actions on a token the wallet controls (funded suites)
# ---------------------------------------------------------------------------

# The last action_once's dialog text and how many transactions it signed.
LAST_ACTION_TEXT=""
LAST_ACTION_SIGNED=0

# Opens an Admin Actions item, runs a fill function, clicks the modal's submit
# button and waits for the success copy. Leaves the modal closed. A public
# devnet rate limit (HTTP 429) before anything was signed is retried; one
# after a signature is not, since that transaction may have landed.
action() {
    local attempt
    for attempt in 1 2 3; do
        action_once "$@" && return 0
        is_rate_limited "$LAST_ACTION_TEXT" && ((LAST_ACTION_SIGNED == 0)) || return 1
        echo "rate limited before signing; retrying in $((attempt * 10))s" >&2
        sleep $((attempt * 10))
    done
    return 1
}

# Runs an action whose effect the next check reads from chain. The UI's own
# verdict is recorded but not asserted: under public-devnet 429s the app can
# report a failure for a transaction that landed (seen in HOO-1429), so the
# chain is the source of truth here.
ui_action() {
    local what="$1"
    shift
    if action "$@"; then
        printf 'pass\t%s\t%s (UI reported success)\n' "$FLOW" "$what" >>"$RESULTS"
        printf '  \033[32m✓\033[0m %s (UI reported success)\n' "$what"
    else
        note "$what: the UI did not report success ($(tr '\n' ' ' <<<"$LAST_ACTION_TEXT" | grep -oE '(Solana error #[-0-9]+|[A-Z][^.]*(failed|Failed|error|Error)[^.]*)' | head -1)); judging by chain state"
    fi
}

action_once() {
    local item="$1" fill_fn="$2" submit="$3" success="$4" text before
    admin_action "$item"
    "$fill_fn"
    sleep 0.3
    before="$(sign_count signTransaction)"
    dialog_click "$submit" || {
        # Record this attempt's result too, so action and ui_action never read the previous one.
        LAST_ACTION_TEXT="'$submit' $(button_state "$submit"): $(dialog_text)"
        LAST_ACTION_SIGNED=0
        echo "$item: '$submit' not enabled ($(button_state "$submit"))" >&2
        escape_all
        eventually 5 eval 'equals "$(dialog_text)" ""' || escape_all
        return 1
    }
    # Wait for the success copy, or for the modal's error block.
    eventually 90 eval '[[ "$(dialog_text)" == *"$success"* || "$(js "!!document.querySelector(\"[role=alertdialog] [role=alert], [role=alertdialog] .text-destructive\")")" == true ]]' || true
    text="$(dialog_text)"
    LAST_ACTION_TEXT="$text"
    LAST_ACTION_SIGNED=$(($(sign_count signTransaction) - before))
    escape_all
    eventually 5 eval 'equals "$(dialog_text)" ""' || escape_all
    [[ "$text" == *"$success"* ]] || {
        echo "$item did not show '$success'; the dialog said: $(tr '\n' ' ' <<<"$text" | cut -c1-400)" >&2
        return 1
    }
}
