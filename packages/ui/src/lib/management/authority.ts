// import {
//   createSolanaRpc,
//   type Address,
//   type Rpc,
//   type SolanaRpcApi,
//   signAndSendTransactionMessageWithSigners,
//   TransactionSendingSigner,
// } from 'gill';
// import { AuthorityType } from 'gill/programs/token';
// import { getUpdateAuthorityTransaction } from '@mosaic/sdk';
// import bs58 from 'bs58';

// export type AuthorityRole = AuthorityType | 'Metadata';

// export interface UpdateAuthorityOptions {
//   mint: string;
//   role: AuthorityRole;
//   newAuthority: string;
//   rpcUrl?: string;
// }

// export interface UpdateAuthorityResult {
//   success: boolean;
//   error?: string;
//   transactionSignature?: string;
//   authorityRole?: string;
//   prevAuthority?: string;
//   newAuthority?: string;
// }

// /**
//  * Validates authority update options
//  * @param options - Authority update configuration options
//  * @throws Error if validation fails
//  */
// function validateUpdateAuthorityOptions(options: UpdateAuthorityOptions): void {
//   if (!options.mint || !options.newAuthority) {
//     throw new Error('Mint address and new authority are required');
//   }

//   if (!options.role) {
//     throw new Error('Authority role is required');
//   }

//   // Basic address format validation (you might want more sophisticated validation)
//   if (options.mint.length < 32 || options.newAuthority.length < 32) {
//     throw new Error('Invalid address format');
//   }
// }

// /**
//  * Updates the authority for a given mint and role
//  * @param options - Configuration options for the authority update
//  * @param signer - Transaction sending signer instance
//  * @returns Promise that resolves to update result with signature and authority details
//  */
// export const updateTokenAuthority = async (
//   options: UpdateAuthorityOptions,
//   signer: TransactionSendingSigner
// ): Promise<UpdateAuthorityResult> => {
//   try {
//     validateUpdateAuthorityOptions(options);

//     // Get wallet public key
//     const walletPublicKey = signer.address;
//     if (!walletPublicKey) {
//       throw new Error('Wallet not connected');
//     }

//     const signerAddress = walletPublicKey.toString();

//     // Create RPC client
//     const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
//     const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

//     // Create authority update transaction using SDK
//     const transaction = await getUpdateAuthorityTransaction({
//       rpc,
//       payer: signer,
//       mint: options.mint as Address,
//       role: options.role,
//       currentAuthority: signer,
//       newAuthority: options.newAuthority as Address,
//     });

//     // Sign and send the transaction
//     const signature = await signAndSendTransactionMessageWithSigners(transaction);

//     return {
//       success: true,
//       transactionSignature: bs58.encode(signature),
//       authorityRole: options.role.toString(),
//       prevAuthority: signerAddress,
//       newAuthority: options.newAuthority,
//     };
//   } catch (error) {
//     return {
//       success: false,
//       error: error instanceof Error ? error.message : 'Unknown error occurred',
//     };
//   }
// };

// /**
//  * Simplified version for UI integration that handles the transaction conversion
//  * This version works with the existing UI structure
//  */
// export const updateTokenAuthorityForUI = async (
//   options: UpdateAuthorityOptions,
//   wallet: { publicKey: string; connected: boolean }
// ): Promise<UpdateAuthorityResult> => {
//   try {
//     validateUpdateAuthorityOptions(options);

//     if (!wallet.connected || !wallet.publicKey) {
//       throw new Error('Wallet not connected');
//     }

//     const signerAddress = wallet.publicKey;

//     // Create RPC client
//     const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
//     const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

//     // For UI version, we'll simulate the transaction creation
//     // In a real implementation, this would use the wallet to sign
//     // const transaction = await getUpdateAuthorityTransaction({
//     //   rpc,
//     //   payer: signerAddress as Address,
//     //   mint: options.mint as Address,
//     //   role: options.role,
//     //   currentAuthority: signerAddress as Address,
//     //   newAuthority: options.newAuthority as Address,
//     // });

//     // Simulate transaction signature for UI testing
//     const mockSignature = bs58.encode(new Uint8Array(64).fill(1));

//     return {
//       success: true,
//       transactionSignature: mockSignature,
//       authorityRole: options.role.toString(),
//       prevAuthority: signerAddress,
//       newAuthority: options.newAuthority,
//     };
//   } catch (error) {
//     return {
//       success: false,
//       error: error instanceof Error ? error.message : 'Unknown error occurred',
//     };
//   }
// };
