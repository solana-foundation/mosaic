import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { address, createKeyPairSignerFromBytes, none, type GetAccountInfoApi, type Rpc } from '@solana/kit';
import { AccountState, getTokenEncoder, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
    assertAccountMint,
    canSignerDecrypt,
    loadKeysSigner,
    loadSupplyKeysSigner,
    parseRawSupply,
    parseTxVersion,
    resolveTokenAccount,
    type ConfidentialOpts,
} from '../commands/confidential/options';
import {
    getConfidentialBalancesConfig,
    getConfidentialMintBurnInitFromFlags,
    parseConfidentialPolicy,
} from '../utils/confidential-create';

const MINT = address('9DMWvjE7svY2VCmpkdn5fHS7aG4msACtnMUwnhnB82wF');
const OTHER_MINT = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const TOKEN_ACCOUNT = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const SIGNER = address('11111111111111111111111111111111');
const SOMEONE_ELSE = address('SysvarRent111111111111111111111111111111111');

async function writeKeypair(dir: string, name: string): Promise<{ path: string; address: string }> {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const secret = Buffer.from(privateKey.export({ format: 'jwk' }).d as string, 'base64url');
    const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url');
    const bytes = new Uint8Array([...secret, ...pub]);
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify([...bytes]));
    const signer = await createKeyPairSignerFromBytes(bytes);
    return { path, address: signer.address };
}

function opts(overrides: Partial<ConfidentialOpts> = {}): ConfidentialOpts {
    return { txVersion: 0, ...overrides };
}

describe('parseTxVersion', () => {
    it('accepts 0 and 1', () => {
        expect(parseTxVersion('0')).toBe(0);
        expect(parseTxVersion('1')).toBe(1);
    });

    it('rejects anything else', () => {
        expect(() => parseTxVersion('2')).toThrow(/must be 0 or 1/);
        expect(() => parseTxVersion('legacy')).toThrow(/must be 0 or 1/);
    });
});

describe('parseRawSupply', () => {
    it('parses a raw integer supply', () => {
        expect(parseRawSupply('0')).toBe(0n);
        expect(parseRawSupply('18446744073709551615')).toBe(0xffff_ffff_ffff_ffffn);
    });

    it.each(['-1', '1.5', '1e6', '', ' 1'])('rejects %p', value => {
        expect(() => parseRawSupply(value)).toThrow(/non-negative integer/);
    });

    it('rejects a value past u64', () => {
        expect(() => parseRawSupply('18446744073709551616')).toThrow(/u64/);
    });
});

describe('canSignerDecrypt (inspect-account, HOO-2911 finding 4)', () => {
    const owned = { exists: true as const, data: { mint: MINT, owner: SIGNER } };

    it("decrypts the signer's own account, however it was named", () => {
        expect(canSignerDecrypt(owned, TOKEN_ACCOUNT, MINT, SIGNER)).toBe(true);
    });

    it("does not try someone else's account", () => {
        const theirs = { exists: true as const, data: { mint: MINT, owner: SOMEONE_ELSE } };
        expect(canSignerDecrypt(theirs, TOKEN_ACCOUNT, MINT, SIGNER)).toBe(false);
    });

    it('does not decrypt without a signer, or for a missing account', () => {
        expect(canSignerDecrypt(owned, TOKEN_ACCOUNT, MINT, undefined)).toBe(false);
        expect(canSignerDecrypt({ exists: false }, TOKEN_ACCOUNT, MINT, SIGNER)).toBe(false);
    });

    it('rejects an account of another mint', () => {
        const otherMint = { exists: true as const, data: { mint: OTHER_MINT, owner: SIGNER } };
        expect(() => canSignerDecrypt(otherMint, TOKEN_ACCOUNT, MINT, SIGNER)).toThrow(/belongs to mint/);
    });
});

/** A fake RPC whose `getAccountInfo` returns a Token-2022 account of `mint`, or nothing. */
function accountRpc(mint?: string): Rpc<GetAccountInfoApi> {
    const value = mint
        ? {
              data: [
                  Buffer.from(
                      getTokenEncoder().encode({
                          mint: address(mint),
                          owner: SIGNER,
                          amount: 0n,
                          delegate: none(),
                          state: AccountState.Initialized,
                          isNative: none(),
                          delegatedAmount: 0n,
                          closeAuthority: none(),
                          extensions: none(),
                      }),
                  ).toString('base64'),
                  'base64',
              ],
              executable: false,
              lamports: 2_039_280n,
              owner: TOKEN_2022_PROGRAM_ADDRESS,
              space: 165n,
              rentEpoch: 0n,
          }
        : null;
    return {
        getAccountInfo: () => ({ send: async () => ({ context: { slot: 0n }, value }) }),
    } as unknown as Rpc<GetAccountInfoApi>;
}

