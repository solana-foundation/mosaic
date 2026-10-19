# agent-browser UI testing

Browser-driven checks of the dashboard using [agent-browser](https://agent-browser.dev), a Rust CLI that drives Chrome over CDP and is built for AI agents. The checks run on devnet with a **test wallet** injected into the page, so the flows that need a signer (creating tokens, management actions) work without a browser extension or a human approving transactions.

There are two ways in:

- **Agent-driven verification:** the [`ui-verify`](../../../../skills/ui-verify/SKILL.md) skill. Claude (or any coding agent) drives the running app to check a change end to end, reproduce a bug, or walk a PR's affected flow.
- **Scripted smoke flows:** `pnpm e2e:agent`, a short regression pass over the core flows.

## Why agent-browser

- **Snapshots:** `snapshot -i` returns the page's accessibility tree, cut down to interactive elements with refs (`@e1`), in a few hundred tokens. An agent can look at the real app cheaply after every action, so agent-driven verification is practical rather than a novelty.
- **Init scripts** (`--init-script`) run before the page's JavaScript. That is the hook this directory uses to inject the test wallet.
- **Semantic locators** (`find role|label|placeholder|text … click|fill`) and `wait --text` make repeatable scripts possible without the app carrying test ids.
- **Exit codes:** commands exit non-zero when they fail, so a `set -e` shell script is a working test.
- **Debugging:**
    - `errors` and `console` for page errors and logs
    - `network requests` for RPC traffic
    - `diff snapshot` and `diff screenshot --baseline` for structural and visual diffs
    - `react tree|renders` (with `--enable react-devtools`) and `vitals`

**Where it stops:** it has no test runner, fixtures, retries, parallel sharding or reports. It suits agent verification and a thin smoke layer. A deterministic CI regression suite would be better built on Playwright Test (already a devDependency, used by `scripts/smoke-test.mjs`). That suite can reuse the test wallet as-is with `page.addInitScript({ path: '.agent-browser/test-wallet.js' })`.

## How the test wallet works

`test-wallet.ts` is a minimal [Wallet Standard](https://github.com/wallet-standard/wallet-standard) wallet named **Mosaic Test Wallet**:

- **Features:** `standard:connect`, `standard:disconnect`, `standard:events`, `solana:signTransaction` and `solana:signMessage`.
- **Signing:** done with `@solana/kit` through WebCrypto Ed25519.
- **Registration:** through the standard app-ready handshake.

`@solana/connector` lists any registered wallet that advertises a `solana:*` chain. Its authenticity checks apply only to wallets found on `window` (`window.phantom`-style), so the test wallet appears in the connect modal like an installed extension.

`build-test-wallet.mjs` bundles it with esbuild into an IIFE and embeds the keypair:

- The keypair comes from `MOSAIC_TEST_KEYPAIR`, defaulting to `~/.config/solana/devnet-test.json`.
- The bundle is written to `apps/app/.agent-browser/test-wallet.js`, which is gitignored because it contains the secret key.

**Guardrail:** the wallet signs without prompting, so it advertises only `solana:devnet` and throws for any other chain. Point it only at a devnet keypair.

## Running the smoke flows

```bash
npm i -g agent-browser && agent-browser install    # once
cd apps/app
pnpm exec next dev --webpack -H 0.0.0.0 -p 3000    # in another terminal
pnpm e2e:agent                                     # connect → create-stablecoin → manage
pnpm e2e:agent connect                             # a single flow
```

`run.sh` does the following:

1. Pre-flight: checks the app is up and the wallet holds devnet SOL (top up at https://faucet.solana.com).
2. Builds the wallet.
3. Launches a fresh session with the init script.
4. Runs the flows in order. They share one browser, and `create-stablecoin` passes its mint to `manage` through `mint.txt`.
5. Fails if a flow fails or the page logged errors.

Each run's artifacts land in `.agent-browser/runs/<run id>/`: the final screenshot, and on failure a screenshot plus the console log. `HEADED=1` shows the browser, and `KEEP_OPEN=1` leaves the session open afterwards for inspection.

| flow                   | covers                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `connect.sh`           | disconnected dashboard → connect modal → Mosaic Test Wallet → connected header → auto-connect on reload |
| `create-stablecoin.sh` | create-token modal → Stablecoin → name/symbol → defaults → devnet create → token on dashboard           |
| `manage.sh`            | `/manage/<mint>` loads from chain → tabs → Admin Actions → Mint Tokens to own wallet → success view     |

Every app string these flows match is quoted in the flow scripts, so a copy change that breaks a flow points straight at the line to update.

## Gotchas found while building this

- **Launch options are per session.** Changing an `AGENT_BROWSER_*` environment variable between commands (for example `AGENT_BROWSER_DEFAULT_TIMEOUT`) makes the daemon relaunch the browser blank and without the init script. Use per-call flags instead (`wait --text … --timeout 90000`, wrapped as `wait_slow` in `lib.sh`).
- **Closing and immediately reopening a session name** can race the daemon's shutdown (`EOF while parsing`), so `run.sh` uses a new session name per run.
- **The wallet list trails the init script** by a few seconds. Until it catches up, the modal shows the "Get Phantom" install links, so `connect.sh` waits for the wallet's name before clicking.
- **The connector signs in two steps.** `@solana/connector` 0.1.4 first calls `solana:signTransaction` with a non-standard `{ transactions: [...] }` input and only falls back to the standard `{ transaction }` if that throws. The wallet accepts both.
- **The Next dev server occasionally answers a request with a 500** (`SyntaxError: Unexpected end of JSON input` in its own manifest read), which shows up as a timed-out wait over the Next error overlay. `run.sh` prints `errors` on failure so this is recognisable. Rerunning passes. A production build (`pnpm build && pnpm start`) avoids it.
- **Selector hygiene:**
    - The app has no `data-testid`s. Radix gives most controls usable roles, and form fields have labels or placeholders.
    - Weak spots that are worth labelling if a flow ever needs them: the icon-only token-card menu button and the wallet modal's help/close buttons, which have no accessible name, and the management modals' address and amount inputs, which have a `<label>` without `htmlFor`, so they are reached by placeholder.

## Not done yet

- CI. The flows need a funded devnet key as a secret, and devnet and the faucet are rate-limited, so this needs its own decision about where and how often to run.
- The arcade, tokenized-security and custom templates, and the rest of the management actions (freeze/thaw, pause, force transfer/burn, access lists, transfer hook, scaled UI amount). Each is one more flow file in the same shape.
