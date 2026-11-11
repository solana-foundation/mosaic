import { getAddMemoInstruction, MEMO_PROGRAM_ADDRESS } from '@solana-program/memo';

/**
 * createTransferTransaction appends `getAddMemoInstruction({ memo })` with no explicit
 * program address, so it inherits whatever @solana-program/memo makes MEMO_PROGRAM_ADDRESS.
 *
 * That constant is NOT stable across the package's minor versions: 0.14.0 repointed it from
 * the Memo v3 program to the new Pinocchio Memo v4 program (Memo4c2p...), which is deployed
 * on mainnet and devnet but is absent from solana-test-validator 2.2.20's genesis. This SDK
 * deliberately stays on Memo v3 — the address wallets, explorers and indexers parse today —
 * by pinning @solana-program/memo to 0.13.1.
 *
 * This test fails in ~1s if a future bump flips the default again, instead of surfacing as
 * "Attempt to load a program that does not exist" in the integration suite.
 */
describe('memo program address', () => {
    const MEMO_V3_PROGRAM_ADDRESS = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

    test('transfers emit memos against the Memo v3 program', () => {
        expect(MEMO_PROGRAM_ADDRESS).toBe(MEMO_V3_PROGRAM_ADDRESS);
        expect(getAddMemoInstruction({ memo: 'Payment for services rendered' }).programAddress).toBe(
            MEMO_V3_PROGRAM_ADDRESS,
        );
    });
});
