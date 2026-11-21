// Chain checks and fixtures for the confidential-transfer flows: everything in
// chain.mjs, plus the commands below.
//
// It signs with the same keypairs the test-wallet bundles embed, so it derives
// the *same* confidential keys as the browser did. Matching the ElGamal key the
// browser registered, and decrypting what the browser wrote, is the interop
// check HOO-1423 names: if the app ever prefixed or hashed the derivation
// message, these would fail.
//
// Usage: node e2e/agent-browser/chain-confidential.mjs <command> [options]   (prints JSON)
//
//   state    --role a|b --mint M                   the role's token account (as `token`), plus
//                                                  confidential state and balances decrypted in Node
//   contexts --role a|b                            live ZK proof-context accounts the role owns,
//                                                  i.e. rent a failed plan left behind
//   create-mint --role a --policy opt-in|whitelist [--decimals 6] [--supply 1000]
//               [--transfer-fee]                   a Confidential Balances mint (with Metadata),
//                                                  and --supply tokens minted to the role
//   disable-credits --role b --mint M              turn confidential credits off (HOO-1426 case 3)
//   (and every chain.mjs command: address, balance, token, create-ata, fund, new-address)
/* global console */
import { generateKeyPairSigner, getAddressDecoder, setTransactionMessageLifetimeUsingBlockhash } from '@solana/kit';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    getCreateAssociatedTokenIdempotentInstruction,
    getMintToInstruction,
} from '@solana-program/token-2022';
import { Token } from '@solana/mosaic-sdk';
import {
    createDisableConfidentialCreditsInstructionPlan,
    decryptConfidentialBalances,
    deriveConfidentialKeys,
    fetchConfidentialAccountState,
    freeConfidentialKeys,
    planConfidentialInstructions,
} from '@solana/mosaic-sdk/confidential';
import {
    ataFor,
    commands as baseCommands,
    die,
    rpc,
    runCli,
    send,
    sendMessage,
    signerFor,
    toAddress,
    tokenState,
    withBackoff,
} from './chain.mjs';

const ZK_ELGAMAL_PROOF_PROGRAM = toAddress('ZkE1Gama1Proof11111111111111111111111111111');

function elgamalAddress(keys) {
    const pubkey = keys.elgamal.pubkey();
    try {
        return getAddressDecoder().decode(pubkey.toBytes());
    } finally {
        pubkey.free?.();
    }
}

/** Runs an SDK instruction plan transaction by transaction, at version 0. */
async function runPlan(feePayer, instructionPlan) {
    const plan = await planConfidentialInstructions({ instructionPlan, feePayer, version: 0 });
    const signatures = [];
    const walk = async node => {
        if (node.kind === 'single') {
            const { value: blockhash } = await withBackoff(() => rpc.getLatestBlockhash().send());
            signatures.push(await sendMessage(setTransactionMessageLifetimeUsingBlockhash(blockhash, node.message)));
            return;
        }
        for (const child of node.plans) await walk(child);
    };
    await walk(plan);
    return signatures;
}