describe('resolveTokenAccount (explicit --token-account vs --mint)', () => {
    it('rejects an explicit account of another mint', async () => {
        await expect(resolveTokenAccount(accountRpc(OTHER_MINT), MINT, SIGNER, TOKEN_ACCOUNT)).rejects.toThrow(
            /belongs to mint/,
        );
    });

    it('accepts an explicit account of the mint', async () => {
        await expect(resolveTokenAccount(accountRpc(MINT), MINT, SIGNER, TOKEN_ACCOUNT)).resolves.toBe(TOKEN_ACCOUNT);
    });

    it('passes a missing explicit account through', async () => {
        await expect(resolveTokenAccount(accountRpc(), MINT, SIGNER, TOKEN_ACCOUNT)).resolves.toBe(TOKEN_ACCOUNT);
    });

    it('derives the ATA without fetching when no account is given', async () => {
        const rpc = { getAccountInfo: jest.fn() } as unknown as Rpc<GetAccountInfoApi>;
        await expect(resolveTokenAccount(rpc, MINT, SIGNER)).resolves.toEqual(expect.any(String));
        expect(rpc.getAccountInfo).not.toHaveBeenCalled();
    });
});

describe('assertAccountMint', () => {
    it('passes a missing account and an account of the mint', () => {
        expect(() => assertAccountMint({ exists: false }, TOKEN_ACCOUNT, MINT)).not.toThrow();
        const ours = { exists: true as const, data: { mint: MINT, owner: SIGNER } };
        expect(() => assertAccountMint(ours, TOKEN_ACCOUNT, MINT)).not.toThrow();
    });
});

describe('keypair loading', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mosaic-cli-confidential-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('loadKeysSigner refuses --raw-tx', async () => {
        const { path } = await writeKeypair(dir, 'owner.json');
        await expect(loadKeysSigner(opts({ rawTx: 'b64', keypair: path }))).rejects.toThrow(/cannot run in --raw-tx/);
    });

    it('loadKeysSigner rejects an --authority that is not the keypair', async () => {
        const { path } = await writeKeypair(dir, 'owner.json');
        await expect(loadKeysSigner(opts({ keypair: path, authority: SOMEONE_ELSE }))).rejects.toThrow(
            /does not match the --keypair signer/,
        );
    });

    it('loadKeysSigner loads the --keypair signer', async () => {
        const owner = await writeKeypair(dir, 'owner.json');
        await expect(loadKeysSigner(opts({ keypair: owner.path }))).resolves.toHaveProperty('address', owner.address);
    });

    it('loadSupplyKeysSigner falls back to --keypair', async () => {
        const owner = await writeKeypair(dir, 'owner.json');
        await expect(loadSupplyKeysSigner(opts({ keypair: owner.path }))).resolves.toHaveProperty(
            'address',
            owner.address,
        );
    });

    it('loadSupplyKeysSigner prefers --supply-keypair', async () => {
        const owner = await writeKeypair(dir, 'owner.json');
        const supply = await writeKeypair(dir, 'supply.json');
        await expect(loadSupplyKeysSigner(opts({ keypair: owner.path }), supply.path)).resolves.toHaveProperty(
            'address',
            supply.address,
        );
    });

    it('loadSupplyKeysSigner works under --raw-tx only with an explicit --supply-keypair', async () => {
        const owner = await writeKeypair(dir, 'owner.json');
        const supply = await writeKeypair(dir, 'supply.json');
        await expect(loadSupplyKeysSigner(opts({ rawTx: 'b64', keypair: owner.path }))).rejects.toThrow(
            /pass --supply-keypair/,
        );
        await expect(
            loadSupplyKeysSigner(opts({ rawTx: 'b64', keypair: owner.path }), supply.path),
        ).resolves.toHaveProperty('address', supply.address);
    });
});

describe('create confidential flags', () => {
    it('parses the policy', () => {
        expect(parseConfidentialPolicy(undefined)).toBeUndefined();
        expect(parseConfidentialPolicy('opt-in')).toBe('opt-in');
        expect(parseConfidentialPolicy('whitelist')).toBe('whitelist');
        expect(() => parseConfidentialPolicy('allowlist')).toThrow(/opt-in' or 'whitelist/);
    });

    it('builds the confidentialBalances config only when a flag is set', () => {
        expect(getConfidentialBalancesConfig({})).toBeUndefined();
        expect(getConfidentialBalancesConfig({ confidentialPolicy: 'opt-in' })).toEqual({
            policy: 'opt-in',
            auditorElgamalPubkey: undefined,
        });
        expect(getConfidentialBalancesConfig({ auditorElgamalPubkey: MINT })).toEqual({
            policy: undefined,
            auditorElgamalPubkey: MINT,
        });
    });

    it('rejects a malformed auditor pubkey', () => {
        expect(() => getConfidentialBalancesConfig({ auditorElgamalPubkey: 'not-an-address' })).toThrow(
            /not a valid address/,
        );
    });

    it('needs --supply-keypair with --confidential-mint-burn', async () => {
        await expect(getConfidentialMintBurnInitFromFlags({ confidentialMintBurn: true })).rejects.toThrow(
            /needs --supply-keypair/,
        );
    });

    it('rejects --supply-keypair without --confidential-mint-burn', async () => {
        await expect(getConfidentialMintBurnInitFromFlags({ supplyKeypair: '/tmp/x.json' })).rejects.toThrow(
            /only applies with --confidential-mint-burn/,
        );
    });

    it('adds nothing without the flags', async () => {
        await expect(getConfidentialMintBurnInitFromFlags({})).resolves.toBeUndefined();
    });
});
