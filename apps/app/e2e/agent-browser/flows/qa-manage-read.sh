#!/usr/bin/env bash
# e2e:
# QA matrix §5 (read-only half), §8.8 and §8.9 on the devnet fixtures: the
# overview card, the tabs, and every Extensions and Permissions row checked
# against what chain.mjs reads from the mint. Spends nothing.
FLOW=qa-manage-read
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

TODAY="$(LC_ALL=C date '+%b %-d, %Y')"

# Permissions-tab row → the chain field holding that authority ("" = none).
authority_of() {
    local state="$1" row="$2"
    case "$row" in
        "Mint Authority") jq -r '.mintAuthority // ""' <<<"$state" ;;
        "Freeze Authority") jq -r '.freezeAuthority // ""' <<<"$state" ;;
        "Metadata Authority") jq -r '.extension.TokenMetadata.updateAuthority // ""' <<<"$state" ;;
        "Pausable Authority") jq -r '.extension.PausableConfig.authority // ""' <<<"$state" ;;
        "Confidential Balances Authority") jq -r '.extension.ConfidentialTransferMint.authority // ""' <<<"$state" ;;
        "Permanent Delegate Authority") jq -r '.extension.PermanentDelegate.delegate // ""' <<<"$state" ;;
        "Scaled UI Amount Authority") jq -r '.extension.ScaledUiAmountConfig.authority // ""' <<<"$state" ;;
        "Transfer Hook Authority") jq -r '.extension.TransferHook.authority // ""' <<<"$state" ;;
    esac
}

goto "/"
for key in stablecoin security arcade confidential paused scaled blocklist allowlist; do
    mint="$(fixture "$key")"
    state="$(cat "$OUT/fixture-$key.json" 2>/dev/null || mint_json "$mint")"
    step "$key: $mint"
    open_manage "$mint"

    # Overview
    check "$key: Token Address is the mint" equals "$(overview_value "Token Address")" "${mint:0:6}...${mint: -4}"
    check "$key: Decimals match the chain" equals "$(overview_value Decimals)" "$(jq -r .decimals <<<"$state")"
    supply="$(jq -r .supply <<<"$state")"
    if [[ "$supply" == 0 ]]; then
        check "$key: supply 0 offers 'Mint tokens to get started'" equals "$(overview_value Supply)" "Mint tokens to get started"
    else
        ui_supply="$(overview_value Supply | tr -d ',')"
        check "$key: Supply matches the chain ($supply raw)" equals "$(raw "$ui_supply" "$(jq -r .decimals <<<"$state")")" "$supply"
    fi
    template="$(fixture "$key" template)"
    if [[ "$template" != Custom ]]; then
        check "$key: Template reads $template" equals "$(overview_value Template)" "$template"
    fi
    known_defect unfiled:row23-created-date "$key: Created is the mint's creation date, not the import date" \
        not equals "$(overview_value Created)" "$TODAY"
    creator="$(jq -r .creator "$FIXTURES")"
    if [[ "$(jq -r .mintAuthority <<<"$state")" != "$creator" ]]; then
        known_defect unfiled:row24-creation-address "$key: Creation Address is the creator, not the current mint authority" \
            equals "$(overview_value "Creation Address")" "${creator:0:6}...${creator: -4}"
    fi

    # Explorer (§8.9): the button opens a window; capture the URL.
    js '(() => { window.__qaOpened = []; window.open = u => { window.__qaOpened.push(String(u)); return null; }; return 1; })()' >/dev/null
    dom_click "Explorer"
    url="$(js 'window.__qaOpened[0] ?? ""')"
    check "$key: Explorer opens this mint on devnet" equals "$url" "https://explorer.solana.com/address/$mint?cluster=devnet"

    # Tabs
    check "$key: the default tab is Extensions" equals "$(active_tab)" "Extensions"
    acl="$(fixture "$key" aclMode)"
    if [[ "$acl" == null ]]; then
        check "$key: two tabs" equals "$(tab_names)" "Permissions,Extensions"
    else
        label="$(tr '[:lower:]' '[:upper:]' <<<"${acl:0:1}")${acl:1}"
        check "$key: three tabs (sRFC-37)" equals "$(tab_names | tr ',' '\n' | grep -c .)" 3
        if [[ "$acl" == allowlist ]]; then
            # A non-creator cannot read the creator's list config, and the label falls back to Blocklist.
            known_defect HOO-953 "$key: the access-list tab is labelled $label for a non-creator" contains "$(tab_names)" "$label"
        else
            check "$key: the access-list tab is labelled $label" contains "$(tab_names)" "$label"
        fi
    fi

    # Extensions tab: one row per on-chain extension.
    rows="$(tab_headings h4)"
    for kind in $(jq -r '.extensions[]' <<<"$state"); do
        if [[ "$kind" == PermissionedBurn ]]; then
            known_defect unfiled:s8.8-permissioned-burn-row "$key: PermissionedBurn has an Extensions row" grep -qx "Permissioned Burn" <<<"$rows"
            continue
        fi
        name="$(ext_display_name "$kind")"
        check "$key: Extensions row for $kind ($name)" grep -qx "$name" <<<"$rows"
    done
    # PermissionedBurn is left out on both sides, so its row turning up is an XPASS above, not a miscount.
    check "$key: no Extensions row without an extension behind it" equals \
        "$(grep -vx "Permissioned Burn" <<<"$rows" | grep -c . || true)" "$(jq '[.extensions[] | select(. != "PermissionedBurn")] | length' <<<"$state")"
    if jq -e '.extension.ScaledUiAmountConfig' <<<"$state" >/dev/null; then
        multiplier="$(jq -r '.extension.ScaledUiAmountConfig.multiplier' <<<"$state")"
        known_defect HOO-955 "$key: Scaled UI Amount row shows the on-chain multiplier ($multiplier, row 26)" \
            contains "$(tab_card "Scaled UI Amount")" "| $multiplier |"
    fi

    # Permissions tab: eight rows, each matching the chain.
    open_tab Permissions
    # The rows render once the authorities are read from chain.
    check "$key: eight authority rows" eventually 20 eval '[[ "$(tab_cards h3 | grep -c .)" == 8 ]]'
    cards="$(tab_cards h3)"
    edits=0
    while IFS=$'\t' read -r row body; do
        want="$(authority_of "$state" "$row")"
        if [[ -z "$want" ]]; then
            check "$key: $row is None" contains "$body" "| None"
        else
            check "$key: $row is $(short8 "$want")…" contains "$body" "$(short8 "$want")"
            [[ "$body" != *"| Edit"* ]] || edits=$((edits + 1))
        fi
    done <<<"$cards"
    # None of these authorities is the connected wallet's, yet each row offers Edit.
    known_defect unfiled:edit-without-authority "$key: no Edit on authority rows the wallet does not hold ($edits offered)" equals "$edits" 0
    sleep 1 # public devnet rate limit
done

assert_no_page_errors
finish_flow
