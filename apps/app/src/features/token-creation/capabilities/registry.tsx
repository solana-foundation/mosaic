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
    | 'gatingProgram'
    | 'kycGating'
    | 'kytHook'
    | 'travelRule'
    | 'yieldAllocation'
    | 'crossBorderSettlement'
    | 'complianceFee';

export type ExtensionKey =
    | 'extMetadata'
    | 'extPausable'
    | 'extDefaultAccountStateAllowOrBlock'
    | 'extDefaultAccountStateAllow'
    | 'extDefaultAccountStateFrozen'
    | 'extPermanentDelegate'
    | 'extConfidentialBalances'
    | 'extScaledUIAmount'
    | 'extTransferHook'
    | 'extTransferFee';

export const capabilityNodes: Record<CapabilityKey, ReactNode> = {
    metadata: (
        <>
            <strong>Metadata</strong>: Onchain metadata with name, symbol, and URI. URI should point to a JSON file that
            follows the{' '}
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
            <strong>Configurable access controls</strong>: Allowlist (closed-loop) or blocklist (open-loop). Uses the{' '}
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
            <strong>Closed-loop (allowlist only)</strong>: Account creation and transfers restricted to an explicit
            allowlist using{' '}
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
            <strong>Pausable</strong>: Pause all interactions with the token in emergencies.
        </>
    ),
    permanentDelegate: (
        <>
            <strong>Permanent delegate</strong>: Authority to transfer or burn any token from any account. Useful for
            compliance and managed UX flows.
        </>
    ),
    confidentialBalances: (
        <>
            <strong>Confidential balances</strong>: Feature under audit enabling transfers with encrypted amounts.
            Balances are not revealed to anyone but the token owner and an optional auditor.
        </>
    ),
    confidentialMintBurn: (
        <>
            <strong>Confidential mint/burn</strong>: <em>(Coming soon)</em> Feature enabling mint/burn with encrypted
            amounts. Amounts are not revealed to anyone but the token owner and an optional auditor.
        </>
    ),
    scaledUIAmount: (
        <>
            <strong>Scaled UI Amount</strong>: Display UI-friendly scaled amounts for dividends, stock splits, and
            reverse stock splits while keeping on-chain units consistent for accounting.
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
            for allowlist/blocklist management with a gating program for account access. Enables permissionless
            thaw/freeze for seamless UX flows.
        </>
    ),
    gatingProgram: (
        <>
            <strong>Gating program</strong>: Enables the freeze authority to manage allowlist/blocklist. Can be replaced
            with a custom program for complex gating (e.g., jurisdictional KYC proofs).
        </>
    ),
    kycGating: (
        <>
            <strong>KYC Gating</strong>: Accounts start frozen (DefaultAccountState = Frozen). The compliance authority
            thaws each account after identity verification, ensuring only KYC-approved users can hold or transfer tokens.
        </>
    ),
    kytHook: (
        <>
            <strong>KYT Transfer Hook</strong>: Every token transfer invokes the KYT hook program via the{' '}
            <a
                href="https://www.solana-program.com/docs/token-2022/extensions#transfer-hook"
                target="_blank"
                rel="noopener noreferrer"
            >
                TransferHook
            </a>{' '}
            extension. The hook screens sender/receiver against sanctions lists and risk heuristics, blocking flagged
            transactions on-chain.
        </>
    ),
    travelRule: (
        <>
            <strong>Travel Rule (FATF R.16)</strong>: Transfers above the configured threshold attach originator and
            beneficiary VASP data as a structured JSON memo via SPL Memo. Enables FATF, FinCEN, and MAS compliance for
            cross-border institutional transfers.
        </>
    ),
    yieldAllocation: (
        <>
            <strong>Yield Allocation</strong>: Deposited funds are automatically routed across yield sources (Kamino,
            Drift, tokenized RWAs) according to configurable allocation rules (e.g., 60% yield / 30% reserve / 10%
            cross-border). Blended APY is maximized subject to risk tier constraints.
        </>
    ),
    crossBorderSettlement: (
        <>
            <strong>Cross-Border Settlement</strong>: The cross-border tranche enables instant token transfers across
            jurisdictions with FX rate conversion (Pyth / SIX Financial Data), ISO-20022 purpose codes, and SWIFT BIC
            tagging via SPL Memo.
        </>
    ),
    complianceFee: (
        <>
            <strong>Compliance Fee (TransferFee)</strong>: A small per-transfer fee (e.g., 5 bps) is automatically
            withheld and routed to the treasury reserve tranche, funding ongoing compliance operations without manual
            intervention.
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
        <a href="https://solana.com/docs/tokens/extensions/scaled-ui-amount" target="_blank" rel="noopener noreferrer">
            Scaled UI Amount
        </a>
    ),
    extDefaultAccountStateFrozen: (
        <a
            href="https://www.solana-program.com/docs/token-2022/extensions#default-account-state"
            target="_blank"
            rel="noopener noreferrer"
        >
            Default Account State (Frozen — KYC required)
        </a>
    ),
    extTransferHook: (
        <a
            href="https://www.solana-program.com/docs/token-2022/extensions#transfer-hook"
            target="_blank"
            rel="noopener noreferrer"
        >
            Transfer Hook (KYT)
        </a>
    ),
    extTransferFee: (
        <a
            href="https://www.solana-program.com/docs/token-2022/extensions#transfer-fee"
            target="_blank"
            rel="noopener noreferrer"
        >
            Transfer Fee (compliance reserve)
        </a>
    ),
};
