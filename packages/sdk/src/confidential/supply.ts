import {
    type Address,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    singleInstructionPlan,
} from '@solana/kit';
import { fetchMint } from '@solana-program/token-2022';
import { getUpdateConfidentialMintBurnDecryptableSupplyInstructionFromSupply } from '@solana-program/token-2022/confidential';
import { getConfidentialMintBurnSupplyElgamalPubkey, isConfidentialMintBurn } from './extensions.js';
import { assertConfidentialKeysMatchSupply, type ConfidentialKeys } from './keys.js';
import { toAuthoritySigner } from './util.js';

/**
 * Management for a `ConfidentialMintBurn` mint's supply-side state.
 *
 * The confidential supply is maintained on-chain both as an ElGamal ciphertext
 * (updated homomorphically by mint/burn) and as a cheap-to-decrypt AES
 * "decryptable supply". The two can drift — e.g. after burns whose pending-burn
 * has been applied — so the mint authority can re-assert the decryptable supply
 * to match the true supply, re-encrypting it under the supply authority's AES key.
 *
 * Note: rotating the supply ElGamal keypair
 * (`RotateSupplyElgamalPubkey`) additionally requires a supply-re-encryption
 * equality proof and is intentionally not built here yet (follow-up).
 */

/** Shared shape of the supply re-assertion, minus the RPC-derived checks. */
type UpdateDecryptableSupplyArgs = {
    mint: Address;
    authority: Address | TransactionSigner;
    supplyKeys: ConfidentialKeys;
    rawSupply: bigint;
};

/**
 * Validates the mint and the supply keys against on-chain state. Shared by both
 * exported builders so the guard cannot be bypassed by going through
 * {@link createApplyConfidentialPendingBurnInstructionPlan}'s `resyncSupply`.
 */
async function assertSupplyKeysForMint(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    supplyKeys?: ConfidentialKeys,
): Promise<void> {
    const mintDecoded = await fetchMint(rpc, mint);
    if (!isConfidentialMintBurn(mintDecoded)) {
        throw new Error(
            `Mint ${mint} is not configured for confidential mint/burn ` +
                `(missing the ConfidentialMintBurn extension).`,
        );
    }
    if (supplyKeys === undefined) {
        return;
    }
    // The program re-encrypts whatever AES key it is handed, so a wrong-wallet
    // key here succeeds on-chain and only surfaces later, as an opaque equality
    // proof rejection on the next confidential mint. Catch it now.
    const registeredSupplyPubkey = getConfidentialMintBurnSupplyElgamalPubkey(mintDecoded);
    if (registeredSupplyPubkey !== null) {
        assertConfidentialKeysMatchSupply(supplyKeys, registeredSupplyPubkey, mint);
    }
}

/** Builds the instruction once the caller-supplied values have been validated. */
function buildUpdateDecryptableSupplyPlan(args: UpdateDecryptableSupplyArgs): InstructionPlan {
    // Supply is a u64 on-chain. Upstream asserts this too, but checking here names
    // the offending parameter and its unit, and keeps the failure out of WASM.
    if (args.rawSupply < 0n || args.rawSupply > 0xffff_ffff_ffff_ffffn) {
        throw new Error(`rawSupply must be a u64 (0..2^64-1), got ${args.rawSupply}.`);
    }
    return singleInstructionPlan(
        getUpdateConfidentialMintBurnDecryptableSupplyInstructionFromSupply({
            mint: args.mint,
            authority: toAuthoritySigner(args.authority),
            supplyAesKey: args.supplyKeys.aes,
            supply: args.rawSupply,
        }),
    );
}

/**
 * Re-encrypts and updates the mint's **decryptable supply** to `rawSupply` under
 * the supply AES key. Signed by the mint authority. No proof required — returns
 * a `singleInstructionPlan`.
 *
 * ⚠️ **Required after every `ApplyPendingBurn`.** That instruction advances the
 * ElGamal `confidentialSupply` but cannot re-encrypt the AES form, and a
 * confidential mint's equality proof is built from the AES form and checked
 * against the ElGamal one — so until this runs, the next
 * {@link createConfidentialMintInstructionPlan} is **rejected on-chain**. Rather
 * than sequencing this call yourself, prefer passing `resyncSupply` to
 * `createApplyConfidentialPendingBurnInstructionPlan` (`./burn`), which returns
 * both steps as one ordered plan.
 *
 * Reads the mint to fail fast when it is not `ConfidentialMintBurn` configured,
 * and to check `supplyKeys` against the mint's **registered supply pubkey** —
 * passing an account holder's keys here (rather than the supply authority's)
 * would otherwise succeed on-chain and break every subsequent confidential mint.
 *
 * The *value* written is still asserted, not verified: the program re-encrypts
 * whatever it is given. Passing a value that does not match the supply the
 * ElGamal ciphertext actually encodes leaves the mint in the same broken state
 * this instruction exists to repair, so the caller must track the true supply
 * (mint amounts added, applied burn amounts subtracted).
 *
 * Delegates the AES re-encryption + instruction building to the official
 * `getUpdateConfidentialMintBurnDecryptableSupplyInstructionFromSupply`.
 */
export async function createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** The mint authority — the on-chain signer. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /**
     * The mint's supply keys, from the **supply authority** wallet (the AES key
     * encrypts the decryptable supply). Not a signer, so it need not be the same
     * wallet as `authority`. Checked against the mint's registered supply pubkey.
     */
    supplyKeys: ConfidentialKeys;
    /**
     * The true current total supply, in **raw** base units — not decimal-scaled.
     * Unlike the `amount` parameters on mint/burn, this accepts no decimal string
     * form, so a UI amount must be scaled by the mint's decimals first.
     */
    rawSupply: bigint;
}): Promise<InstructionPlan> {
    await assertSupplyKeysForMint(input.rpc, input.mint, input.supplyKeys);
    return buildUpdateDecryptableSupplyPlan(input);
}

/**
 * @internal — `./burn` calls these directly so its `resyncSupply` path runs the
 * same guard once, before building either half of the plan. Not re-exported
 * from `./index.js`, so they are not public API.
 */
export { assertSupplyKeysForMint as assertConfidentialSupplyKeysForMint, buildUpdateDecryptableSupplyPlan };
