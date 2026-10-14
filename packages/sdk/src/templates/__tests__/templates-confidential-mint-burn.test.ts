import type { Address, Instruction, Rpc, SolanaRpcApi } from '@solana/kit';
import {
    INITIALIZE_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { createMockRpc, createMockSigner, generateMockAddress } from '../../__tests__/test-utils.js';
import type { ConfidentialMintBurnOptions } from '../../issuance/create-mint.js';

/**
 * Covers the `ConfidentialMintBurn` passthrough on every template that can carry it.
 *
 * The extension can only be added at creation, and only on top of
 * `ConfidentialTransferMint` — so a template that silently drops the option would
 * produce a mint that looks right and then rejects every confidential mint and burn
 * on chain. These tests lock the passthrough and the ordering.
 *
 * arcade-token is absent on purpose: it has no confidential-balances extension, so it
 * cannot carry mint/burn either.
 */

const SUPPLY_PUBKEY = generateMockAddress() as Address;
const DECRYPTABLE_SUPPLY = new Uint8Array(36).fill(7);
const MINT_BURN: ConfidentialMintBurnOptions = {
    supplyElgamalPubkey: SUPPLY_PUBKEY,
    decryptableSupply: DECRYPTABLE_SUPPLY,
};

/** How many InitializeConfidentialMintBurn instructions the mint init carries. */
const countMintBurnInits = (instructions: readonly Instruction[]) =>
    instructions.filter(
        ix =>
            ix.programAddress === TOKEN_2022_PROGRAM_ADDRESS &&
            ix.data?.[0] === INITIALIZE_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
    ).length;

describe('templates confidential mint/burn passthrough', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const mint = createMockSigner();
    const mintAuthority = createMockSigner();
    const decimals = 6;

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    const templates: Array<{
        name: string;
        build: (mintBurn?: ConfidentialMintBurnOptions) => Promise<{ instructions: readonly Instruction[] }>;
    }> = [
        {
            name: 'custom-token',
            build: async mintBurn => {
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
                        enableConfidentialMintBurn: mintBurn !== undefined,
                        confidentialMintBurn: mintBurn,
                    },
                );
            },
        },
        {
            name: 'stablecoin',
            build: async mintBurn => {
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
                    undefined,
                    mintBurn,
                );
            },
        },
        {
            name: 'tokenized-security',
            build: async mintBurn => {
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
                    { confidentialMintBurn: mintBurn },
                );
            },
        },
    ];

    for (const { name, build } of templates) {
        describe(name, () => {
            it('initializes ConfidentialMintBurn when the init values are passed', async () => {
                const { instructions } = await build(MINT_BURN);
                expect(countMintBurnInits(instructions)).toBe(1);
            });

            it('leaves the extension off when no init values are passed', async () => {
                const { instructions } = await build(undefined);
                expect(countMintBurnInits(instructions)).toBe(0);
            });

            it('rejects a decryptableSupply that is not 36 bytes', async () => {
                await expect(
                    build({ supplyElgamalPubkey: SUPPLY_PUBKEY, decryptableSupply: new Uint8Array(35) }),
                ).rejects.toThrow('decryptableSupply must be 36 bytes (got 35).');
            });
        });
    }

    describe('custom-token guards', () => {
        it('refuses the toggle without init values', async () => {
            const { createCustomTokenInitTransaction } = await import('../custom-token.js');
            await expect(
                createCustomTokenInitTransaction(rpc, 'Name', 'SYM', decimals, 'uri', mintAuthority, mint, feePayer, {
                    enableConfidentialBalances: true,
                    enableConfidentialMintBurn: true,
                }),
            ).rejects.toThrow('confidentialMintBurn is required when enableConfidentialMintBurn is set');
        });

        it('initializes the extension when init values are passed without the toggle', async () => {
            const { createCustomTokenInitTransaction } = await import('../custom-token.js');
            const { instructions } = await createCustomTokenInitTransaction(
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
                    confidentialMintBurn: MINT_BURN,
                },
            );
            expect(countMintBurnInits(instructions)).toBe(1);
        });

        it('refuses mint/burn without confidential balances', async () => {
            const { createCustomTokenInitTransaction } = await import('../custom-token.js');
            await expect(
                createCustomTokenInitTransaction(rpc, 'Name', 'SYM', decimals, 'uri', mintAuthority, mint, feePayer, {
                    enableConfidentialMintBurn: true,
                    confidentialMintBurn: MINT_BURN,
                }),
            ).rejects.toThrow('ConfidentialTransferMint extension must be enabled before adding ConfidentialMintBurn');
        });
    });
});
