import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NetworkName = 'mainnet-beta' | 'devnet' | 'testnet';

export interface CustomRpc {
    id: string;
    label: string;
    url: string;
    network: NetworkName;
}

/**
 * Persists the user's custom RPC endpoints. Cluster *selection* is not stored
 * here — the connector owns it (key `connector-kit:cluster`) and its stored value
 * takes precedence over any initial cluster we pass, so a second copy here would
 * only ever be a stale duplicate.
 */
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
