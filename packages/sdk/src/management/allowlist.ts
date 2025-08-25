import {
  type Address,
  createNoopSigner,
  createTransaction,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from 'gill';
import {
  getMintDetails,
  isDefaultAccountStateSetFrozen,
  resolveTokenAccount,
} from '../transactionUtil';
import {
  ABL_PROGRAM_ID,
  getAddWalletInstructions,
  getList,
  getListConfigPda,
  getRemoveWalletInstructions,
} from '../abl';
import { findListConfigPda, Mode } from '@mosaic/abl';
import { getFreezeInstructions } from '../token-acl/freeze';
import { getThawPermissionlessInstructions } from '../token-acl/thawPermissionless';
import { TOKEN_ACL_PROGRAM_ID } from '../token-acl';
import {
  getFreezeAccountInstruction,
  getThawAccountInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs';

export const isAblAllowlist = async (
  rpc: Rpc<SolanaRpcApi>,
  listConfig: Address
) => {
  const list = await getList({ rpc, listConfig });
  return list.mode === Mode.Allow;
};

export const getAddToAllowlistInstructions = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  authority: Address | TransactionSigner<string>
): Promise<Instruction[]> => {
  const { tokenAccount, isInitialized, isFrozen } = await resolveTokenAccount(
    rpc,
    account,
    mint
  );
  const accountSigner =
    typeof authority === 'string' ? createNoopSigner(authority) : authority;
  const { freezeAuthority, extensions } = await getMintDetails(rpc, mint);
  const enableSrfc37 =
    freezeAuthority === TOKEN_ACL_PROGRAM_ID &&
    isDefaultAccountStateSetFrozen(extensions);

  if (!enableSrfc37) {
    return [
      getThawAccountInstruction(
        {
          account: tokenAccount,
          mint,
          owner: accountSigner,
        },
        {
          programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        }
      ),
    ];
  }

  const listConfigPda = await getListConfigPda({
    authority: accountSigner.address,
    mint,
  });
  if (!(await isAblAllowlist(rpc, listConfigPda))) {
    throw new Error('This is not an ABL allowlist');
  }
  const addToAllowlistInstructions = await getAddWalletInstructions({
    authority: accountSigner,
    wallet: account,
    list: listConfigPda,
  });
  const thawInstructions =
    isFrozen && isInitialized
      ? await getThawPermissionlessInstructions({
          authority: accountSigner,
          mint,
          tokenAccount,
          tokenAccountOwner: account,
          rpc,
        })
      : [];
  return [...addToAllowlistInstructions, ...thawInstructions];
};

export const createAddToAllowlistTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  authority: Address | TransactionSigner<string>
) => {
  const instructions = await getAddToAllowlistInstructions(
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

export const getRemoveFromAllowlistInstructions = async (
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

  const { freezeAuthority, extensions } = await getMintDetails(rpc, mint);
  const enableSrfc37 =
    freezeAuthority === TOKEN_ACL_PROGRAM_ID &&
    isDefaultAccountStateSetFrozen(extensions);

  if (!enableSrfc37) {
    return [
      getFreezeAccountInstruction(
        {
          account: destinationAta,
          mint,
          owner: accountSigner,
        },
        {
          programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        }
      ),
    ];
  }

  const listConfigPda = await findListConfigPda(
    {
      authority: accountSigner.address,
      seed: mint,
    },
    { programAddress: ABL_PROGRAM_ID }
  );
  if (!(await isAblAllowlist(rpc, listConfigPda[0]))) {
    throw new Error('This is not an ABL allowlist');
  }
  const instructions = [];
  const removeFromAllowlistInstructions = await getRemoveWalletInstructions({
    authority: accountSigner,
    wallet: account,
    list: listConfigPda[0],
  });
  instructions.push(...removeFromAllowlistInstructions);

  const useSrfc37 = enableSrfc37 ?? false;
  if (isInitialized && isFrozen && useSrfc37) {
    // TODO: this should freeze all accounts owned by the wallet
    const freezeInstructions = await getFreezeInstructions({
      rpc,
      authority: accountSigner,
      tokenAccount: destinationAta,
    });
    instructions.push(...freezeInstructions);
  }
  return instructions;
};

export const createRemoveFromAllowlistTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  authority: Address | TransactionSigner<string>
) => {
  const instructions = await getRemoveFromAllowlistInstructions(
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
