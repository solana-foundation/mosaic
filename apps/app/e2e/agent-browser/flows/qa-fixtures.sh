#!/usr/bin/env bash
# e2e:
# QA matrix pre-flight: every devnet fixture in fixtures/qa-devnet.json still
# exists with the extensions the read-only flows expect, and no test wallet
# holds its authorities. Blocks the run otherwise. Spends nothing.
FLOW=qa-fixtures
source "$(dirname "$0")/../lib.sh"
source "$E2E_DIR/lib-qa.sh"

A="$(CHAIN address --role a)"
B="$(CHAIN address --role b)"

for key in $(fixture_keys); do
    mint="$(fixture "$key")"
    state="$(mint_json "$mint")"
    [[ "$(jq -r .exists <<<"$state")" == true ]] || block_run "fixture $key ($mint) no longer exists on devnet; replace it in fixtures/qa-devnet.json"
    want="$(jq -c "[.mints[\"$key\"].extensions[]] | sort" "$FIXTURES")"
    got="$(jq -c '.extensions | sort' <<<"$state")"
    [[ "$want" == "$got" ]] || block_run "fixture $key ($mint) extensions changed: expected $want, got $got"
    mint_auth="$(jq -r '.mintAuthority // ""' <<<"$state")"
    [[ "$mint_auth" != "$A" && "$mint_auth" != "$B" ]] || block_run "fixture $key: a test wallet now holds its mint authority"
    printf '%s\n' "$state" >"$OUT/fixture-$key.json"
    check "fixture $key ${mint:0:4}… exists with $(jq length <<<"$got") extensions" true
    sleep 0.5 # public devnet rate limit
done
