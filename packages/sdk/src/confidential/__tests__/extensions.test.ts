import type { Address } from '@solana/kit';
import {
    getConfidentialMintBurnSupplyElgamalPubkey,
    getConfidentialTransferAccountElgamalPubkey,
    isConfidentialMintBurn,
    isConfidentialTransferAccount,
    isConfidentialTransferMint,
    mintHasConfidentialTransferFee,
    mintHasTransferFeeConfig,
    type DecodedMint,
    type DecodedToken,
} from '../extensions.js';

// These are pure, WASM-free readers over an already-decoded (Codama) account, so
// the tests build the decoded shape directly rather than going through a mocked
// `fetchMint`/`fetchToken`. Each predicate has to cope with three states the
// builders really see: no extension list at all (`__option: 'None'`, a plain
// SPL-Token mint), a list that does not contain the extension, and a list that
// does.

const ELGAMAL = 'DsT1111111111111111111111111111111111111111' as Address;
const SUPPLY_ELGAMAL = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as Address;

function mintWith(...extensions: unknown[]): DecodedMint {
    return { data: { extensions: { __option: 'Some', value: extensions } } } as unknown as DecodedMint;
}

function tokenWith(...extensions: unknown[]): DecodedToken {
    return { data: { extensions: { __option: 'Some', value: extensions } } } as unknown as DecodedToken;
}

const MINT_NO_EXTENSIONS = { data: { extensions: { __option: 'None' } } } as unknown as DecodedMint;
const TOKEN_NO_EXTENSIONS = { data: { extensions: { __option: 'None' } } } as unknown as DecodedToken;

describe('mint predicates', () => {
    const cases: Array<[string, (mint: DecodedMint) => boolean, string]> = [
        ['isConfidentialMintBurn', isConfidentialMintBurn, 'ConfidentialMintBurn'],
        ['isConfidentialTransferMint', isConfidentialTransferMint, 'ConfidentialTransferMint'],
        ['mintHasConfidentialTransferFee', mintHasConfidentialTransferFee, 'ConfidentialTransferFee'],
        ['mintHasTransferFeeConfig', mintHasTransferFeeConfig, 'TransferFeeConfig'],
    ];

    it.each(cases)('%s is false when the mint carries no extensions at all', (_name, predicate) => {
        expect(predicate(MINT_NO_EXTENSIONS)).toBe(false);
    });

    it.each(cases)('%s is false when the extension list holds only unrelated entries', (_name, predicate) => {
        expect(predicate(mintWith({ __kind: 'PausableConfig' }, { __kind: 'PermanentDelegate' }))).toBe(false);
    });

    it.each(cases)('%s is true when its own extension is present', (_name, predicate, kind) => {
        expect(predicate(mintWith({ __kind: 'PausableConfig' }, { __kind: kind }))).toBe(true);
    });

    it('distinguishes ConfidentialTransferFee from TransferFeeConfig', () => {
        // The two are separate extensions with confusingly similar names, and the
        // transfer builder routes on one while requiring the other, so a mix-up
        // here would send a fee mint down the no-fee path.
        const confidentialOnly = mintWith({ __kind: 'ConfidentialTransferFee' });
        expect(mintHasConfidentialTransferFee(confidentialOnly)).toBe(true);
        expect(mintHasTransferFeeConfig(confidentialOnly)).toBe(false);

        const plaintextOnly = mintWith({ __kind: 'TransferFeeConfig' });
        expect(mintHasConfidentialTransferFee(plaintextOnly)).toBe(false);
        expect(mintHasTransferFeeConfig(plaintextOnly)).toBe(true);
    });

    it('recognizes a mint carrying both confidential extensions', () => {
        const mint = mintWith({ __kind: 'ConfidentialTransferMint' }, { __kind: 'ConfidentialMintBurn' });
        expect(isConfidentialTransferMint(mint)).toBe(true);
        expect(isConfidentialMintBurn(mint)).toBe(true);
    });
});

describe('isConfidentialTransferAccount', () => {
    it('is false for a plain ATA with no extensions', () => {
        expect(isConfidentialTransferAccount(TOKEN_NO_EXTENSIONS)).toBe(false);
    });

    it('is false when the account has other extensions only', () => {
        expect(isConfidentialTransferAccount(tokenWith({ __kind: 'MemoTransfer' }))).toBe(false);
    });

    it('is true once the account is confidential-transfer configured', () => {
        expect(isConfidentialTransferAccount(tokenWith({ __kind: 'ConfidentialTransferAccount' }))).toBe(true);
    });
});

describe('getConfidentialTransferAccountElgamalPubkey', () => {
    it('returns null when the account has no extensions', () => {
        expect(getConfidentialTransferAccountElgamalPubkey(TOKEN_NO_EXTENSIONS)).toBeNull();
    });

    it('returns null when the account is not confidential-transfer configured', () => {
        expect(getConfidentialTransferAccountElgamalPubkey(tokenWith({ __kind: 'MemoTransfer' }))).toBeNull();
    });

    it('returns the registered pubkey, picking it out of a mixed extension list', () => {
        const token = tokenWith(
            { __kind: 'MemoTransfer' },
            { __kind: 'ConfidentialTransferAccount', elgamalPubkey: ELGAMAL },
        );
        expect(getConfidentialTransferAccountElgamalPubkey(token)).toBe(ELGAMAL);
    });
});

describe('getConfidentialMintBurnSupplyElgamalPubkey', () => {
    it('returns null when the mint has no extensions', () => {
        expect(getConfidentialMintBurnSupplyElgamalPubkey(MINT_NO_EXTENSIONS)).toBeNull();
    });

    it('returns null for a confidential-transfer mint without ConfidentialMintBurn', () => {
        expect(getConfidentialMintBurnSupplyElgamalPubkey(mintWith({ __kind: 'ConfidentialTransferMint' }))).toBeNull();
    });

    it('returns the supply pubkey, picking it out of a mixed extension list', () => {
        const mint = mintWith(
            { __kind: 'ConfidentialTransferMint' },
            { __kind: 'ConfidentialMintBurn', supplyElgamalPubkey: SUPPLY_ELGAMAL },
        );
        expect(getConfidentialMintBurnSupplyElgamalPubkey(mint)).toBe(SUPPLY_ELGAMAL);
    });

    it('does not confuse the account-side pubkey with the supply-side one', () => {
        // Both readers search a list of `__kind`-tagged entries; a copy-paste slip
        // between them would surface as a wrong-key proof rejection on-chain.
        const mint = mintWith({ __kind: 'ConfidentialMintBurn', supplyElgamalPubkey: SUPPLY_ELGAMAL });
        expect(getConfidentialTransferAccountElgamalPubkey(mint as unknown as DecodedToken)).toBeNull();
    });
});
