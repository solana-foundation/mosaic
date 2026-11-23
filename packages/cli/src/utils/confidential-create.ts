import type { Command } from 'commander';
import { type Address, isAddress } from '@solana/kit';
import type {
    ConfidentialApprovePolicy,
    ConfidentialBalancesConfig,
    ConfidentialMintBurnOptions,
} from '@solana/mosaic-sdk';
import { loadKeypair } from './solana.js';

/** The confidential flags `create stablecoin` and `create tokenized-security` share. */
export interface ConfidentialCreateFlags {
    confidentialPolicy?: string;
    auditorElgamalPubkey?: string;
    confidentialMintBurn?: boolean;
    supplyKeypair?: string;
}

export function addConfidentialCreateOptions(command: Command): Command {
    return command
        .option(
            '--confidential-policy <opt-in|whitelist>',
            'Confidential balances policy: whitelist (the authority approves each account) or opt-in (defaults to whitelist)',
        )
        .option(
            '--auditor-elgamal-pubkey <address>',
            'Auditor ElGamal public key that can decrypt every confidential transfer amount',
        )
        .option(
            '--confidential-mint-burn',
            'Add the ConfidentialMintBurn extension: the supply only ever exists encrypted, and plaintext mint, burn, deposit and withdraw stop working. Needs --supply-keypair.',
        )
        .option(
            '--supply-keypair <path>',
            'Keypair of the supply authority whose keys encrypt the supply (with --confidential-mint-burn). Use a dedicated wallet.',
        );
}

export function parseConfidentialPolicy(value: string | undefined): ConfidentialApprovePolicy | undefined {
    if (value === undefined) return undefined;
    if (value === 'opt-in' || value === 'whitelist') return value;
    throw new Error(`--confidential-policy must be 'opt-in' or 'whitelist', got ${value}`);
}

/** The policy and auditor half, as the templates' `confidentialBalances` config. */
export function getConfidentialBalancesConfig(flags: ConfidentialCreateFlags): ConfidentialBalancesConfig | undefined {
    const policy = parseConfidentialPolicy(flags.confidentialPolicy);
    let auditorElgamalPubkey: Address | undefined;
    if (flags.auditorElgamalPubkey !== undefined) {
        if (!isAddress(flags.auditorElgamalPubkey)) {
            throw new Error(`--auditor-elgamal-pubkey is not a valid address: ${flags.auditorElgamalPubkey}`);
        }
        auditorElgamalPubkey = flags.auditorElgamalPubkey;
    }
    if (policy === undefined && auditorElgamalPubkey === undefined) return undefined;
    return { policy, auditorElgamalPubkey };
}

/** The extension lines `create` prints for the confidential half of a mint. */
export function describeConfidentialExtensions(
    balances: ConfidentialBalancesConfig | undefined,
    mintBurn: ConfidentialMintBurnOptions | undefined,
): string[] {
    const auditor = balances?.auditorElgamalPubkey ? `, auditor ${balances.auditorElgamalPubkey}` : '';
    const lines = [`Confidential Balances (${balances?.policy ?? 'whitelist'} policy${auditor})`];
    if (mintBurn) lines.push(`Confidential Mint/Burn (supply ElGamal pubkey ${mintBurn.supplyElgamalPubkey})`);
    return lines;
}

/**
 * Derives the ConfidentialMintBurn init values from `--supply-keypair`. The supply authority is
 * fixed at creation and its keys are derived from its wallet, so it is required explicitly rather
 * than defaulting to `--keypair`: a wallet that also holds confidential balances would protect them
 * and this mint's supply with the very same key. It only provides keys, never a signature, so this
 * works under `--raw-tx` too.
 */
export async function getConfidentialMintBurnInitFromFlags(
    flags: ConfidentialCreateFlags,
): Promise<ConfidentialMintBurnOptions | undefined> {
    if (!flags.confidentialMintBurn) {
        if (flags.supplyKeypair) throw new Error('--supply-keypair only applies with --confidential-mint-burn');
        return undefined;
    }
    if (!flags.supplyKeypair) {
        throw new Error(
            '--confidential-mint-burn needs --supply-keypair: the supply is encrypted under keys derived from that wallet. Use a dedicated wallet.',
        );
    }
    const supplyAuthority = await loadKeypair(flags.supplyKeypair);
    // Lazy import: keeps the @solana/zk-sdk WASM out of plain create runs.
    const { deriveConfidentialKeys, freeConfidentialKeys, getConfidentialMintBurnInit } =
        await import('@solana/mosaic-sdk/confidential');
    const keys = await deriveConfidentialKeys({ signer: supplyAuthority });
    try {
        return getConfidentialMintBurnInit(keys);
    } finally {
        freeConfidentialKeys(keys);
    }
}
