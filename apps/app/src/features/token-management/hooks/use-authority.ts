import { useMemo } from 'react';
import { useWalletConnection } from './use-transaction-modal';

export type AuthorityType =
    | 'mint'
    | 'freeze'
    | 'permanentDelegate'
    | 'pause'
    | 'metadata'
    | 'transferFee'
    | 'interestRate';

export interface TokenAuthorities {
    mintAuthority?: string;
    freezeAuthority?: string;
    permanentDelegate?: string;
    pauseAuthority?: string;
    metadataAuthority?: string;
    transferFeeAuthority?: string;
    interestRateAuthority?: string;
}

export interface AuthorityCheck {
    hasAuthority: boolean;
    walletAddress: string | null;
    authorityAddress: string | undefined;
}

export interface UseAuthorityResult {
    /** Connected wallet address */
    walletAddress: string | null;
    /** Whether wallet is connected */
    isConnected: boolean;
    /** Check if wallet has mint authority */
    hasMintAuthority: boolean;
    /** Check if wallet has freeze authority */
    hasFreezeAuthority: boolean;
    /** Check if wallet has permanent delegate (force burn/transfer) */
    hasPermanentDelegate: boolean;
    /** Check if wallet has pause authority */
    hasPauseAuthority: boolean;
    /** Check if wallet has metadata authority */
    hasMetadataAuthority: boolean;
    /** Check if wallet has transfer fee authority */
    hasTransferFeeAuthority: boolean;
    /** Check if wallet has interest rate authority */
    hasInterestRateAuthority: boolean;
    /** Check a specific authority type */
    checkAuthority: (type: AuthorityType) => AuthorityCheck;
    /** Get all authorities the wallet has */
    getWalletAuthorities: () => AuthorityType[];
}

/**
 * Hook to check what authorities the connected wallet has for a token.
 * Use this to prevent users from starting workflows they can't complete.
 *
 * @example
 * const { hasMintAuthority, hasPermanentDelegate } = useAuthority({
 *   mintAuthority: tokenInfo.mintAuthority,
 *   permanentDelegate: tokenInfo.permanentDelegate,
 * });
 *
 * if (!hasMintAuthority) {
 *   return <UnauthorizedView type="mint" />;
 * }
 */
export function useAuthority(authorities: TokenAuthorities = {}): UseAuthorityResult {
    const { walletAddress, isConnected } = useWalletConnection();

    const {
        mintAuthority,
        freezeAuthority,
        permanentDelegate,
        pauseAuthority,
        metadataAuthority,
        transferFeeAuthority,
        interestRateAuthority,
    } = authorities;

    const hasMintAuthority = useMemo(
        () => Boolean(walletAddress && mintAuthority && walletAddress === mintAuthority),
        [walletAddress, mintAuthority],
    );

    const hasFreezeAuthority = useMemo(
        () => Boolean(walletAddress && freezeAuthority && walletAddress === freezeAuthority),
        [walletAddress, freezeAuthority],
    );

    const hasPermanentDelegate = useMemo(
        () => Boolean(walletAddress && permanentDelegate && walletAddress === permanentDelegate),
        [walletAddress, permanentDelegate],
    );

    const hasPauseAuthority = useMemo(
        () => Boolean(walletAddress && pauseAuthority && walletAddress === pauseAuthority),
        [walletAddress, pauseAuthority],
    );

    const hasMetadataAuthority = useMemo(
        () => Boolean(walletAddress && metadataAuthority && walletAddress === metadataAuthority),
        [walletAddress, metadataAuthority],
    );

    const hasTransferFeeAuthority = useMemo(
        () => Boolean(walletAddress && transferFeeAuthority && walletAddress === transferFeeAuthority),
        [walletAddress, transferFeeAuthority],
    );

    const hasInterestRateAuthority = useMemo(
        () => Boolean(walletAddress && interestRateAuthority && walletAddress === interestRateAuthority),
        [walletAddress, interestRateAuthority],
    );

    const checkAuthority = (type: AuthorityType): AuthorityCheck => {
        const authorityMap: Record<AuthorityType, { hasAuthority: boolean; address: string | undefined }> = {
            mint: { hasAuthority: hasMintAuthority, address: mintAuthority },
            freeze: { hasAuthority: hasFreezeAuthority, address: freezeAuthority },
            permanentDelegate: { hasAuthority: hasPermanentDelegate, address: permanentDelegate },
            pause: { hasAuthority: hasPauseAuthority, address: pauseAuthority },
            metadata: { hasAuthority: hasMetadataAuthority, address: metadataAuthority },
            transferFee: { hasAuthority: hasTransferFeeAuthority, address: transferFeeAuthority },
            interestRate: { hasAuthority: hasInterestRateAuthority, address: interestRateAuthority },
        };

        const check = authorityMap[type];
        return {
            hasAuthority: check.hasAuthority,
            walletAddress,
            authorityAddress: check.address,
        };
    };

    const getWalletAuthorities = (): AuthorityType[] => {
        const result: AuthorityType[] = [];
        if (hasMintAuthority) result.push('mint');
        if (hasFreezeAuthority) result.push('freeze');
        if (hasPermanentDelegate) result.push('permanentDelegate');
        if (hasPauseAuthority) result.push('pause');
        if (hasMetadataAuthority) result.push('metadata');
        if (hasTransferFeeAuthority) result.push('transferFee');
        if (hasInterestRateAuthority) result.push('interestRate');
        return result;
    };

    return {
        walletAddress,
        isConnected,
        hasMintAuthority,
        hasFreezeAuthority,
        hasPermanentDelegate,
        hasPauseAuthority,
        hasMetadataAuthority,
        hasTransferFeeAuthority,
        hasInterestRateAuthority,
        checkAuthority,
        getWalletAuthorities,
    };
}
