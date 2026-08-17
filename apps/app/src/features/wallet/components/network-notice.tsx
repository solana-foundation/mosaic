'use client';

import { useEffect, useRef, useState } from 'react';
import { useCluster } from '@solana/connector/react';
import { toast } from '@/components/ui/sonner';
import { getClusterName } from '@/lib/solana/explorer';
import { getConfiguredNetwork } from '@/lib/solana/network';
import { useNetworkNoticeStore } from '@/stores/network-notice-store';

/**
 * Fires a one-time toast naming the active network, so a first-time visitor is
 * never unknowingly pointed at a network they did not choose.
 *
 * Deliberately not tied to wallet connection: the flag is persisted, so a
 * returning user never sees it again regardless of autoconnect, and a first-time
 * visitor is told which network they are on whether or not they connect.
 *
 * Renders nothing.
 */
export function NetworkNotice() {
    const { cluster } = useCluster();
    const [isHydrated, setIsHydrated] = useState(false);
    const hasFiredRef = useRef(false);

    // Wait for the persisted flag to rehydrate before deciding to toast.
    useEffect(() => {
        if (useNetworkNoticeStore.persist.hasHydrated()) {
            setIsHydrated(true);
        }
        return useNetworkNoticeStore.persist.onFinishHydration(() => setIsHydrated(true));
    }, []);

    useEffect(() => {
        if (!isHydrated || hasFiredRef.current || !cluster) return;
        // Guard against React StrictMode's double-invoke in development.
        hasFiredRef.current = true;

        // Read via getState() rather than a selector: this component does not
        // need to re-render when the flag flips.
        if (useNetworkNoticeStore.getState().hasSeenNetworkNotice) return;

        const label = (cluster as { label?: string }).label ?? getClusterName(cluster) ?? getConfiguredNetwork();

        toast.info(`You're on ${label}`, {
            id: 'network-notice',
            description: 'Change it any time under the wallet menu → Network Settings.',
            duration: 8000,
        });

        useNetworkNoticeStore.getState().markNetworkNoticeSeen();
    }, [cluster, isHydrated]);

    return null;
}
