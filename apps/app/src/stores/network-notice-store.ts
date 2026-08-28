import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NetworkNoticeStore {
    /**
     * True once the user has been told which network they are on, or has picked
     * a network themselves - whichever happened first. Suppresses the one-time
     * network notice from then on.
     */
    hasSeenNetworkNotice: boolean;
    markNetworkNoticeSeen: () => void;
}

export const useNetworkNoticeStore = create<NetworkNoticeStore>()(
    persist(
        set => ({
            hasSeenNetworkNotice: false,
            markNetworkNoticeSeen: () => set({ hasSeenNetworkNotice: true }),
        }),
        {
            name: 'mosaic_network_notice',
            version: 1,
        },
    ),
);

/** Marks the notice as seen from outside React (event handlers, stores). */
export function markNetworkNoticeSeen() {
    useNetworkNoticeStore.getState().markNetworkNoticeSeen();
}
