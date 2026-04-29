import {
    AssociatedTokenInstruction,
    Token2022Instruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { SystemInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { parseTokenTransaction } from '../parse-transaction';
import { ONCHAIN_FIXTURES } from './__fixtures__/onchain-transactions';

// These tests run parseTokenTransaction against real wire bytes captured from a
// local Solana cluster (see src/__tests__/integration/capture-fixtures.test.ts
// to regenerate). They are pure unit tests — no chain access required.

const parse = (key: keyof typeof ONCHAIN_FIXTURES) =>
    parseTokenTransaction({ format: 'base64', data: ONCHAIN_FIXTURES[key].base64 });

describe('parseTokenTransaction (on-chain fixtures)', () => {
    it('parses a mint-issuance transaction', () => {
        const result = parse('issuanceWithMetadata');

        // Issuance fans out: System.CreateAccount, T22 InitializeMetadataPointer,
        // T22 InitializeMint2, and T22 InitializeTokenMetadata.
        expect(result.summary['account-init']).toBeGreaterThanOrEqual(1);
        expect(result.summary['mint-init']).toBeGreaterThanOrEqual(2);
        expect(result.feePayer).toBeDefined();

        const programs = result.instructions.map(e => e.programLabel);
        expect(programs).toContain('system');
        expect(programs).toContain('token-2022');

        const initMint = result.token2022Instructions.find(
            e =>
                e.token2022.instructionType === Token2022Instruction.InitializeMint ||
                e.token2022.instructionType === Token2022Instruction.InitializeMint2,
        );
        expect(initMint).toBeDefined();

        const tokenMetadata = result.token2022Instructions.find(
            e => e.token2022.instructionType === Token2022Instruction.InitializeTokenMetadata,
        );
        expect(tokenMetadata).toBeDefined();
        // The metadata-interface payload sometimes can't be decoded by codama's
        // generated codec; identification still succeeds and we surface the
        // codec error rather than failing the parse.
        if (tokenMetadata?.token2022.parseError) {
            expect(tokenMetadata.token2022.name).toBe('InitializeTokenMetadata');
        } else if (tokenMetadata?.token2022.parsed?.instructionType === Token2022Instruction.InitializeTokenMetadata) {
            expect(tokenMetadata.token2022.parsed.data.name).toBe('Fixture Token');
            expect(tokenMetadata.token2022.parsed.data.symbol).toBe('FIX');
        }
    });

    it('parses a MintTo + idempotent-ATA-create transaction', () => {
        const result = parse('mintTo');

        // The createMintToTransaction builder lays down ATA create then MintTo.
        const ataCreate = result.instructions.find(e => e.programLabel === 'associated-token');
        expect(ataCreate).toBeDefined();
        expect(ataCreate?.category).toBe('account-init');
        if (ataCreate?.programLabel === 'associated-token') {
            expect(ataCreate.programAddress).not.toBe(TOKEN_2022_PROGRAM_ADDRESS);
            expect(ataCreate.associatedToken.instructionType).toBe(
                AssociatedTokenInstruction.CreateAssociatedTokenIdempotent,
            );
        }

        expect(result.summary.supply).toBe(1);
        const mintTo = result.token2022Instructions.find(
            e => e.token2022.instructionType === Token2022Instruction.MintTo,
        );
        expect(mintTo).toBeDefined();
        if (mintTo?.token2022.parsed?.instructionType === Token2022Instruction.MintTo) {
            // 5 tokens at 6 decimals
            expect(mintTo.token2022.parsed.data.amount).toBe(5_000_000n);
        }
    });

    it('parses a TransferChecked transaction', () => {
        const result = parse('transferChecked');

        expect(result.summary.transfer).toBe(1);
        const [transferIx] = result.transferInstructions;
        expect(transferIx).toBeDefined();
        if (
            transferIx?.programLabel === 'token-2022' &&
            transferIx.token2022.parsed?.instructionType === Token2022Instruction.TransferChecked
        ) {
            // 1 token at 6 decimals
            expect(transferIx.token2022.parsed.data.amount).toBe(1_000_000n);
            expect(transferIx.token2022.parsed.data.decimals).toBe(6);
            // Source, mint, destination, authority all resolved to real addresses
            expect(transferIx.token2022.parsed.accounts.source.address).toBeDefined();
            expect(transferIx.token2022.parsed.accounts.mint.address).toBeDefined();
            expect(transferIx.token2022.parsed.accounts.destination.address).toBeDefined();
            expect(transferIx.token2022.parsed.accounts.authority.address).toBeDefined();
        } else {
            throw new Error('expected a parsed TransferChecked instruction');
        }
    });

    it('parses a multi-instruction Freeze + Thaw transaction', () => {
        const result = parse('freezeThawMulti');

        expect(result.instructions.map(e => e.category)).toEqual(['freeze', 'freeze']);
        expect(result.summary.freeze).toBe(2);

        const [freeze, thaw] = result.token2022Instructions;
        expect(freeze.token2022.instructionType).toBe(Token2022Instruction.FreezeAccount);
        expect(thaw.token2022.instructionType).toBe(Token2022Instruction.ThawAccount);

        // Both ixs reference the same token account and the same mint.
        if (
            freeze.token2022.parsed?.instructionType === Token2022Instruction.FreezeAccount &&
            thaw.token2022.parsed?.instructionType === Token2022Instruction.ThawAccount
        ) {
            expect(freeze.token2022.parsed.accounts.account.address).toBe(
                thaw.token2022.parsed.accounts.account.address,
            );
            expect(freeze.token2022.parsed.accounts.mint.address).toBe(thaw.token2022.parsed.accounts.mint.address);
        }
    });

    it('attributes System and Token-2022 program addresses correctly', () => {
        const result = parse('issuanceWithMetadata');
        const sysIxs = result.instructions.filter(e => e.programLabel === 'system');
        const t22Ixs = result.instructions.filter(e => e.programLabel === 'token-2022');
        expect(sysIxs.length).toBeGreaterThan(0);
        expect(t22Ixs.length).toBeGreaterThan(0);
        for (const ix of sysIxs) expect(ix.programAddress).toBe(SYSTEM_PROGRAM_ADDRESS);
        for (const ix of t22Ixs) expect(ix.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);

        const createAccount = sysIxs.find(
            e => e.programLabel === 'system' && e.system.instructionType === SystemInstruction.CreateAccount,
        );
        expect(createAccount).toBeDefined();
    });
});
