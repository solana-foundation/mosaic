import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { createMockRpc, resetMockRpc, seedAccountOwner, seedMintDetails, TEST_AUTHORITY } from './__tests__/test-utils';
import { TOKEN_ACL_PROGRAM_ID } from './token-acl/utils';
import { getMintDetails } from './transaction-util';

describe('getMintDetails', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint777777777777777777777777777777777777777' as Address;
    const signerFreezeAuthority = TEST_AUTHORITY;

    beforeEach(() => {
        rpc = createMockRpc();
        resetMockRpc(rpc);
    });

    test('does not throw when a signer freeze authority has no on-chain account', async () => {
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            freezeAuthority: signerFreezeAuthority,
            mintAuthority: signerFreezeAuthority,
        });

        await expect(getMintDetails(rpc, mint)).resolves.toMatchObject({
            decimals: 6,
            freezeAuthority: signerFreezeAuthority,
            mintAuthority: signerFreezeAuthority,
            usesTokenAcl: false,
        });
    });

    test('marks usesTokenAcl when the freeze authority account is owned by the Token ACL program', async () => {
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            freezeAuthority: signerFreezeAuthority,
        });
        seedAccountOwner(rpc, signerFreezeAuthority, TOKEN_ACL_PROGRAM_ID);

        await expect(getMintDetails(rpc, mint)).resolves.toMatchObject({
            freezeAuthority: signerFreezeAuthority,
            usesTokenAcl: true,
        });
    });
});
