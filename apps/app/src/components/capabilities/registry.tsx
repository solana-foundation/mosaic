import { ReactNode } from 'react';

export type CapabilityKey =
  | 'metadata'
  | 'accessControls'
  | 'closedLoopAllowlistOnly'
  | 'pausable'
  | 'permanentDelegate'
  | 'confidentialBalances'
  | 'confidentialMintBurn'
  | 'scaledUIAmount'
  | 'sRFC37'
  | 'gatingProgram';

export type ExtensionKey =
  | 'extMetadata'
  | 'extPausable'
  | 'extDefaultAccountStateAllowOrBlock'
  | 'extDefaultAccountStateAllow'
  | 'extPermanentDelegate'
  | 'extConfidentialBalances'
  | 'extScaledUIAmount';

export const capabilityNodes: Record<CapabilityKey, ReactNode> = {
  metadata: (
    <>
      <strong>Metadata</strong>: Onchain metadata with name, symbol, and URI.
      URI should point to a JSON file that follows the{' '}
      <a
        href="https://developers.metaplex.com/token-metadata/token-standard"
        target="_blank"
        rel="noopener noreferrer"
      >
        Metaplex Metadata Standard
      </a>{' '}
      spec.
    </>
  ),
  accessControls: (
    <>
      <strong>Configurable access controls</strong>: Allowlist (closed-loop) or
      blocklist (open-loop). Uses the{' '}
      <a
        href="https://forum.solana.com/t/srfc-37-efficient-block-allow-list-token-standard/4036"
        target="_blank"
        rel="noopener noreferrer"
      >
        sRFC-37
      </a>{' '}
      standard for list management.
    </>
  ),
  closedLoopAllowlistOnly: (
    <>
      <strong>Closed-loop (allowlist only)</strong>: Account creation and
      transfers restricted to an explicit allowlist using{' '}
      <a
        href="https://forum.solana.com/t/srfc-37-efficient-block-allow-list-token-standard/4036"
        target="_blank"
        rel="noopener noreferrer"
      >
        sRFC-37
      </a>
      .
    </>
  ),
  pausable: (
    <>
      <strong>Pausable</strong>: Pause all interactions with the token in
      emergencies.
    </>
  ),
  permanentDelegate: (
    <>
      <strong>Permanent delegate</strong>: Authority to transfer or burn any
      token from any account. Useful for compliance and managed UX flows.
    </>
  ),
  confidentialBalances: (
    <>
      <strong>Confidential balances</strong>: Feature under audit enabling
      transfers with encrypted amounts. Balances are not revealed to anyone but
      the token owner and an optional auditor.
    </>
  ),
  confidentialMintBurn: (
    <>
      <strong>Confidential mint/burn</strong>: Feature under audit enabling
      mint/burn with encrypted amounts. Amounts are not revealed to anyone but
      the token owner and an optional auditor.
    </>
  ),
  scaledUIAmount: (
    <>
      <strong>Scaled UI Amount</strong>: Display UI-friendly scaled amounts for
      dividends, stock splits, and reverse stock splits while keeping on-chain
      units consistent for accounting.
    </>
  ),
  sRFC37: (
    <>
      <strong>sRFC-37</strong>:{' '}
      <a
        href="https://forum.solana.com/t/srfc-37-efficient-block-allow-list-token-standard/4036"
        target="_blank"
        rel="noopener noreferrer"
      >
        Standard
      </a>{' '}
      for allowlist/blocklist management with a gating program for account
      access. Enables permissionless thaw/freeze for seamless UX flows.
    </>
  ),
  gatingProgram: (
    <>
      <strong>Gating program</strong>: Enables the freeze authority to manage
      allowlist/blocklist. Can be replaced with a custom program for complex
      gating (e.g., jurisdictional KYC proofs).
    </>
  ),
};

export const extensionNodes: Record<ExtensionKey, ReactNode> = {
  extMetadata: (
    <a
      href="https://www.solana-program.com/docs/token-2022/extensions#metadata"
      target="_blank"
      rel="noopener noreferrer"
    >
      Metadata
    </a>
  ),
  extPausable: (
    <a
      href="https://www.solana-program.com/docs/token-2022/extensions#pausable"
      target="_blank"
      rel="noopener noreferrer"
    >
      Pausable
    </a>
  ),
  extDefaultAccountStateAllowOrBlock: (
    <a
      href="https://www.solana-program.com/docs/token-2022/extensions#default-account-state"
      target="_blank"
      rel="noopener noreferrer"
    >
      Default Account State (allowlist/blocklist)
    </a>
  ),
  extDefaultAccountStateAllow: (
    <a
      href="https://www.solana-program.com/docs/token-2022/extensions#default-account-state"
      target="_blank"
      rel="noopener noreferrer"
    >
      Default Account State (allowlist)
    </a>
  ),
  extPermanentDelegate: (
    <a
      href="https://www.solana-program.com/docs/token-2022/extensions#permanent-delegate"
      target="_blank"
      rel="noopener noreferrer"
    >
      Permanent Delegate
    </a>
  ),
  extConfidentialBalances: (
    <a
      href="https://solana.com/docs/tokens/extensions/confidential-transfer"
      target="_blank"
      rel="noopener noreferrer"
    >
      Confidential Balances
    </a>
  ),
  extScaledUIAmount: (
    <a
      href="https://solana.com/docs/tokens/extensions/scaled-ui-amount"
      target="_blank"
      rel="noopener noreferrer"
    >
      Scaled UI Amount
    </a>
  ),
};
