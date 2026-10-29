import type { Address, Instruction, Rpc, SolanaRpcApi } from '@solana/kit';
import {
    Token2022Instruction,
    TOKEN_2022_PROGRAM_ADDRESS,
    identifyToken2022Instruction,
} from '@solana-program/token-2022';

import { createMockRpc, createMockSigner, seedMintDetails, seedTokenAccount } from '../../__tests__/test-utils.js';
import { createTransferInstructions } from '../index.js';

const MINT = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const FROM = 'VqBNewGVPmiG6RnSbCCwTPfwXCz6dWYpA3daksyQkBd' as Address;
const TO = '7h5W4SkNV9MwjrzcEYVdLqDU4WoDNiQZ1NA6pcVnNxfD' as Address;
const DECIMALS = 6;

const feePayer = createMockSigner('FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');
const authority = createMockSigner('GA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');

/**
 * Reads the raw amount out of the Token-2022 `transferChecked` instruction
 * (u8 discriminator + u64 amount LE + u8 decimals) and asserts its decimals.
 */
function transferCheckedRawAmount(instructions: readonly Instruction[]): bigint {
    const transferIx = instructions.find(
        ix => identifyToken2022Instruction(ix.data!) === Token2022Instruction.TransferChecked,
    );
    if (!transferIx) {
        throw new Error('No transferChecked instruction was built');
    }
    const data = transferIx.data!;
    expect(data[9]).toBe(DECIMALS);
    return new DataView(data.buffer, data.byteOffset + 1, 8).getBigUint64(0, true);
}

function buildInput(rpc: Rpc<SolanaRpcApi>, amount: string) {
    return { rpc, mint: MINT, from: FROM, to: TO, feePayer, authority, amount };
}

describe('createTransferInstructions amount precision', () => {
    let rpc: Rpc<SolanaRpcApi>;

    beforeEach(() => {
        rpc = createMockRpc();
        seedMintDetails(rpc, { address: MINT, decimals: DECIMALS });
        seedTokenAccount(rpc, { address: FROM, mint: MINT, state: 'initialized', amount: '10000000000' });
        seedTokenAccount(rpc, { address: TO, mint: MINT, state: 'initialized', amount: '0' });
    });

    test('scales the exact decimal string, not a parsed float, into transferChecked', async () => {
        // 16 significant digits: parseFloat('9999999999.999999') === 9999999999.999998,
        // so the pre-PR path transferred 9999999999999998 raw, one base unit short.
        // The instruction must carry the exact 9999999999999999.
        const instructions = await createTransferInstructions(buildInput(rpc, '9999999999.999999'));

        expect(transferCheckedRawAmount(instructions)).toBe(9999999999999999n);
    });

    test('normalizes parseFloat-compatible spellings with the real converter', async () => {
        // The app's amount input allows these spellings (its stepper even
        // produces exponent notation), so the SDK must keep accepting them.
        // `1.5000000`/`5.0` show trailing zeros past the mint decimals are
        // value-preserving.
        for (const [amount, raw] of [
            ['.5', 500_000n],
            ['5.', 5_000_000n],
            ['+1', 1_000_000n],
            ['1e-3', 1_000n],
            ['1.5000000', 1_500_000n],
            ['5.0', 5_000_000n],
        ] as const) {
            const instructions = await createTransferInstructions(buildInput(rpc, amount));
            expect(transferCheckedRawAmount(instructions)).toBe(raw);
        }
    });

    test('rejects malformed, over-precise and non-positive amounts', async () => {
        await expect(createTransferInstructions(buildInput(rpc, 'abc'))).rejects.toThrow(
            'Amount must be a positive number',
        );
        await expect(createTransferInstructions(buildInput(rpc, '1,000.5'))).rejects.toThrow(
            'Amount must be a positive number',
        );
        await expect(createTransferInstructions(buildInput(rpc, '0'))).rejects.toThrow(
            'Amount must be a positive number',
        );
        await expect(createTransferInstructions(buildInput(rpc, '0.0000001'))).rejects.toThrow(
            'Amount cannot have more than 6 decimal places',
        );
        await expect(createTransferInstructions(buildInput(rpc, '99999999999999999999'))).rejects.toThrow(
            'Amount exceeds the maximum u64 token amount',
        );
    });

    test('rejects malformed amounts before touching the RPC', async () => {
        // The format and positive-number checks need no decimals, so bad input
        // must fail before the mint fetch instead of surfacing a mint/RPC
        // error that hides the real amount error.
        const failingRpc = {
            getAccountInfo: () => {
                throw new Error('RPC must not be called for malformed amounts');
            },
        } as unknown as Rpc<SolanaRpcApi>;

        await expect(createTransferInstructions(buildInput(failingRpc, 'abc'))).rejects.toThrow(
            'Amount must be a positive number',
        );
        await expect(createTransferInstructions(buildInput(failingRpc, '0'))).rejects.toThrow(
            'Amount must be a positive number',
        );
    });

    test('rejects sub-base-unit amounts instead of building a zero transfer', async () => {
        // '0.0000005' passes any parseFloat > 0 check but cannot be represented
        // at 6 decimals: the extra digit is over-precision, and an all-zero
        // value such as '0.0' throws as non-positive (covered above). Neither
        // path may emit a transferChecked of 0.
        await expect(createTransferInstructions(buildInput(rpc, '0.0000005'))).rejects.toThrow(
            'Amount cannot have more than 6 decimal places',
        );
        await expect(createTransferInstructions(buildInput(rpc, '0.0'))).rejects.toThrow(
            'Amount must be a positive number',
        );
    });
});
