import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NetworkName = 'mainnet-beta' | 'devnet' | 'testnet';

export interface CustomRpc {
    id: string;
    label: string;
    url: string;
    network: NetworkName;
}

interface RpcStore {
    customRpcs: CustomRpc[];
    selectedClusterId: string | null;
    addCustomRpc: (rpc: Omit<CustomRpc, 'id'>) => string;
    removeCustomRpc: (id: string) => void;
    setSelectedCluster: (id: string | null) => void;
}

export const useRpcStore = create<RpcStore>()(
    persist(
        set => ({
            customRpcs: [],
            selectedClusterId: null,
            addCustomRpc: rpc => {
                const id = `custom-${Date.now()}`;
                set(state => ({
                    customRpcs: [...state.customRpcs, { ...rpc, id }],
                }));
                return id;
            },
            removeCustomRpc: id =>
                set(state => {
                    const newCustomRpcs = state.customRpcs.filter(r => r.id !== id);
                    // If the removed RPC was selected, clear the selection
                    const newSelectedId = state.selectedClusterId === id ? null : state.selectedClusterId;
                    return {
                        customRpcs: newCustomRpcs,
                        selectedClusterId: newSelectedId,
                    };
                }),
            setSelectedCluster: id => set({ selectedClusterId: id }),
        }),
        {
            name: 'mosaic_rpc_settings',
        },
    ),
);
