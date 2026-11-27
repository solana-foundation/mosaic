// Option parsing and signer loading for the confidential commands. Kept free of chalk and ora
// (ESM-only, which the CLI's CommonJS jest can't load) so it can be unit tested, the same split as
// `utils/global-options.ts`. `common.ts` re-exports it.
import type { Command } from 'commander';
import type { Address, GetAccountInfoApi, KeyPairSigner, Rpc } from '@solana/kit';
import { fetchMaybeToken, findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { getGlobalOpts, type GlobalOptions } from '../../utils/global-options.js';
import type { TxVersion } from '../../utils/instruction-plan.js';
import { loadKeypair, resolveSigners } from '../../utils/solana.js';

/** The global options plus the per-subcommand `--tx-version`. */
export interface ConfidentialOpts extends GlobalOptions {
    txVersion: TxVersion;
}

/** Parses `--tx-version`. Commander hands parsers the raw string. */
export function parseTxVersion(value: string): TxVersion {
    if (value === '0') return 0;
    if (value === '1') return 1;
    throw new Error(`--tx-version must be 0 or 1, got ${value}`);
}

/**
 * Adds `--tx-version` to a subcommand that sends transactions. Version 1 (SIMD-0385) packs proof
 * setup, the action and cleanup into fewer, larger transactions, and needs an Agave 4.2.2+ RPC.
 */
export function addTxVersionOption(command: Command): Command {
    return command.option(
        '--tx-version <0|1>',
        'Transaction version: 0, or 1 for fewer, larger transactions (needs an Agave 4.2.2+ RPC)',
        parseTxVersion,
        0 as TxVersion,
    );
}

export function readGlobalOpts(command: Command): ConfidentialOpts {
    const { rpcUrl, keypair, authority, feePayer, rawTx } = getGlobalOpts(command) as GlobalOptions;
    const txVersion = (command.opts().txVersion as TxVersion | undefined) ?? 0;
    return { rpcUrl, keypair, authority, feePayer, rawTx, txVersion };
}

function refuseRawTx(opts: Pick<GlobalOptions, 'rawTx'>): void {
    if (opts.rawTx) {
        throw new Error(
            'This operation derives confidential keys from the signing keypair and cannot run in --raw-tx mode. Run it with a real keypair (omit --raw-tx).',
        );
    }
}

/**
 * Loads the `--keypair` signer for an operation that derives confidential keys from it, which
 * needs the secret key. Refuses `--raw-tx`, and, like every other command, an `--authority` or
 * `--fee-payer` that names a different address.
 */
export async function loadKeysSigner(opts: ConfidentialOpts): Promise<KeyPairSigner> {
    refuseRawTx(opts);
    const { authority } = await resolveSigners(opts);
    return authority as KeyPairSigner;
}

/**
 * Loads the supply authority's keypair, whose wallet keys encrypt a ConfidentialMintBurn mint's
 * supply: `--supply-keypair` when given, else the `--keypair` signer. The supply authority only
 * provides proof material, so it never signs and need not be the mint authority. That also means
 * it works under `--raw-tx`, where the mint authority signs elsewhere, as long as
 * `--supply-keypair` is explicit: in raw mode `--keypair` is not read for its secret key.
 */
export async function loadSupplyKeysSigner(opts: ConfidentialOpts, supplyKeypair?: string): Promise<KeyPairSigner> {
    if (opts.rawTx && !supplyKeypair) {
        throw new Error(
            'With --raw-tx, pass --supply-keypair: the supply keys are derived from that keypair, while the mint authority signs elsewhere.',
        );
    }
    return loadKeypair(supplyKeypair ?? opts.keypair);
}

/** The parts of a fetched (maybe missing) token account that the mint and owner checks read. */
export type InspectedAccount = { exists: false } | { exists: true; data: { mint: Address; owner: Address } };

/**
 * Throws when an existing token account belongs to another mint. A missing account passes: the
 * command creates it, or the program rejects it.
 */
export function assertAccountMint(account: InspectedAccount, tokenAccount: Address, mint: Address): void {
    if (account.exists && account.data.mint !== mint) {
        throw new Error(`Token account ${tokenAccount} belongs to mint ${account.data.mint}, not ${mint}.`);
    }
}

/**
 * Resolves the token account to operate on: the explicit `--token-account` when given, otherwise
 * the owner's associated token account (ATA) for the mint. An explicit account is fetched and
 * checked against `mint`, so a mixed-up address fails instead of changing another token's
 * account while the command reports `mint`.
 */
export async function resolveTokenAccount(
    rpc: Rpc<GetAccountInfoApi>,
    mint: Address,
    owner: Address,
    explicit?: string,
): Promise<Address> {
    if (explicit) {
        const tokenAccount = explicit as Address;
        assertAccountMint(await fetchMaybeToken(rpc, tokenAccount), tokenAccount, mint);
        return tokenAccount;
    }
    const [ata] = await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint });
    return ata;
}

/**
 * Whether `inspect-account` can decrypt an account with the signer's keys. Keys are derived from
 * the owner's wallet, so only the owner can, and the owner is read from the account itself: an
 * explicit `--token-account` can be the signer's own account too, ATA or not. Throws when the
 * account belongs to another mint, whose decimals would misformat every balance.
 */
export function canSignerDecrypt(
    account: InspectedAccount,
    tokenAccount: Address,
    mint: Address,
    signer: Address | undefined,
): boolean {
    if (!account.exists) return false;
    assertAccountMint(account, tokenAccount, mint);
    return signer !== undefined && account.data.owner === signer;
}

/** Parses a raw base-unit supply flag (`--supply`) into a u64 bigint. */
export function parseRawSupply(value: string): bigint {
    if (!/^\d+$/.test(value)) {
        throw new Error('--supply must be a non-negative integer in raw base units (e.g. 10000000)');
    }
    const supply = BigInt(value);
    if (supply > 0xffff_ffff_ffff_ffffn) {
        throw new Error('--supply does not fit in a u64');
    }
    return supply;
}
