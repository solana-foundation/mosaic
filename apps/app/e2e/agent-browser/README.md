# agent-browser UI testing

Browser-driven checks of the dashboard using [agent-browser](https://agent-browser.dev), a Rust CLI that drives Chrome over CDP and is built for AI agents. The checks run on devnet with a **test wallet** injected into the page, so the flows that need a signer (creating tokens, management actions) work without a browser extension or a human approving transactions.

There are two ways in:

- **Agent-driven verification:** the [`ui-verify`](../../../../skills/ui-verify/SKILL.md) skill. Claude (or any coding agent) drives the running app to check a change end to end, reproduce a bug, or walk a PR's affected flow.
- **Scripted flows:** `pnpm e2e:agent [flow|group ...]`, shell scripts under `flows/` grouped by `groups/*.group`. This directory is the harness; each suite adds flow files, a group, and if it needs them its own `lib-<suite>.sh` and `chain-<suite>.mjs`.

| suite   | run              | covers                                                  |
| ------- | ---------------- | ------------------------------------------------------- |
| `smoke` | `pnpm e2e:agent` | connect, create a stablecoin, mint to it from `/manage` |

## Why agent-browser

- **Snapshots:** `snapshot -i` returns the page's accessibility tree, cut down to interactive elements with refs (`@e1`), in a few hundred tokens. An agent can look at the real app cheaply after every action, so agent-driven verification is practical rather than a novelty.
- **Init scripts** (`--init-script`) run before the page's JavaScript. That is the hook this directory uses to inject the test wallet.
- **Semantic locators** (`find role|label|placeholder|text … click|fill`) and `wait --text` make repeatable scripts possible without the app carrying test ids.
- **Exit codes:** commands exit non-zero when they fail, so a `set -e` shell script is a working test.
- **Debugging:**
    - `errors` and `console` for page errors and logs
    - `network requests` for RPC traffic, `network route` to stub it
    - `diff snapshot` and `diff screenshot --baseline` for structural and visual diffs
    - `react tree|renders` (with `--enable react-devtools`) and `vitals`

**Where it stops:** it has no test runner, fixtures, retries, parallel sharding or reports. It suits agent verification and scripted end-to-end flows. A deterministic CI regression suite would be better built on Playwright Test (already a devDependency, used by `scripts/smoke-test.mjs`). That suite can reuse the test wallet as-is with `page.addInitScript({ path: '.agent-browser/test-wallet-a.js' })`.

## Running

```bash
npm i -g agent-browser && agent-browser install    # once
cd apps/app
pnpm build && pnpm start                           # in another terminal (or pnpm dev, see Gotchas)
pnpm e2e:agent                                     # the smoke group
pnpm e2e:agent connect                             # a single flow
HEADED=1 KEEP_OPEN=1 pnpm e2e:agent manage         # watch it, and poke around afterwards
```

`run.sh`:

1. **Expands** the arguments into flows. A group file lists flows or `@other-group`s; a group made only of `@group`s is a suite of runs, and each runs separately (e.g. one per transaction version).
2. **Reads each flow's `# e2e:` header** for the sessions it needs and whether it spends SOL.
3. **Pre-flight:** the app is up and wallet A's keypair is readable. Wallet B's keypair is required only when a flow opens its session (otherwise it is wallet A's alt account if present). Only a funded run reads balances: wallet A must hold at least 0.3 devnet SOL, refilled from the master wallet when there is one, and wallet B is topped up from A.
4. **Builds** the wallet bundles the flows need and **launches a fresh session** per wallet.
5. **Runs the flows in order.** Sessions persist across flows, and flows hand values to later ones through `$OUT` (`create-stablecoin` writes `mint.txt` for `manage`).
6. **Summarises** `results.tsv` and exits 0 (green, known defects allowed), 1 (a check failed) or 3 (blocked).

Each run's artifacts land in `.agent-browser/runs/<run id>-v<tx version>/`: `results.tsv`, the final screenshot, and on failure a screenshot and console log per session. `REUSE_OUT=<run id>` copies a run's handed-over files into a new one, to resume after a failure without recreating fixtures.

## Writing a flow

A flow is a bash script in `flows/`. Start from this:

```bash
#!/usr/bin/env bash
# e2e: funded
# What the flow covers, which ticket it belongs to, what it leaves behind for later flows.
FLOW=my-flow
source "$(dirname "$0")/../lib.sh"

step "open the dashboard"
goto "/"                                   # opens the page and connects the wallet
wait_slow "Create Token"

step "do the thing"
ab find role button click --name "Create Token" >/dev/null
ab find label "Token Name" fill "My Token" >/dev/null

check "the modal opened" contains "$(ab get text '[role=dialog]')" "Create New Token"
known_defect HOO-123 "the button says what it will do" contains "$(ab get text main)" "Create and sign"
note "anything worth quoting in the ticket"

assert_no_page_errors
finish_flow
```

- **The header line** (`# e2e:`) declares `funded` if the flow spends SOL, and `sessions=b,nosign` if it needs wallet B or the wallet without `signMessage` (drive them with `as_wallet b <command>`).
- **Checks** are `check` (stops the flow), `soft_check` (keeps going; `finish_flow` fails it), `known_defect TICKET` (expected to fail until the ticket is fixed: XFAIL keeps the run green, XPASS says it is time to make it a plain check), `note` (an observation for a write-up) and `block_run` (stop the whole run, exit 3).
- **Locators:** `find role|label|placeholder|text … click|fill` and `wait --text`; never snapshot refs. Where the app gives nothing to hold on to, tag elements from the page with `js` (an `eval` wrapper that prints JSON), as the confidential suite's `tag_cards` does.
- **The chain:** `chain.mjs` (`CHAIN token --role a --mint M`, `token_field`, `await_value`, `sol_of`, `raw`) reads what a step did on chain, and sets up what the UI cannot (`create-ata`, `fund`). Wallet-side failure modes are `wallet_ctl` and `sign_count`.
- **Add it to a group** in `groups/`, and a row to the suite table above.
- **Run it** on its own first, `HEADED=1 KEEP_OPEN=1`, then explore the leftover session with `agent-browser --session <name> snapshot -i`.

## How the test wallet works

`test-wallet.ts` is a minimal [Wallet Standard](https://github.com/wallet-standard/wallet-standard) wallet named **Mosaic Test Wallet**:

- **Features:** `standard:connect`, `standard:disconnect`, `standard:events`, `solana:signTransaction` and `solana:signMessage`.
- **Signing:** done with `@solana/kit` through WebCrypto Ed25519. Message signing signs the raw bytes, unprefixed and unhashed.
- **Registration:** through the standard app-ready handshake, **synchronously** when the init script runs. The address comes from the keypair file's public-key half and the WebCrypto key is imported on first use. Registering after an `await` lost the race against the connector's boot on some loads, and auto-connect then found no wallet.

`@solana/connector` lists any registered wallet that advertises a `solana:*` chain. Its authenticity checks apply only to wallets found on `window` (`window.phantom`-style), so the test wallet appears in the connect modal like an installed extension.

`build-test-wallet.mjs` bundles it with esbuild into an IIFE and embeds the keypair. `run.sh` builds the bundles the flows ask for into the gitignored `apps/app/.agent-browser/`:

| bundle                    | keypair                         | used as                                                                                      |
| ------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| `test-wallet-a.js`        | A, with B as the alt account    | wallet A, the default session; `switchAccount()` swaps to B as a user would in the extension |
| `test-wallet-b.js`        | B                               | wallet B, the `-b` session: a second user (recipient, non-creator, non-authority)            |
| `test-wallet-a-nosign.js` | A, without `solana:signMessage` | a wallet that cannot sign messages at all, the `-nosign` session                             |

Build options: `--keypair`, `--alt`, `--no-sign-message`, `--tx-v1` (advertise version-1 transactions; Kit 8 signs them on the same path), `--out`. Keypairs default to `~/.config/solana/mosaic-e2e-{a,b,master}.json` (`MOSAIC_TEST_KEYPAIR_A`/`_B`/`_MASTER` override them).

**Failure modes.** The page gets `window.__mosaicTestWallet` (`TestWalletControl` in `test-wallet.ts`), which flows drive through `agent-browser eval` (`wallet_ctl` in `lib.sh`):

- `refuseSignMessage(msg?)`: every `signMessage` throws, Phantom's refusal by default
- `rejectSignTransaction(n, msg?)`: the Nth transaction from now is rejected as a user rejection (code 4001)
- `delaySignMs(ms)`: every signature is held back, e.g. to interrupt a multi-transaction plan
- `disconnect()`, `switchAccount()`: wallet-side events, emitted through `standard:events`
- `counts`, `log`: every sign request the wallet received, including the ones it refused (another chain, an account that is not connected) or rejected, so a flow can assert that a bad input never reached the wallet. Each request's number and account are fixed when it arrives. The connector's non-standard first call (see Gotchas) is not a request.
- `lastError`: what the most recent sign request threw, `null` once one is signed
- `reset()`

The counters live in the page, so a full navigation resets them. `pnpm test` (`selftest.mjs`) checks this bookkeeping offline with throwaway keys, along with the keypair resolution and `run.sh` driven through a stub agent-browser.

**Guardrail:** the wallet signs without prompting, so it advertises only `solana:devnet` and throws for any other chain. Point it only at devnet keypairs.

## The smoke flows

| flow                   | covers                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `connect.sh`           | disconnected dashboard → connect modal → Mosaic Test Wallet → connected header → auto-connect on reload |
| `create-stablecoin.sh` | create-token modal → Stablecoin → name/symbol → defaults → devnet create → token on dashboard           |
| `manage.sh`            | `/manage/<mint>` loads from chain → tabs → Admin Actions → Mint Tokens to own wallet → success view     |

Every app string these flows match is quoted in the flow scripts, so a copy change that breaks a flow points straight at the line to update.

## Gotchas found while building this

- **Launch options are per session.** Changing an `AGENT_BROWSER_*` environment variable between commands (for example `AGENT_BROWSER_DEFAULT_TIMEOUT`) makes the daemon relaunch the browser blank and without the init script. Use per-call flags instead (`wait --text … --timeout 90000`, wrapped as `wait_slow` in `lib.sh`).
- **Closing and immediately reopening a session name** can race the daemon's shutdown (`EOF while parsing`), so `run.sh` uses a new session name per run.
- **The wallet list trails the init script** by a few seconds, more on a cold route compile. Until it catches up, the modal shows the "Get Phantom" install links, so `ensure_connected` waits for the wallet's name before clicking and reloads once if it never shows.
- **Auto-connect never fires under `next dev`.** React StrictMode mounts the connector's provider twice, and the first unmount calls `ConnectorClient.destroy()`, which disconnects and clears `connector-kit:v1:wallet`. A full page load therefore always lands disconnected, so `goto` in `lib.sh` reconnects after every navigation. Production builds auto-connect normally (verified with `pnpm build && pnpm start`), and `connect.sh`'s reload check only passes against one.
- **`@solana/connector` 0.1.4 drops wallet-side events.** A `change` event with no accounts (the user disconnecting in the extension) is ignored, and one with a new account updates `accounts` but never `selectedAccount`, so the app keeps acting as the old account.
- **The connector signs in two steps.** `@solana/connector` 0.1.4 first calls `solana:signTransaction` with a non-standard `{ transactions: [...] }` input and falls back to the standard `{ transaction }` on _any_ error, user rejections included. The wallet refuses the non-standard shape, as real wallets do; accepting it meant a simulated rejection was swallowed by the fallback and the transaction signed anyway. (A wallet that did accept that shape would prompt the user a second time after a rejection, worth raising with connectorkit.)
- **The connector cannot hand a version-1 transaction to a wallet.** Its kit adapter (`createKitTransactionSigner`) hand-builds the legacy/v0 wire layout `[numSigs][zeroed signatures][message]` rather than using kit's encoder; for v0 that is byte-identical, but a v1 transaction starts with its message, so the wallet receives bytes it cannot decode.
- **Public devnet rate-limits** a run hard after a few minutes (HTTP 429, "Solana error #8100002" in the app). Keep chain polling gentle (`await_value` polls every 5s) and expect the app to surface raw 429s. A provider RPC (`NEXT_PUBLIC_SOLANA_RPC_URL` for the app, `SOLANA_RPC_URL` for `chain.mjs`) avoids it.
- **`eval` prints JSON**, except for `undefined`, which `js` in `lib.sh` maps to an empty string.
- **The default viewport is short** (1280×577), so sticky elements overlap content; `run.sh` sets 1440×1600. Where a pointer click still lands on an overlay, `dom_click` clicks through the DOM.
- **The Next dev server occasionally answers a request with a 500** (`SyntaxError: Unexpected end of JSON input` in its own manifest read), which shows up as a timed-out wait over the Next error overlay. `run.sh` prints `errors` on failure so this is recognisable. Rerunning passes. A production build avoids it.
- **Running `next dev` rewrites `apps/app/next-env.d.ts` and generates `apps/app/AGENTS.md`.** Discard both before committing.
- **Selector hygiene:**
    - The app has no `data-testid`s. Radix gives most controls usable roles, and form fields have labels or placeholders.
    - Weak spots: the icon-only token-card menu button and the wallet modal's help/close buttons have no accessible name, and the management modals' address and amount inputs have a `<label>` without `htmlFor`, so they are reached by placeholder.

## Not done yet

- CI. The flows need a funded devnet key as a secret, and devnet and the faucet are rate-limited, so this needs its own decision about where and how often to run. A local `solana-test-validator` would remove the faucet dependency, but needs the wallet's chain guard and the connector cluster to accept localnet.
- The arcade, tokenized-security and custom templates, and the rest of the management actions (freeze/thaw, pause, force transfer/burn, access lists, transfer hook, scaled UI amount). Each is one more flow file in the same shape.
