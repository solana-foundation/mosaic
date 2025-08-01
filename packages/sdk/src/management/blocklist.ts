import {
  type Address,
  createNoopSigner,
  createTransaction,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from 'gill';
import { resolveTokenAccount } from '../transactionUtil';
import {
  ABL_PROGRAM_ID,
  getAddWalletInstructions,
  getList,
  getRemoveWalletInstructions,
} from '../abl';
import { findListConfigPda, Mode } from '@mosaic/abl';
import { getFreezeInstructions } from '../ebalts/freeze';
import { getThawPermissionlessInstructions } from '../ebalts/thawPermissionless';

export const isAblBlocklist = async (
  rpc: Rpc<SolanaRpcApi>,
  listConfig: Address
) => {
  const list = await getList({ rpc, listConfig });
  return list.mode === Mode.Block;
};

export const getAddToBlocklistInstructions = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  authority: Address | TransactionSigner<string>
): Promise<Instruction[]> => {
  const { tokenAccount, isFrozen } = await resolveTokenAccount(
    rpc,
    account,
    mint
  );
  const accountSigner =
    typeof authority === 'string' ? createNoopSigner(authority) : authority;
  const listConfigPda = await findListConfigPda(
    {
      authority: accountSigner.address,
      seed: mint,
    },
    { programAddress: ABL_PROGRAM_ID }
  );
  if (!(await isAblBlocklist(rpc, listConfigPda[0]))) {
    throw new Error('This is not an ABL blocklist');
  }
  const addToBlocklistInstructions = await getAddWalletInstructions({
    authority: accountSigner,
    wallet: account,
    list: listConfigPda[0],
  });
  const freezeInstructions = !isFrozen
    ? await getFreezeInstructions({
        rpc,
        authority: accountSigner,
        tokenAccount,
      })
    : [];
  return [...addToBlocklistInstructions, ...freezeInstructions];
};

export const createAddToBlocklistTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  authority: Address | TransactionSigner<string>
) => {
  const instructions = await getAddToBlocklistInstructions(
    rpc,
    mint,
    account,
    authority
  );
  const authoritySigner =
    typeof authority === 'string' ? createNoopSigner(authority) : authority;
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  return createTransaction({
    feePayer: authoritySigner,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
};

export const getRemoveFromBlocklistInstructions = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  authority: Address | TransactionSigner<string>
): Promise<Instruction[]> => {
  const {
    tokenAccount: destinationAta,
    isInitialized,
    isFrozen,
  } = await resolveTokenAccount(rpc, account, mint);
  const accountSigner =
    typeof authority === 'string' ? createNoopSigner(authority) : authority;

  const listConfigPda = await findListConfigPda(
    {
      authority: accountSigner.address,
      seed: mint,
    },
    { programAddress: ABL_PROGRAM_ID }
  );
  if (!(await isAblBlocklist(rpc, listConfigPda[0]))) {
    throw new Error('This is not an ABL blocklist');
  }
  const instructions = [];
  const removeFromBlocklistInstructions = await getRemoveWalletInstructions({
    authority: accountSigner,
    wallet: account,
    list: listConfigPda[0],
  });
  instructions.push(...removeFromBlocklistInstructions);

  if (isInitialized && isFrozen) {
    // TODO: this should unfreeze all accounts owned by the wallet
    const thawInstructions = await getThawPermissionlessInstructions({
      authority: accountSigner,
      mint,
      tokenAccount: destinationAta,
      tokenAccountOwner: account,
      rpc,
    });
    instructions.push(...thawInstructions);
  }
  return instructions;
};

export const createRemoveFromBlocklistTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  authority: Address | TransactionSigner<string>
) => {
  const instructions = await getRemoveFromBlocklistInstructions(
    rpc,
    mint,
    account,
    authority
  );
  const authoritySigner =
    typeof authority === 'string' ? createNoopSigner(authority) : authority;
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  return createTransaction({
    feePayer: authoritySigner,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
};
