import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NetworkName = 'mainnet-beta' | 'devnet' | 'testnet';

export interface CustomRpc {
    id: string;
    label: string;
    url: string;
    network: NetworkName;
}

// Note: the active cluster is owned by @solana/connector (persisted under its
// own storage key), not by this store. This store only holds user-defined RPCs.
interface RpcStore {
    customRpcs: CustomRpc[];
    addCustomRpc: (rpc: Omit<CustomRpc, 'id'>) => string;
    removeCustomRpc: (id: string) => void;
}

export const useRpcStore = create<RpcStore>()(
    persist(
        set => ({
            customRpcs: [],
            addCustomRpc: rpc => {
                const id = `custom-${Date.now()}`;
                set(state => ({
                    customRpcs: [...state.customRpcs, { ...rpc, id }],
                }));
                return id;
            },
            removeCustomRpc: id =>
                set(state => ({
                    customRpcs: state.customRpcs.filter(r => r.id !== id),
                })),
        }),
        {
            name: 'mosaic_rpc_settings',
        },
    ),
);
