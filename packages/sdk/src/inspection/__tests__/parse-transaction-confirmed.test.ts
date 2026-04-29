import { TOKEN_2022_PROGRAM_ADDRESS, Token2022Instruction } from '@solana-program/token-2022';
import { SYSTEM_PROGRAM_ADDRESS, SystemInstruction } from '@solana-program/system';
import { parseConfirmedTransaction } from '../parse-transaction';
import { ONCHAIN_CONFIRMED_FIXTURES } from './__fixtures__/onchain-confirmed-transactions';

// These tests exercise parseConfirmedTransaction against real getTransaction
// snapshots captured from a local cluster (see capture-fixtures.test.ts to
// regenerate). They assert that CPIs from meta.innerInstructions are walked
// and attached under each outer instruction's `innerInstructions` field.

const parse = (key: keyof typeof ONCHAIN_CONFIRMED_FIXTURES) => {
    const fx = ONCHAIN_CONFIRMED_FIXTURES[key];
    return parseConfirmedTransaction({
        transaction: [fx.base64, 'base64'] as const,
        meta: {
            innerInstructions: fx.innerInstructions,
            loadedAddresses: fx.loadedAddresses,
        },
    });
};

describe('parseConfirmedTransaction (on-chain confirmed snapshots)', () => {
    it('attaches inner CPI instructions under their outer parent (MintTo flow)', () => {
        const result = parse('mintToConfirmed');

        // Outer ixs: idempotent ATA create + MintTo (2 outer ixs).
        expect(result.instructions).toHaveLength(2);
        const [ataCreate, mintTo] = result.instructions;

        expect(ataCreate.programLabel).toBe('associated-token');
        expect(ataCreate.category).toBe('account-init');
        expect(ataCreate.stackHeight).toBe(1);

        expect(mintTo.programLabel).toBe('token-2022');
        expect(mintTo.category).toBe('supply');
        if (mintTo.programLabel === 'token-2022') {
            expect(mintTo.token2022.instructionType).toBe(Token2022Instruction.MintTo);
        }

        // The ATA program performs CPIs into both Token-2022 (GetAccountDataSize)
        // and System (CreateAccount with rent). The exact set varies by validator
        // version; we check the shape, not the precise count.
        expect(ataCreate.innerInstructions).toBeDefined();
        expect(ataCreate.innerInstructions!.length).toBeGreaterThan(0);

        const inner = ataCreate.innerInstructions!;
        for (const innerIx of inner) {
            expect(innerIx.stackHeight).toBeGreaterThanOrEqual(2);
        }

        // We should see at least one System.CreateAccount and one Token-2022 ix
        // among the CPIs from the idempotent ATA create.
        const innerSystemCreate = inner.find(
            i => i.programLabel === 'system' && i.programAddress === SYSTEM_PROGRAM_ADDRESS,
        );
        expect(innerSystemCreate).toBeDefined();
        if (innerSystemCreate?.programLabel === 'system') {
            expect(innerSystemCreate.system.instructionType).toBe(SystemInstruction.CreateAccount);
        }

        const innerT22 = inner.find(i => i.programAddress === TOKEN_2022_PROGRAM_ADDRESS);
        expect(innerT22).toBeDefined();

        // The MintTo outer ix doesn't CPI into anything; no inner ixs attached.
        expect(mintTo.innerInstructions ?? []).toEqual([]);
    });

    it('exposes inner CPIs in flatInnerInstructions with summary counted', () => {
        const result = parse('mintToConfirmed');

        // flatInnerInstructions contains every CPI across all outer ixs.
        expect(result.flatInnerInstructions.length).toBeGreaterThan(0);
        const flatCount = result.flatInnerInstructions.length;
        // Summary counts both outer (2) and inner (flatCount), so total ix
        // categories summed should equal 2 + flatCount.
        const totalCategorized = Object.values(result.summary).reduce((a, b) => a + b, 0);
        expect(totalCategorized).toBe(2 + flatCount);

        // token2022Instructions is the cross-cut filter and should include the
        // outer MintTo plus any inner Token-2022 CPIs.
        const t22 = result.token2022Instructions;
        expect(t22.length).toBeGreaterThanOrEqual(1);
        expect(t22.some(i => i.token2022.instructionType === Token2022Instruction.MintTo)).toBe(true);
    });

    it('parses TransferChecked + its inner CPIs', () => {
        const result = parse('transferCheckedConfirmed');

        // Outer: just the TransferChecked. The transfer builder may also add an
        // idempotent ATA create depending on whether the recipient ATA exists,
        // so we just check the transfer is the last outer ix.
        expect(result.summary.transfer).toBe(1);
        const transfer = result.instructions[result.instructions.length - 1];
        expect(transfer.programLabel).toBe('token-2022');
        if (transfer.programLabel === 'token-2022') {
            expect(transfer.token2022.instructionType).toBe(Token2022Instruction.TransferChecked);
        }

        // No CPIs out of TransferChecked itself (it doesn't invoke other programs),
        // but the ATA-create outer ix (if present) may have inner CPIs.
        const ataIxs = result.instructions.filter(i => i.programLabel === 'associated-token');
        for (const ata of ataIxs) {
            // The recipient's ATA already exists (we just transferred to it), so
            // CreateAssociatedTokenIdempotent is a no-op and reports no inner ixs
            // -- or it does some lightweight CPIs. Either way, just check shape.
            if (ata.innerInstructions) {
                for (const innerIx of ata.innerInstructions) {
                    expect(innerIx.stackHeight).toBeGreaterThanOrEqual(2);
                }
            }
        }
    });

    it('surfaces meta.err on the result when provided', () => {
        const fx = ONCHAIN_CONFIRMED_FIXTURES.mintToConfirmed;
        const failed = parseConfirmedTransaction({
            transaction: [fx.base64, 'base64'] as const,
            meta: {
                innerInstructions: fx.innerInstructions,
                loadedAddresses: fx.loadedAddresses,
                err: { InstructionError: [0, 'GenericError'] },
            },
        });
        expect(failed.error).toEqual({ InstructionError: [0, 'GenericError'] });

        const ok = parse('mintToConfirmed');
        expect(ok.error).toBeUndefined();
    });
});
