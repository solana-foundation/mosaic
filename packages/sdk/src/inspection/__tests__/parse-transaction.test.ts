import {
    appendTransactionMessageInstructions,
    compileTransaction,
    createNoopSigner,
    createTransactionMessage,
    getAddressDecoder,
    getBase58Decoder,
    getBase64Decoder,
    getTransactionEncoder,
    pipe,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    type Address,
    type Blockhash,
    type Instruction,
    none,
    some,
} from '@solana/kit';
import {
    AssociatedTokenInstruction,
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    AuthorityType,
    getCreateAssociatedTokenInstruction,
    getFreezeAccountInstruction,
    getInitializeMint2Instruction,
    getMintToInstruction,
    getPauseInstruction,
    getResumeInstruction,
    getSetAuthorityInstruction,
    getThawAccountInstruction,
    getTransferCheckedInstruction,
    Token2022Instruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { getCreateAccountInstruction, SystemInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { getAddMemoInstruction, MEMO_PROGRAM_ADDRESS } from '@solana-program/memo';
import { parseTokenTransaction } from '../parse-transaction';

// Build deterministic but valid Address values from a tag byte. We can't use
// random keypairs here because we need synchronous, stable test fixtures; the
// decoded bytes only need to be unique 32-byte arrays for the wire encoder.
const addrFromTag = (tag: number): Address => {
    const bytes = new Uint8Array(32);
    bytes[0] = tag;
    return getAddressDecoder().decode(bytes);
};
const FEE_PAYER = addrFromTag(1);
const MINT = addrFromTag(2);
const AUTHORITY = addrFromTag(3);
const NEW_AUTHORITY = addrFromTag(4);
const SOURCE_ATA = addrFromTag(5);
const DEST_OWNER = addrFromTag(6);
const DEST_ATA = addrFromTag(7);
const NEW_MINT = addrFromTag(8);
// 32 zero bytes encoded as base58 — valid Blockhash shape, fine for unit tests.
const FAKE_BLOCKHASH = '11111111111111111111111111111111' as Blockhash;

const buildBytes = (instructions: Instruction[]): Uint8Array => {
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(FEE_PAYER, m),
        m => setTransactionMessageLifetimeUsingBlockhash({ blockhash: FAKE_BLOCKHASH, lastValidBlockHeight: 0n }, m),
        m => appendTransactionMessageInstructions(instructions, m),
    );
    return new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
};

describe('parseTokenTransaction', () => {
    it('parses a Token-2022 MintTo instruction as supply', () => {
        const ix = getMintToInstruction({
            mint: MINT,
            token: SOURCE_ATA,
            mintAuthority: AUTHORITY,
            amount: 1_000n,
        });
        const result = parseTokenTransaction(buildBytes([ix]));

        expect(result.version).toBe(0);
        expect(result.feePayer).toBe(FEE_PAYER);
        expect(result.instructions).toHaveLength(1);
        const [entry] = result.instructions;
        expect(entry.programLabel).toBe('token-2022');
        expect(entry.category).toBe('supply');
        if (entry.programLabel !== 'token-2022') throw new Error('expected token-2022');
        expect(entry.token2022.name).toBe('MintTo');
        expect(entry.token2022.instructionType).toBe(Token2022Instruction.MintTo);
        expect(result.summary.supply).toBe(1);
        expect(result.token2022Instructions).toHaveLength(1);
        expect(result.adminInstructions).toHaveLength(1);
    });

    it('parses TransferChecked into transfer category with named accounts', () => {
        const ix = getTransferCheckedInstruction({
            source: SOURCE_ATA,
            mint: MINT,
            destination: DEST_ATA,
            authority: AUTHORITY,
            amount: 42n,
            decimals: 6,
        });
        const result = parseTokenTransaction(buildBytes([ix]));

        const [entry] = result.instructions;
        if (entry.programLabel !== 'token-2022') throw new Error('expected token-2022');
        expect(entry.category).toBe('transfer');
        expect(entry.token2022.instructionType).toBe(Token2022Instruction.TransferChecked);
        const parsed = entry.token2022.parsed;
        if (!parsed || parsed.instructionType !== Token2022Instruction.TransferChecked) {
            throw new Error('expected TransferChecked parsed payload');
        }
        expect(parsed.accounts.source.address).toBe(SOURCE_ATA);
        expect(parsed.accounts.mint.address).toBe(MINT);
        expect(parsed.accounts.destination.address).toBe(DEST_ATA);
        expect(parsed.accounts.authority.address).toBe(AUTHORITY);
        expect(parsed.data.amount).toBe(42n);
        expect(parsed.data.decimals).toBe(6);
        expect(result.summary.transfer).toBe(1);
        expect(result.transferInstructions).toHaveLength(1);
    });

    it('classifies Pause/Resume as pause and Freeze/Thaw as freeze', () => {
        const result = parseTokenTransaction(
            buildBytes([
                getPauseInstruction({ mint: MINT, authority: AUTHORITY }),
                getResumeInstruction({ mint: MINT, authority: AUTHORITY }),
                getFreezeAccountInstruction({ account: SOURCE_ATA, mint: MINT, owner: AUTHORITY }),
                getThawAccountInstruction({ account: SOURCE_ATA, mint: MINT, owner: AUTHORITY }),
            ]),
        );

        const categories = result.instructions.map(e => e.category);
        expect(categories).toEqual(['pause', 'pause', 'freeze', 'freeze']);
        expect(result.summary.pause).toBe(2);
        expect(result.summary.freeze).toBe(2);
        expect(result.adminInstructions).toHaveLength(4);
    });

    it('classifies SetAuthority as mint-config-update', () => {
        const ix = getSetAuthorityInstruction({
            owned: MINT,
            owner: AUTHORITY,
            authorityType: AuthorityType.MintTokens,
            newAuthority: some(NEW_AUTHORITY),
        });
        const result = parseTokenTransaction(buildBytes([ix]));

        const [entry] = result.instructions;
        expect(entry.category).toBe('mint-config-update');
        if (entry.programLabel !== 'token-2022') throw new Error('expected token-2022');
        expect(entry.token2022.instructionType).toBe(Token2022Instruction.SetAuthority);
    });

    it('parses a multi-instruction mint-creation tx and produces correct summary', () => {
        const newMint = createNoopSigner(NEW_MINT);
        const payerSigner = createNoopSigner(FEE_PAYER);
        const result = parseTokenTransaction(
            buildBytes([
                getCreateAccountInstruction({
                    payer: payerSigner,
                    newAccount: newMint,
                    lamports: 2_039_280,
                    space: 165,
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                }),
                getInitializeMint2Instruction({
                    mint: newMint.address,
                    decimals: 6,
                    mintAuthority: AUTHORITY,
                    freezeAuthority: none(),
                }),
                getMintToInstruction({
                    mint: newMint.address,
                    token: SOURCE_ATA,
                    mintAuthority: AUTHORITY,
                    amount: 1n,
                }),
            ]),
        );

        expect(result.instructions.map(e => e.category)).toEqual(['account-init', 'mint-init', 'supply']);
        expect(result.summary['account-init']).toBe(1);
        expect(result.summary['mint-init']).toBe(1);
        expect(result.summary.supply).toBe(1);
        expect(result.summary.transfer).toBe(0);

        const systemEntry = result.instructions[0];
        if (systemEntry.programLabel !== 'system') throw new Error('expected system');
        expect(systemEntry.system.instructionType).toBe(SystemInstruction.CreateAccount);
        if (!systemEntry.system.parsed || systemEntry.system.instructionType !== SystemInstruction.CreateAccount) {
            throw new Error('expected parsed CreateAccount payload');
        }
        const createParsed = systemEntry.system.parsed;
        if (!('lamports' in createParsed.data)) throw new Error('expected CreateAccount data');
        expect(createParsed.data.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(createParsed.data.space).toBe(165n);
        expect(createParsed.data.lamports).toBe(2_039_280n);
    });

    it('classifies CreateAssociatedToken as account-init', () => {
        const payerSigner = createNoopSigner(FEE_PAYER);
        const ix = getCreateAssociatedTokenInstruction({
            payer: payerSigner,
            ata: DEST_ATA,
            owner: DEST_OWNER,
            mint: MINT,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        });
        const result = parseTokenTransaction(buildBytes([ix]));

        const [entry] = result.instructions;
        expect(entry.programLabel).toBe('associated-token');
        expect(entry.category).toBe('account-init');
        if (entry.programLabel !== 'associated-token') throw new Error('expected associated-token');
        expect(entry.programAddress).toBe(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
        expect(entry.associatedToken.instructionType).toBe(AssociatedTokenInstruction.CreateAssociatedToken);
    });

    it('flags non-T22/system/ATA programs as unknown without throwing', () => {
        const result = parseTokenTransaction(buildBytes([getAddMemoInstruction({ memo: 'hello' })]));

        const [entry] = result.instructions;
        expect(entry.programLabel).toBe('unknown');
        expect(entry.category).toBe('other');
        expect(entry.programAddress).toBe(MEMO_PROGRAM_ADDRESS);
        expect(result.summary.other).toBe(1);
    });

    it('accepts base58, base64, and Uint8Array forms equivalently', () => {
        const ix = getMintToInstruction({
            mint: MINT,
            token: SOURCE_ATA,
            mintAuthority: AUTHORITY,
            amount: 7n,
        });
        const bytes = buildBytes([ix]);
        const b58 = getBase58Decoder().decode(bytes);
        const b64 = getBase64Decoder().decode(bytes);

        const fromBytes = parseTokenTransaction(bytes);
        const fromB58 = parseTokenTransaction({ format: 'base58', data: b58 });
        const fromB64 = parseTokenTransaction({ format: 'base64', data: b64 });

        for (const r of [fromBytes, fromB58, fromB64]) {
            expect(r.instructions).toHaveLength(1);
            expect(r.instructions[0].category).toBe('supply');
        }
        expect(fromB58.feePayer).toBe(fromBytes.feePayer);
        expect(fromB64.feePayer).toBe(fromBytes.feePayer);
    });

    it('records signatures map keyed by signer address', () => {
        const ix = getMintToInstruction({
            mint: MINT,
            token: SOURCE_ATA,
            mintAuthority: AUTHORITY,
            amount: 1n,
        });
        const result = parseTokenTransaction(buildBytes([ix]));
        // Fee payer is always a signer; other signers depend on instruction roles.
        expect(Object.keys(result.signatures)).toContain(FEE_PAYER as Address as string);
        expect(result.signatures[FEE_PAYER as Address as string]).toBeNull();
    });
});
