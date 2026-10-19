---
name: ui-verify
description: Drive the Mosaic dashboard (apps/app) in a real headless browser with agent-browser and an injected devnet test wallet, to see a UI change working end to end. Use when verifying a dashboard change in the running app, reproducing a UI bug, walking a PR's affected flow, or running the agent-browser smoke flows.
argument-hint: '[what to verify, e.g. "the mint modal shows the new decimals hint"]'
---

# ui-verify

Verify in the running dashboard: `$ARGUMENTS` (if that placeholder arrives unsubstituted or empty, verify whatever UI change is in the working tree).

The app is driven by [agent-browser](https://agent-browser.dev), and it connects a **test wallet**: a Wallet Standard wallet loaded as an init script that signs with the shared devnet keypair without prompting. Background and design are in `apps/app/e2e/agent-browser/README.md`.

## Steps

### 1. Tooling is ready

`agent-browser doctor` reports `Launch test: pass`. If `agent-browser` is missing: `npm i -g agent-browser && agent-browser install`. On Linux a failed launch citing a missing `lib*.so` needs the Chrome runtime libraries (`agent-browser install --with-deps`, or `apt-get install` the libraries `ldd` reports as not found).

### 2. A dev server is answering

`curl -sf http://localhost:3000/` succeeds. If not, start one in the background from `apps/app` with `pnpm exec next dev --webpack -H 0.0.0.0 -p 3000` (`-H 0.0.0.0` so a human can watch the same app over the network), and wait for a 200: the first request compiles for up to a minute. When telling the human where to look, give the machine's network host name rather than `localhost`, since the human is usually not on this machine.

### 3. The test wallet is built

From `apps/app`: `node e2e/agent-browser/build-test-wallet.mjs`, which writes `.agent-browser/test-wallet.js` (gitignored: it embeds the secret key). It reads `MOSAIC_TEST_KEYPAIR`, defaulting to `~/.config/solana/devnet-test.json`. Anything that sends a transaction needs devnet SOL on that key; check with `solana balance` and top it up at https://faucet.solana.com.

### 4. A session is launched with the wallet

Pick a fresh session name, then launch it with the init script and the page in one command:

```bash
S="ui-verify-$(date +%s)"
agent-browser --session "$S" --init-script "$PWD/.agent-browser/test-wallet.js" open http://localhost:3000/
```

Every later command passes the same `--session "$S"`. To connect: click "Connect Wallet", `wait --text "Mosaic Test Wallet"`, then click it. The header then shows `E3XF...29S5` and reloads auto-connect.

### 5. The change is exercised

Work the **observe → act → re-observe** loop until the thing under test has been seen working, or seen failing with a cause:

- `snapshot -i` to see interactive elements and their refs, then act by ref (`click @e12`, `fill @e7 "100"`).
- Re-snapshot after every action that changes the DOM, because refs are reassigned on each snapshot.
- `errors` and `console` after each significant step. A Next.js error overlay or uncaught exception is a finding in its own right.
- `screenshot <scratchpad>/<name>.png` when the visual result matters, and read the image back to check it.
- For a regression check across the core flows, run `pnpm e2e:agent` from `apps/app` (connect → create stablecoin → manage/mint). `pnpm e2e:agent connect` runs a single flow.

Done means: every claim in your report is backed by a snapshot line, a `get text` result, a screenshot you looked at, or command output.

### 6. Clean up and report

`agent-browser --session "$S" close`. Report what you verified, the evidence, and any page errors. Stop the dev server only if you started it.

## Reference

**Devnet only.** The test wallet advertises only `solana:devnet` and throws on any other chain. If signing fails with "only signs for solana:devnet", the app's network picker is on another cluster, or on a custom RPC whose chain id is not `solana:devnet`. Keep the app on Devnet and keep the keypair out of output, notes, and commits.

**Launch options are fixed for a session's lifetime.** Pass `--init-script` when the session's browser first starts. Changing `AGENT_BROWSER_*` environment variables between commands of the same session makes the daemon relaunch the browser blank and without the init script, so set them once or not at all. For a longer wait, use the per-call flag: `wait --text "..." --timeout 90000`.

**Scripts use semantic locators.** Refs suit interactive exploration. For anything repeatable (the files under `e2e/agent-browser/flows/`), target by `find role|label|placeholder|text ...` and `wait --text`.

**Timing in this app:**

- The wallet list in the connect modal can trail the init script by a few seconds; wait for the "Mosaic Test Wallet" text before clicking.
- Devnet transactions and cold routes regularly exceed the 25s default timeout.
- The manage page loads authorities and extensions live from chain.

**State lives in localStorage** (`mosaic_tokens`, `mosaic_rpc_settings`, `recentlyConnectedWallet`). A fresh session starts empty. `storage local` reads and seeds it, and `storage local clear` resets it.

**React internals:** launching with `--enable react-devtools` adds `react tree`, `react inspect <fiberId>`, and `react renders start|stop` for render and state questions.
