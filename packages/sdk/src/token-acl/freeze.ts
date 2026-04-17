import {
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    type Address,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import { findMintConfigPda, getFreezeInstruction } from '@token-acl/sdk';
import {
    getCreateAssociatedTokenIdempotentInstruction,
    getFreezeAccountInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { TOKEN_ACL_PROGRAM_ID } from './utils';
import { getMintDetails, isDefaultAccountStateSetFrozen, resolveTokenAccount } from '../transaction-util';

type MintFreezeDetails = Awaited<ReturnType<typeof getMintDetails>>;

const getFreezeInstructionForMint = async (input: {
    authority: TransactionSigner<string>;
    mint: Address;
    tokenAccount: Address;
    mintDetails: MintFreezeDetails;
}): Promise<Instruction<string>> => {
    const { freezeAuthority, programAddress } = input.mintDetails;

    // Check if freeze authority is the Token ACL program
    if (freezeAuthority === TOKEN_ACL_PROGRAM_ID) {
        // Use Token ACL instruction
        const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: TOKEN_ACL_PROGRAM_ID });

        return getFreezeInstruction(
            {
                authority: input.authority,
                mintConfig: mintConfigPda[0],
                mint: input.mint,
                tokenAccount: input.tokenAccount,
            },
            { programAddress: TOKEN_ACL_PROGRAM_ID },
        );
    }

    // Use standard SPL Token-2022 freeze instruction
    return getFreezeAccountInstruction(
        {
            account: input.tokenAccount,
            mint: input.mint,
            owner: input.authority,
        },
        {
            programAddress: programAddress as typeof TOKEN_2022_PROGRAM_ADDRESS,
        },
    );
};

/**
 * Generates instructions for freezing a token account.
 *
 * This function creates instructions to freeze a token account. It automatically
 * detects whether the token uses Token ACL or standard SPL Token-2022 freeze authority
 * and uses the appropriate instruction.
 *
 * @param input - Configuration parameters for freezing a token account
 * @param input.authority - The authority signer who can freeze the token account
 * @param input.tokenAccount - The token account address to freeze
 * @returns Promise containing the instructions for freezing a token account
 */
export const getFreezeInstructions = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    authority: TransactionSigner<string>;
    tokenAccount: Address;
}): Promise<Instruction<string>[]> => {
    const { value: accountInfo } = await input.rpc
        .getAccountInfo(input.tokenAccount, { encoding: 'jsonParsed' })
        .send();
    if (!accountInfo) {
        throw new Error('Token account not found');
    }

    // Use jsonParsed data which works for both regular SPL and Token-2022 accounts
    if (!('parsed' in accountInfo.data) || !accountInfo.data.parsed?.info) {
        throw new Error('Failed to parse token account data');
    }

    const tokenInfo = accountInfo.data.parsed.info as {
        mint: Address;
        owner: Address;
        tokenAmount: { amount: string };
        state: string;
    };

    const token = {
        mint: tokenInfo.mint,
        owner: tokenInfo.owner,
        amount: BigInt(tokenInfo.tokenAmount.amount),
        state: tokenInfo.state,
    };

    const mintDetails = await getMintDetails(input.rpc, token.mint);

    return [
        await getFreezeInstructionForMint({
            authority: input.authority,
            mint: token.mint,
            tokenAccount: input.tokenAccount,
            mintDetails,
        }),
    ];
};

/**
 * Generates instructions for freezing the associated token account for a wallet and mint.
 *
 * This helper is safe to use when the wallet does not have an ATA yet. It will create
 * the ATA idempotently before freezing it, unless the mint's default account state
 * already creates new accounts frozen through Token ACL/SRFC-37.
 *
 * @param input - Configuration parameters for freezing a wallet's ATA
 * @param input.payer - The fee payer signer used when the ATA must be created
 * @param input.authority - The authority signer who can freeze the token account
 * @param input.wallet - The wallet address that owns the associated token account
 * @param input.mint - The mint address for the associated token account
 * @returns Promise containing the instructions for freezing the wallet's ATA
 */
export const getFreezeWalletInstructions = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    wallet: Address;
    mint: Address;
}): Promise<Instruction[]> => {
    const { tokenAccount, isInitialized } = await resolveTokenAccount(input.rpc, input.wallet, input.mint);
    const mintDetails = await getMintDetails(input.rpc, input.mint);
    const usesTokenAcl = mintDetails.usesTokenAcl === true || mintDetails.freezeAuthority === TOKEN_ACL_PROGRAM_ID;
    const enableSrfc37 = usesTokenAcl && isDefaultAccountStateSetFrozen(mintDetails.extensions ?? []);
    const instructions: Instruction[] = [];

    if (!isInitialized) {
        instructions.push(
            getCreateAssociatedTokenIdempotentInstruction({
                owner: input.wallet,
                mint: input.mint,
                ata: tokenAccount,
                payer: input.payer,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            }),
        );

        if (enableSrfc37) {
            return instructions;
        }
    }

    instructions.push(
        await getFreezeInstructionForMint({
            authority: input.authority,
            mint: input.mint,
            tokenAccount,
            mintDetails,
        }),
    );

    return instructions;
};

/**
 * Creates a complete transaction for freezing a token account.
 *
 * This function builds a full transaction that can be signed and sent to freeze a token account.
 * The transaction includes the necessary instructions and uses the latest blockhash for proper construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who can freeze the token account
 * @param input.mint - The mint address of the token account
 * @param input.tokenAccount - The token account address to freeze
 * @returns Promise containing the full transaction for freezing a token account
 */
export const getFreezeTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    tokenAccount: Address;
}): Promise<FullTransaction> => {
    const instructions = await getFreezeInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(input.payer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

/**
 * Creates a complete transaction for freezing the associated token account for a wallet and mint.
 *
 * This function builds a full transaction that can be signed and sent even if the
 * wallet's associated token account does not exist yet.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who can freeze the token account
 * @param input.wallet - The wallet address that owns the associated token account
 * @param input.mint - The mint address for the associated token account
 * @returns Promise containing the full transaction for freezing a wallet's ATA
 */
export const getFreezeWalletTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    wallet: Address;
    mint: Address;
}): Promise<FullTransaction> => {
    const instructions = await getFreezeWalletInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(input.payer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};
