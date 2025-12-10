/**
 * Solana Explorer utilities for building URLs and extracting cluster information.
 */

/**
 * Safely extracts cluster name from cluster object.
 * Handles different cluster object structures from @solana/connector.
 */
export function getClusterName(cluster: unknown): string | undefined {
    if (!cluster || typeof cluster !== 'object') return undefined;

    // Try to access name property (may not be in type definition but exists at runtime)
    const clusterObj = cluster as Record<string, unknown>;
    if (typeof clusterObj.name === 'string') {
        return clusterObj.name;
    }

    // Fallback: try to infer from id (e.g., 'solana:mainnet' -> 'mainnet')
    if (typeof clusterObj.id === 'string') {
        const idParts = clusterObj.id.split(':');
        if (idParts.length > 1) {
            const network = idParts[1];
            // Map 'mainnet' to 'mainnet-beta' for consistency
            return network === 'mainnet' ? 'mainnet-beta' : network;
        }
    }

    // Fallback: try to infer from URL
    if (typeof clusterObj.url === 'string') {
        const url = clusterObj.url.toLowerCase();
        if (url.includes('mainnet') || url.includes('api.mainnet')) {
            return 'mainnet-beta';
        }
        if (url.includes('devnet') || url.includes('api.devnet')) {
            return 'devnet';
        }
        if (url.includes('testnet') || url.includes('api.testnet')) {
            return 'testnet';
        }
    }

    return undefined;
}

/**
 * Maps internal cluster names to Solana Explorer cluster query parameter values.
 * Returns undefined for mainnet to omit the cluster param.
 */
export function getExplorerClusterParam(clusterName?: string): string | undefined {
    if (!clusterName) return undefined;

    // Map internal cluster names to explorer values
    const clusterMap: Record<string, string | undefined> = {
        'mainnet-beta': undefined, // Omit cluster param for mainnet
        mainnet: undefined,
        devnet: 'devnet',
        testnet: 'testnet',
    };

    return clusterMap[clusterName.toLowerCase()] ?? clusterName.toLowerCase();
}

/**
 * Gets the cluster name from various sources with fallback priority:
 * 1. Provided cluster name
 * 2. Connector cluster
 * 3. Environment variable NEXT_PUBLIC_SOLANA_NETWORK
 * 4. Default to 'mainnet-beta'
 */
export function getEffectiveClusterName(clusterName?: string, connectorCluster?: unknown): string {
    if (clusterName) return clusterName;

    // Try to get from connector cluster
    const connectorClusterName = getClusterName(connectorCluster);
    if (connectorClusterName) return connectorClusterName;

    // Check environment variable as fallback
    const envNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
    if (envNetwork) {
        // Sanitize and validate the env value
        const sanitized = envNetwork.trim().toLowerCase();
        if (['devnet', 'testnet', 'mainnet', 'mainnet-beta'].includes(sanitized)) {
            return sanitized === 'mainnet' ? 'mainnet-beta' : sanitized;
        }
    }

    // Default fallback to mainnet-beta
    return 'mainnet-beta';
}

/**
 * Builds a Solana Explorer URL for a transaction signature.
 * Omits the cluster query param for mainnet.
 * Validates and encodes the cluster parameter.
 */
export function buildExplorerUrl(signature: string, clusterName?: string, connectorCluster?: unknown): string {
    const baseUrl = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}`;
    const effectiveClusterName = getEffectiveClusterName(clusterName, connectorCluster);
    const clusterParam = getExplorerClusterParam(effectiveClusterName);

    if (clusterParam) {
        // Validate and encode the cluster parameter
        const encodedCluster = encodeURIComponent(clusterParam);
        return `${baseUrl}?cluster=${encodedCluster}`;
    }

    return baseUrl;
}

/**
 * Builds a Solana Explorer URL for an address (token mint, wallet, etc.).
 * Omits the cluster query param for mainnet.
 */
export function buildAddressExplorerUrl(address: string, connectorCluster?: unknown): string {
    const baseUrl = `https://explorer.solana.com/address/${encodeURIComponent(address)}`;
    const effectiveClusterName = getEffectiveClusterName(undefined, connectorCluster);
    const clusterParam = getExplorerClusterParam(effectiveClusterName);

    if (clusterParam) {
        return `${baseUrl}?cluster=${encodeURIComponent(clusterParam)}`;
    }

    return baseUrl;
}
