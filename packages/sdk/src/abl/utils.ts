import { findListConfigPda } from '@mosaic/abl';
import type { Address } from 'gill';

/**
 * The program ID for the ABL (Allowlist/Blocklist) program.
 *
 * This is the address of the ABL program that handles allowlist and blocklist
 * functionality for token gating and access control.
 */
export const ABL_PROGRAM_ID =
  '8hNxmWetsVptuZ5LGYC6fM4xTpoUfPijz3NyYctyM79N' as Address;

export const getListConfigPda = async (input: {
  authority: Address;
  mint: Address;
}): Promise<Address> => {
  const listConfigPda = await findListConfigPda(
    {
      authority: input.authority,
      seed: input.mint,
    },
    { programAddress: ABL_PROGRAM_ID }
  );
  return listConfigPda[0];
};
