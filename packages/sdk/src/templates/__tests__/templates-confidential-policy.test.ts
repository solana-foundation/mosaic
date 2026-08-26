import type { Address, Instruction, Rpc, SolanaRpcApi } from '@solana/kit';
import { some } from '@solana/kit';
import { extension, getPreInitializeInstructionsForMintExtensions } from '@solana-program/token-2022';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils.js';
import type { ConfidentialApprovePolicy } from '../../issuance/create-mint.js';

/**
 * Covers the confidential-balances `policy` / `auditorElgamalPubkey` passthrough on every
 * template that enables the extension. Before this passthrough existed each template called
 * the bare-`Address` overload of `Token.withConfidentialBalances`, so every mint was created
 * with `autoApproveNewAccounts: false` and no auditor and neither value was reachable.
 *
 * The "no policy passed" cases are the regression lock on the default staying `'whitelist'`.
 *
 * arcade-token is absent on purpose: it has no confidential-balances extension.
 */

const matchesIx = (a: Instruction, b: Instruction) =>
    a.programAddress === b.programAddress && Buffer.compare(Buffer.from(a.data ?? []), Buffer.from(b.data ?? [])) === 0;

const AUDITOR = 'FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT' as Address;

describe('templates confidential balances policy / auditor passthrough', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const mint = createMockSigner();
    const mintAuthority = createMockSigner();
    const decimals = 6;

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    /** Builds the pre-initialize instruction the mint should carry for the given config. */
    const expectedConfidentialIx = (input: {
        authority: Address;
        autoApproveNewAccounts: boolean;
        auditorElgamalPubkey?: Address;
    }): Instruction => {
        const ext = extension('ConfidentialTransferMint', {
            authority: some(input.authority),
            autoApproveNewAccounts: input.autoApproveNewAccounts,
            auditorElgamalPubkey: input.auditorElgamalPubkey ? some(input.auditorElgamalPubkey) : null,
        });
        const [ix] = getPreInitializeInstructionsForMintExtensions(mint.address, [ext]);
        return ix;
    };

    /**
     * Each template reduced to "build a non-sRFC-37 mint with confidential balances and the
     * given policy/auditor", so one assertion table can drive all four.
     */
    const templates: Array<{
        name: string;
        build: (input: {
            policy?: ConfidentialApprovePolicy;
            auditorElgamalPubkey?: Address;
        }) => Promise<{ instructions: readonly Instruction[] }>;
    }> = [
        {
            name: 'custom-token',
            build: async ({ policy, auditorElgamalPubkey }) => {
                const { createCustomTokenInitTransaction } = await import('../custom-token.js');
                return createCustomTokenInitTransaction(
                    rpc,
                    'Name',
                    'SYM',
                    decimals,
                    'uri',
                    mintAuthority,
                    mint,
                    feePayer,
                    {
                        enableConfidentialBalances: true,
                        confidentialBalances: { policy, auditorElgamalPubkey },
                    },
                );
            },
        },
        {
            name: 'stablecoin',
            build: async ({ policy, auditorElgamalPubkey }) => {
                const { createStablecoinInitTransaction } = await import('../stablecoin.js');
                return createStablecoinInitTransaction(
                    rpc,
                    'Name',
                    'SYM',
                    decimals,
                    'uri',
                    mintAuthority,
                    mint,
                    feePayer,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    false,
                    undefined,
                    { policy, auditorElgamalPubkey },
                );
            },
        },
        {
            name: 'tokenized-security',
            build: async ({ policy, auditorElgamalPubkey }) => {
                const { createTokenizedSecurityInitTransaction } = await import('../tokenized-security.js');
                return createTokenizedSecurityInitTransaction(
                    rpc,
                    'Name',
                    'SYM',
                    decimals,
                    'uri',
                    mintAuthority,
                    mint,
                    feePayer,
                    undefined,
                    { enableSrfc37: false, confidentialBalances: { policy, auditorElgamalPubkey } },
                );
            },
        },
        {
            name: 'mmf',
            build: async ({ policy, auditorElgamalPubkey }) => {
                const { createMmfInitTransaction } = await import('../mmf.js');
                return createMmfInitTransaction(
                    rpc,
                    'Name',
                    'SYM',
                    decimals,
                    'uri',
                    mintAuthority,
                    mint,
                    feePayer,
                    undefined,
                    {
                        enableConfidentialBalances: true,
                        enableSrfc37: false,
                        confidentialBalances: { policy, auditorElgamalPubkey },
                    },
                );
            },
        },
    ];

    describe.each(templates)('$name', ({ build }) => {
        test('defaults to the whitelist policy with no auditor when none is passed', async () => {
            const tx = await build({});

            expect(
                tx.instructions.some(i =>
                    matchesIx(
                        i,
                        expectedConfidentialIx({ authority: mintAuthority.address, autoApproveNewAccounts: false }),
                    ),
                ),
            ).toBe(true);
        });

        test('opt-in policy sets autoApproveNewAccounts', async () => {
            const tx = await build({ policy: 'opt-in' });

            expect(
                tx.instructions.some(i =>
                    matchesIx(
                        i,
                        expectedConfidentialIx({ authority: mintAuthority.address, autoApproveNewAccounts: true }),
                    ),
                ),
            ).toBe(true);
        });

        test('whitelist policy leaves autoApproveNewAccounts false', async () => {
            const tx = await build({ policy: 'whitelist' });

            expect(
                tx.instructions.some(i =>
                    matchesIx(
                        i,
                        expectedConfidentialIx({ authority: mintAuthority.address, autoApproveNewAccounts: false }),
                    ),
                ),
            ).toBe(true);
        });

        test('auditor ElGamal pubkey is encoded on the mint', async () => {
            const tx = await build({ policy: 'opt-in', auditorElgamalPubkey: AUDITOR });

            expect(
                tx.instructions.some(i =>
                    matchesIx(
                        i,
                        expectedConfidentialIx({
                            authority: mintAuthority.address,
                            autoApproveNewAccounts: true,
                            auditorElgamalPubkey: AUDITOR,
                        }),
                    ),
                ),
            ).toBe(true);
        });
    });
});
