import setupTestSuite from './setup';
import type { Client } from './setup';
import type { Address, KeyPairSigner, TransactionSigner } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
import { sendAndConfirmTransaction, DEFAULT_TIMEOUT, DEFAULT_COMMITMENT } from './helpers';
import { createCustomTokenInitTransaction, createStablecoinInitTransaction } from '../../templates';
import { inspectToken } from '../../inspection';

/**
 * On-chain coverage for the template options exposed in HOO-904.
 *
 * The unit tests in `src/templates/__tests__` compare instruction bytes, which proves the
 * right instruction is built but not that the resulting mint decodes the way we expect.
 * These create real mints on a local validator and read them back through `inspectToken`.
 *
 * Everything here runs with `enableSrfc37: false` on purpose — the sRFC-37 path needs the
 * Token-ACL and ABL programs deployed, which is why `templates.test.ts` is still skipped
 * (#43). The options under test are all reachable without it.
 */
describe('Template options integration tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;

    beforeAll(async () => {
        const testSuite = await setupTestSuite();
        client = testSuite.client;
        mintAuthority = testSuite.mintAuthority;
        payer = testSuite.payer;
    });

    beforeEach(async () => {
        mint = await generateKeyPairSigner();
    });

    /** Reads back the ConfidentialTransferMint extension, or undefined if absent. */
    const confidentialDetails = async (): Promise<Record<string, unknown> | undefined> => {
        const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
        return inspection.extensions.find(ext => ext.name === 'ConfidentialTransferMint')?.details;
    };

    describe('confidential balances policy', () => {
        it(
            'defaults to approval-required with no auditor',
            async () => {
                const tx = await createStablecoinInitTransaction(
                    client.rpc,
                    'Default Policy',
                    'DEFP',
                    6,
                    'https://example.com/defp.json',
                    mintAuthority,
                    mint,
                    payer,
                    'blocklist',
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    false,
                );
                await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

                const details = await confidentialDetails();
                expect(details).toBeDefined();
                expect(details?.autoApproveNewAccounts).toBe(false);
                expect(details?.auditorElgamalPubkey).toBeNull();
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'opt-in policy auto-approves new accounts on-chain',
            async () => {
                const tx = await createStablecoinInitTransaction(
                    client.rpc,
                    'Opt In',
                    'OPTIN',
                    6,
                    'https://example.com/optin.json',
                    mintAuthority,
                    mint,
                    payer,
                    'blocklist',
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    false,
                    undefined,
                    { policy: 'opt-in' },
                );
                await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

                const details = await confidentialDetails();
                expect(details?.autoApproveNewAccounts).toBe(true);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'records the auditor ElGamal pubkey on the mint',
            async () => {
                const auditor = (await generateKeyPairSigner()).address as Address;
                const tx = await createStablecoinInitTransaction(
                    client.rpc,
                    'Audited',
                    'AUDIT',
                    6,
                    'https://example.com/audit.json',
                    mintAuthority,
                    mint,
                    payer,
                    'blocklist',
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    false,
                    undefined,
                    { policy: 'opt-in', auditorElgamalPubkey: auditor },
                );
                await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

                const details = await confidentialDetails();
                expect(details?.autoApproveNewAccounts).toBe(true);
                expect(details?.auditorElgamalPubkey).toBe(auditor);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'threads the policy through the custom-token template too',
            async () => {
                const tx = await createCustomTokenInitTransaction(
                    client.rpc,
                    'Custom Opt In',
                    'COPT',
                    6,
                    'https://example.com/copt.json',
                    mintAuthority,
                    mint,
                    payer,
                    { enableConfidentialBalances: true, confidentialBalances: { policy: 'opt-in' } },
                );
                await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

                const details = await confidentialDetails();
                expect(details?.autoApproveNewAccounts).toBe(true);
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('custom token default account state', () => {
        const defaultAccountState = async (): Promise<Record<string, unknown> | undefined> => {
            const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
            return inspection.extensions.find(ext => ext.name === 'DefaultAccountState')?.details;
        };

        it(
            'omits the extension entirely when the toggle is off',
            async () => {
                // The regression this exists for: the gate used to test `!== undefined`, so an
                // explicit `false` still put DefaultAccountState on every mint.
                const tx = await createCustomTokenInitTransaction(
                    client.rpc,
                    'No DAS',
                    'NODAS',
                    6,
                    'https://example.com/nodas.json',
                    mintAuthority,
                    mint,
                    payer,
                    { enablePausable: true, enableDefaultAccountState: false },
                );
                await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
                expect(inspection.extensions.map(ext => ext.name)).not.toContain('DefaultAccountState');
                // The extension the caller *did* ask for is still there.
                expect(inspection.extensions.map(ext => ext.name)).toContain('PausableConfig');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'lands Initialized when asked for without an explicit state',
            async () => {
                const tx = await createCustomTokenInitTransaction(
                    client.rpc,
                    'DAS Init',
                    'DASI',
                    6,
                    'https://example.com/dasi.json',
                    mintAuthority,
                    mint,
                    payer,
                    { enableDefaultAccountState: true },
                );
                await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

                expect(await defaultAccountState()).toBeDefined();
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
                // `blocklist` is how inspection reports an Initialized default state.
                expect(inspection.aclMode).toBe('blocklist');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'makes Frozen reachable via defaultAccountStateInitialized: false',
            async () => {
                const tx = await createCustomTokenInitTransaction(
                    client.rpc,
                    'DAS Frozen',
                    'DASF',
                    6,
                    'https://example.com/dasf.json',
                    mintAuthority,
                    mint,
                    payer,
                    { enableDefaultAccountState: true, defaultAccountStateInitialized: false },
                );
                await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

                expect(await defaultAccountState()).toBeDefined();
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
                // `allowlist` is how inspection reports a Frozen default state — the state that
                // was unreachable from the app before this change.
                expect(inspection.aclMode).toBe('allowlist');
            },
            DEFAULT_TIMEOUT,
        );
    });
});
