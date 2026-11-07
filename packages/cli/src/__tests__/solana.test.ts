import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKeyPairSignerFromBytes, isKeyPairSigner, type TransactionSigner } from '@solana/kit';
import { resolveSigner, resolveSigners } from '../utils/solana';

// Fixed, well-formed addresses that no keypair in these tests owns.
const AUTHORITY = '9DMWvjE7svY2VCmpkdn5fHS7aG4msACtnMUwnhnB82wF';
const FEE_PAYER = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Writes a fresh Solana CLI-style keypair file (64-byte JSON array) and returns its path and address. */
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

/** A noop signer has no key pair behind it and signs nothing. */
async function expectNoopSigner(signer: TransactionSigner<string>) {
    expect(isKeyPairSigner(signer)).toBe(false);
    if (!('signTransactions' in signer)) throw new Error('expected a partial signer');
    await expect(signer.signTransactions([{} as never])).resolves.toEqual([{}]);
}

describe('signer resolution', () => {
    const originalHome = process.env.HOME;
    let dir: string;
    let missingKeypair: string;

    beforeEach(() => {
        // An empty HOME: no Solana CLI config and no default keypair, as on a keyless machine.
        // It also guarantees these tests never read the developer's real ~/.config/solana/id.json.
        dir = mkdtempSync(join(tmpdir(), 'mosaic-cli-signers-'));
        process.env.HOME = dir;
        missingKeypair = join(dir, 'missing.json');
    });

    afterEach(() => {
        process.env.HOME = originalHome;
        rmSync(dir, { recursive: true, force: true });
    });

    describe('resolveSigner with --raw-tx', () => {
        it('uses the override without reading any keypair', async () => {
            // The keypair path does not exist: reading it would throw.
            const { signer, address } = await resolveSigner('b64', missingKeypair, AUTHORITY);
            expect(address).toBe(AUTHORITY);
            expect(signer.address).toBe(AUTHORITY);
            await expectNoopSigner(signer);
        });

        it('falls back to the --keypair address, still as a noop signer', async () => {
            const kp = await writeKeypair(dir, 'authority.json');
            const { signer, address } = await resolveSigner('b64', kp.path);
            expect(address).toBe(kp.address);
            await expectNoopSigner(signer);
        });

        it('names the flag to pass when there is neither an override nor a keypair', async () => {
            await expect(resolveSigner('b64', undefined, undefined, '--mint-authority')).rejects.toThrow(
                /pass --mint-authority <address>/,
            );
        });

        it('rejects an override that is not an address', async () => {
            await expect(resolveSigner('b64', undefined, 'not-an-address')).rejects.toThrow(
                '--authority is not a valid address: not-an-address',
            );
        });
    });

    describe('resolveSigner without --raw-tx', () => {
        it('loads the keypair as a real signer', async () => {
            const kp = await writeKeypair(dir, 'authority.json');
            const { signer, address } = await resolveSigner(undefined, kp.path);
            expect(address).toBe(kp.address);
            expect(isKeyPairSigner(signer)).toBe(true);
        });

        it('accepts an override equal to the keypair address', async () => {
            const kp = await writeKeypair(dir, 'authority.json');
            const { signer } = await resolveSigner(undefined, kp.path, kp.address);
            expect(isKeyPairSigner(signer)).toBe(true);
        });

        it('rejects an override the keypair cannot sign for', async () => {
            const kp = await writeKeypair(dir, 'authority.json');
            await expect(resolveSigner(undefined, kp.path, AUTHORITY, '--mint-authority')).rejects.toThrow(
                `--mint-authority ${AUTHORITY} does not match the --keypair signer ${kp.address}`,
            );
        });

        it('fails when there is no keypair to sign with', async () => {
            await expect(resolveSigner(undefined, missingKeypair)).rejects.toThrow(/Failed to load keypair/);
        });
    });

    describe('resolveSigners', () => {
        it('builds raw-mode authority and fee payer from addresses alone (HOO-962 bug 3)', async () => {
            const { authority, feePayer } = await resolveSigners({
                rawTx: 'b64',
                keypair: missingKeypair,
                authority: AUTHORITY,
                feePayer: FEE_PAYER,
            });
            expect(authority.address).toBe(AUTHORITY);
            expect(feePayer.address).toBe(FEE_PAYER);
            await expectNoopSigner(authority);
            await expectNoopSigner(feePayer);
        });

        it('defaults the raw-mode fee payer to the authority signer itself', async () => {
            const { authority, feePayer } = await resolveSigners({ rawTx: 'b64', authority: AUTHORITY });
            expect(feePayer).toBe(authority);
        });

        it('reuses the authority signer when --fee-payer names the same address', async () => {
            const { authority, feePayer } = await resolveSigners({
                rawTx: 'b64',
                authority: AUTHORITY,
                feePayer: AUTHORITY,
            });
            expect(feePayer).toBe(authority);
        });

        it('takes a command-level authority over the global --authority', async () => {
            const { authority } = await resolveSigners(
                { rawTx: 'b64', authority: AUTHORITY },
                FEE_PAYER,
                '--mint-authority',
            );
            expect(authority.address).toBe(FEE_PAYER);
        });

        it('signs both roles with the keypair without --raw-tx', async () => {
            const kp = await writeKeypair(dir, 'authority.json');
            const { authority, feePayer } = await resolveSigners({ keypair: kp.path });
            expect(isKeyPairSigner(authority)).toBe(true);
            expect(authority.address).toBe(kp.address);
            expect(feePayer).toBe(authority);
        });

        it('rejects a --fee-payer the keypair cannot sign for without --raw-tx', async () => {
            const kp = await writeKeypair(dir, 'authority.json');
            await expect(resolveSigners({ keypair: kp.path, feePayer: FEE_PAYER })).rejects.toThrow(
                `--fee-payer ${FEE_PAYER} does not match the --keypair signer ${kp.address}`,
            );
        });
    });
});
