// Post-deploy browser smoke test.
//
// A green `next build` does NOT prove the app runs — it only proves it
// compiles. Real crashes surface in the browser: a bad chunk, a missing or
// mis-served asset (e.g. the confidential-transfer `.wasm` served as
// `text/plain`, which threw `WebAssembly.instantiateStreaming` on Vercel — see
// HOO-628 / PR #84), a hydration error, or an unhandled client exception.
//
// This drives the *deployed* URL in a headless browser and fails on any of:
//   - an uncaught page exception (`pageerror`)
//   - Next.js's client-crash boundary ("Application error: a client-side
//     exception has happened")
//   - a failed same-origin document/script/wasm response (HTTP >= 400)
//   - a `.wasm` asset served with the wrong `Content-Type`
//
// Usage: SMOKE_URL=https://<deployment> node scripts/smoke-test.mjs
//
// Org-owned Vercel projects gate preview deployments behind an SSO login page.
// To reach the real app, set VERCEL_AUTOMATION_BYPASS_SECRET (Vercel dashboard →
// Project → Settings → Deployment Protection → "Protection Bypass for
// Automation"); it is sent as the `x-vercel-protection-bypass` header. Without
// it, a protected deployment can't be reached and the test skips (exit 0)
// rather than failing every fork PR.
import { chromium } from 'playwright';

const BASE_URL = process.env.SMOKE_URL?.replace(/\/$/, '');
if (!BASE_URL) {
    console.error('smoke-test: SMOKE_URL is required');
    process.exit(2);
}

const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

// Routes reachable without a connected wallet. `/manage/[address]` needs a real
// token address, so it is intentionally omitted here.
const ROUTES = [{ path: '/', expect: 'Welcome to Mosaic' }];

const failures = [];

const browser = await chromium.launch();
const context = await browser.newContext(
    BYPASS_SECRET
        ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }
        : undefined,
);
const page = await context.newPage();

// Uncaught client exceptions — the clearest "it crashed in the browser" signal.
page.on('pageerror', err => {
    failures.push(`pageerror on ${page.url()}: ${err.message}`);
});

// Failed / mis-served network responses for assets we actually depend on.
page.on('response', response => {
    const url = response.url();
    if (!url.startsWith(BASE_URL)) return; // ignore third-party (RPC, wallets, analytics)
    const type = response.request().resourceType();
    const status = response.status();

    if ((type === 'document' || type === 'script' || url.endsWith('.wasm')) && status >= 400) {
        failures.push(`${status} on ${type} ${url}`);
    }

    // The exact failure mode PR #84 fixed: wasm must be served as application/wasm
    // or WebAssembly.instantiateStreaming rejects it.
    if (url.endsWith('.wasm')) {
        const ct = response.headers()['content-type'] ?? '';
        if (!ct.includes('application/wasm')) {
            failures.push(`wasm served with wrong Content-Type "${ct}" (expected application/wasm): ${url}`);
        }
    }
});

// Probe the root once to detect Vercel's deployment-protection gate. If we're
// blocked and have no bypass secret, skip rather than report a false crash.
const probe = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
const probeTitle = await page.title();
const isProtectionGate = probe?.status() === 401 || /Login\s*–\s*Vercel|Authentication Required/i.test(probeTitle);
if (isProtectionGate && !BYPASS_SECRET) {
    console.log(
        'smoke-test: SKIPPED — deployment is behind Vercel protection and no ' +
            'VERCEL_AUTOMATION_BYPASS_SECRET is set. Add the repo secret to enable this check.',
    );
    await browser.close();
    process.exit(0);
}
if (isProtectionGate) {
    failures.push(`still blocked by Vercel protection gate despite bypass secret (title "${probeTitle}")`);
}

for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`;
    console.log(`smoke-test: visiting ${url}`);
    try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        if (!resp || resp.status() >= 400) {
            failures.push(`${resp?.status() ?? 'no response'} on ${url}`);
            continue;
        }

        // Wait for the app to actually render its expected content (past any
        // initial spinner), or fail if the crash boundary shows up first.
        try {
            await page.waitForFunction(
                expected => {
                    const text = document.body?.innerText ?? '';
                    if (text.includes('Application error: a client-side exception has happened')) return true;
                    return expected ? text.includes(expected) : text.length > 0;
                },
                route.expect,
                { timeout: 20_000 },
            );
        } catch {
            failures.push(`expected text "${route.expect}" not found on ${url} (timed out)`);
            continue;
        }

        const body = await page.textContent('body');
        if (body?.includes('Application error: a client-side exception has happened')) {
            failures.push(`client-side crash boundary rendered on ${url}`);
        }
    } catch (err) {
        failures.push(`navigation failed for ${url}: ${err.message}`);
    }
}

await browser.close();

if (failures.length > 0) {
    console.error(`\nsmoke-test: FAILED with ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}

console.log('\nsmoke-test: PASSED');