const confidentialCommands = {
    async state({ role, mint }) {
        if (!mint) die('state needs --mint');
        const signer = await signerFor(role);
        const result = await tokenState(role, mint);
        if (!result.exists) return result;

        const keys = await deriveConfidentialKeys({ signer });
        try {
            // Null when the account has no ConfidentialTransferAccount extension.
            const state = await withBackoff(() =>
                fetchConfidentialAccountState(rpc, result.tokenAccount, { commitment: 'confirmed' }),
            );
            result.configured = state !== null;
            if (!state) return result;
            result.approved = state.approved;
            result.allowConfidentialCredits = state.allowConfidentialCredits;
            result.pendingBalanceCreditCounter = state.pendingBalanceCreditCounter;
            result.maximumPendingBalanceCreditCounter = state.maximumPendingBalanceCreditCounter;
            // The browser configured this account with keys it derived from a wallet
            // signature. Node-derived keys matching that ElGamal key, and decrypting
            // the balances, is the browser/SDK/CLI interop check.
            result.keysMatchAccount = elgamalAddress(keys) === state.elgamalPubkey;
            if (result.keysMatchAccount) {
                result.decrypted = decryptConfidentialBalances(state, keys, { decryptPendingBalance: true });
            }
        } finally {
            freeConfidentialKeys(keys);
        }
        return result;
    },

    async contexts({ role }) {
        const signer = await signerFor(role);
        // A proof-context state account starts with its 32-byte authority.
        const accounts = await withBackoff(() =>
            rpc
                .getProgramAccounts(ZK_ELGAMAL_PROOF_PROGRAM, {
                    encoding: 'base64',
                    dataSlice: { offset: 0, length: 0 },
                    filters: [{ memcmp: { offset: 0n, bytes: signer.address, encoding: 'base58' } }],
                })
                .send(),
        );
        const rent = accounts.reduce((sum, a) => sum + Number(a.account.lamports), 0) / 1e9;
        return { count: accounts.length, rentSol: rent, accounts: accounts.map(a => a.pubkey) };
    },

    async 'create-mint'({ role, policy, decimals, supply, 'transfer-fee': transferFee }) {
        if (policy !== 'opt-in' && policy !== 'whitelist') die('create-mint needs --policy opt-in|whitelist');
        const payer = await signerFor(role);
        const mint = await generateKeyPairSigner();
        const digits = Number(decimals ?? 6);
        const tag = `E2E${Date.now().toString(36).slice(-4).toUpperCase()}`;

        let builder = new Token().withMetadata({
            mintAddress: mint.address,
            authority: payer.address,
            metadata: { name: `Mosaic E2E ${policy}`, symbol: tag, uri: '' },
            additionalMetadata: new Map(),
        });
        if (transferFee) {
            builder = builder.withTransferFee({
                authority: payer.address,
                withdrawAuthority: payer.address,
                feeBasisPoints: 100,
                maximumFee: 1_000_000n,
            });
        }
        builder = builder.withConfidentialBalances({ authority: payer.address, policy });
        if (transferFee) {
            // The withheld-fee ElGamal key is the role's own, derived like the browser does.
            const keys = await deriveConfidentialKeys({ signer: payer });
            const withdrawWithheldAuthorityElGamalPubkey = elgamalAddress(keys);
            freeConfidentialKeys(keys);
            builder = builder.withConfidentialTransferFee({
                authority: payer.address,
                withdrawWithheldAuthorityElGamalPubkey,
            });
        }

        const createTx = await builder.buildTransaction({
            rpc,
            decimals: digits,
            mintAuthority: payer,
            mint,
            feePayer: payer,
        });
        const signatures = [await sendMessage(createTx)];

        const amount = BigInt(supply ?? 1000) * 10n ** BigInt(digits);
        if (amount > 0n) {
            const ata = await ataFor(payer.address, mint.address);
            signatures.push(
                await send(payer, [
                    getCreateAssociatedTokenIdempotentInstruction({
                        payer,
                        owner: payer.address,
                        mint: mint.address,
                        ata,
                        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
                    }),
                    getMintToInstruction({ mint: mint.address, token: ata, mintAuthority: payer, amount }),
                ]),
            );
        }
        return { mint: mint.address, symbol: tag, policy, decimals: digits, transferFee: !!transferFee, signatures };
    },

    async 'disable-credits'({ role, mint }) {
        if (!mint) die('disable-credits needs --mint');
        const signer = await signerFor(role);
        const tokenAccount = await ataFor(signer.address, toAddress(mint));
        const signatures = await runPlan(
            signer,
            createDisableConfidentialCreditsInstructionPlan({ tokenAccount, authority: signer }),
        );
        return { tokenAccount, signatures };
    },
};

console.assert(!Object.keys(confidentialCommands).some(k => k in baseCommands), 'command name clash with chain.mjs');

await runCli(
    { ...baseCommands, ...confidentialCommands },
    {
        policy: { type: 'string' },
        decimals: { type: 'string' },
        supply: { type: 'string' },
        'transfer-fee': { type: 'boolean', default: false },
    },
);
