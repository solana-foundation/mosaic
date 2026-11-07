import type { Address, ReadonlyUint8Array, Rpc, SolanaRpcApi } from '@solana/kit';
import { generateKeyPairSigner, isSignerRole, signTransactionMessageWithSigners } from '@solana/kit';
import {
    getMintToInstructionDataDecoder,
    getPermissionedBurnCheckedInstructionDataDecoder,
    getBurnCheckedInstructionDataDecoder,
    getTransferCheckedInstructionDataDecoder,
} from '@solana-program/token-2022';

import { createMockRpc, createMockSigner, mockTransactionUtilWithRealAmounts } from '../../__tests__/test-utils.js';
import type { FullTransaction } from '../../transaction-util.js';

// parseFloat('9007199254740993') === 9007199254740992 (2^53 + 1 is not
// representable as a JS number). On a 0-decimal mint the exact string must be
// encoded into the instruction untouched, or the user mints/burns/transfers a
// different on-chain amount than they typed. The tests below use the real
// decimalAmountToRaw and decode the built instruction, so an encoding
// regression (not just a dropped argument) is caught.
const PRECISE_AMOUNT = '9007199254740993';
const PRECISE_RAW = 9_007_199_254_740_993n;

const mint = 'Mint777777777777777777777777777777777777777' as Address;
const account = 'Wall777777777777777777777777777777777777777' as Address;

// The last instruction each builder pushes is the amount-bearing token op
// (any ATA-create or thaw instructions come before it).
function lastAmount<T extends { amount: bigint }>(
    tx: FullTransaction,
    decoder: { decode: (d: ReadonlyUint8Array) => T },
): bigint {
    const data = tx.instructions[tx.instructions.length - 1].data;
    if (!data) throw new Error('expected the token instruction to carry data');
    return decoder.decode(data).amount;
}

describe('management amount precision', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner('Fee777777777777777777777777777777777777');
    const authority = createMockSigner('Auth7777777777777777777777777777777777777');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
        mockTransactionUtilWithRealAmounts(0, 10_000_000_000_000_000n);
    });

    test('createMintToTransaction encodes the exact amount', async () => {
        const { createMintToTransaction } = await import('../mint.js');
        const tx = await createMintToTransaction(rpc, mint, account, PRECISE_AMOUNT, authority, feePayer);
        expect(lastAmount(tx, getMintToInstructionDataDecoder())).toBe(PRECISE_RAW);
    });

    test('createBurnTransaction encodes the exact amount', async () => {
        const { createBurnTransaction } = await import('../burn.js');
        const tx = await createBurnTransaction(rpc, mint, authority, PRECISE_AMOUNT, feePayer);
        expect(lastAmount(tx, getBurnCheckedInstructionDataDecoder())).toBe(PRECISE_RAW);
    });

    test('createForceBurnTransaction encodes the exact amount', async () => {
        const { createForceBurnTransaction } = await import('../force-burn.js');
        const tx = await createForceBurnTransaction(rpc, mint, account, PRECISE_AMOUNT, authority, feePayer);
        expect(lastAmount(tx, getBurnCheckedInstructionDataDecoder())).toBe(PRECISE_RAW);
    });

    test('createForceTransferTransaction encodes the exact amount', async () => {
        const { createForceTransferTransaction } = await import('../force-transfer.js');
        const tx = await createForceTransferTransaction(
            rpc,
            mint,
            account,
            account,
            PRECISE_AMOUNT,
            authority,
            feePayer,
        );
        expect(lastAmount(tx, getTransferCheckedInstructionDataDecoder())).toBe(PRECISE_RAW);
    });

    test('createPermissionedBurnTransaction encodes the exact amount', async () => {
        const { createPermissionedBurnTransaction } = await import('../permissioned-burn.js');
        const tx = await createPermissionedBurnTransaction(rpc, mint, account, PRECISE_AMOUNT, authority, feePayer);
        expect(lastAmount(tx, getPermissionedBurnCheckedInstructionDataDecoder())).toBe(PRECISE_RAW);
    });

    test('createMintToTransaction marks an Address mint authority as a signer', async () => {
        const { createMintToTransaction } = await import('../mint.js');
        const tx = await createMintToTransaction(rpc, mint, account, '1', authority.address, feePayer);
        const mintTo = tx.instructions[tx.instructions.length - 1];
        const authorityMeta = mintTo.accounts?.find(meta => meta.address === authority.address);
        expect(authorityMeta && isSignerRole(authorityMeta.role)).toBe(true);
    });

    test('createMintToTransaction signs when the Address mint authority is the fee payer', async () => {
        const { createMintToTransaction } = await import('../mint.js');
        // A noop signer for the authority next to the real fee payer signer would make
        // signing throw "Multiple distinct signers were identified for address".
        const [wallet, realMint, recipient] = await Promise.all([
            generateKeyPairSigner(),
            generateKeyPairSigner(),
            generateKeyPairSigner(),
        ]);
        const tx = await createMintToTransaction(rpc, realMint.address, recipient.address, '1', wallet.address, wallet);
        await expect(signTransactionMessageWithSigners(tx)).resolves.toBeDefined();
    });
});
