import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { createMockRpc, createMockSigner } from '../__tests__/test-utils';
import { TOKEN_ACL_PROGRAM_ID } from './utils';

const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as Address;

describe('freeze wallet instructions', () => {
    let rpc: Rpc<SolanaRpcApi>;

    const mint = 'Mint555555555555555555555555555555555555555' as Address;
    const wallet = 'Wall555555555555555555555555555555555555555' as Address;
    const tokenAccount = 'Ata55555555555555555555555555555555555555' as Address;
    const payer = createMockSigner();
    const authority = createMockSigner('Auth55555555555555555555555555555555555');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    function mockTransactionUtil(input: {
        isInitialized: boolean;
        usesTokenAcl?: boolean;
        tokenAclFreezeAuthority?: boolean;
        defaultFrozen?: boolean;
    }): void {
        jest.doMock('../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount,
                isInitialized: input.isInitialized,
                isFrozen: !input.isInitialized,
                balance: 0n,
                uiBalance: 0,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority:
                    input.usesTokenAcl || input.tokenAclFreezeAuthority ? TOKEN_ACL_PROGRAM_ID : authority.address,
                extensions: input.defaultFrozen
                    ? [{ extension: 'defaultAccountState', state: { accountState: 'frozen' } }]
                    : [],
                usesTokenAcl: input.usesTokenAcl === true,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(input.defaultFrozen === true),
        }));
    }

    test('creates a missing ATA before freezing with standard Token-2022 authority', async () => {
        mockTransactionUtil({ isInitialized: false });

        const { getFreezeWalletInstructions } = await import('./freeze');
        const instructions = await getFreezeWalletInstructions({
            rpc,
            payer,
            authority,
            wallet,
            mint,
        });

        expect(instructions).toHaveLength(2);
        expect(instructions[0].programAddress).toBe(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
        expect(instructions[1].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
    });

    test('only creates a missing ATA when SRFC-37 default account state will freeze it', async () => {
        mockTransactionUtil({ isInitialized: false, tokenAclFreezeAuthority: true, defaultFrozen: true });

        const { getFreezeWalletInstructions } = await import('./freeze');
        const instructions = await getFreezeWalletInstructions({
            rpc,
            payer,
            authority,
            wallet,
            mint,
        });

        expect(instructions).toHaveLength(1);
        expect(instructions[0].programAddress).toBe(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
    });

    test('freezes an existing ATA without creating it again', async () => {
        mockTransactionUtil({ isInitialized: true });

        const { getFreezeWalletInstructions } = await import('./freeze');
        const instructions = await getFreezeWalletInstructions({
            rpc,
            payer,
            authority,
            wallet,
            mint,
        });

        expect(instructions).toHaveLength(1);
        expect(instructions[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
    });
});
