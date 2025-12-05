import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { type TransactionModifyingSigner } from 'gill';
import { toast } from '@/components/ui/sonner';
import {
    checkTokenPauseState,
    pauseTokenWithWallet,
    unpauseTokenWithWallet,
    type PauseOptions,
} from '@/features/token-management/lib/pause';
import {
    updateScaledUiMultiplier as updateScaledUiMultiplierLib,
    type UpdateScaledUiMultiplierOptions,
} from '@/features/token-management/lib/scaled-ui-amount';
import { humanizeError } from '@/lib/errors';

// Individual extension states
interface PauseState {
    isPaused: boolean;
    isUpdating: boolean;
    error: string | null;
    lastFetched: number | null;
}

interface ScaledUiAmountState {
    multiplier: number | null;
    isUpdating: boolean;
    error: string | null;
}

// Combined state for a single token
interface ExtensionState {
    pause: PauseState;
    scaledUiAmount: ScaledUiAmountState;
}

// Default state factory
function createDefaultExtensionState(): ExtensionState {
    return {
        pause: {
            isPaused: false,
            isUpdating: false,
            error: null,
            lastFetched: null,
        },
        scaledUiAmount: {
            multiplier: null,
            isUpdating: false,
            error: null,
        },
    };
}

// Store interface
interface TokenExtensionStore {
    // State: keyed by mint address
    extensions: Record<string, ExtensionState>;

    // Pause actions
    fetchPauseState: (mint: string, rpcUrl: string) => Promise<void>;
    togglePause: (
        mint: string,
        options: Omit<PauseOptions, 'mintAddress'>,
        signer: TransactionModifyingSigner,
    ) => Promise<boolean>;
    setPauseUpdating: (mint: string, isUpdating: boolean) => void;
    setPauseError: (mint: string, error: string | null) => void;

    // Scaled UI Amount actions
    updateScaledUiMultiplier: (
        mint: string,
        options: Omit<UpdateScaledUiMultiplierOptions, 'mint'>,
        signer: TransactionModifyingSigner,
    ) => Promise<boolean>;
    setScaledUiUpdating: (mint: string, isUpdating: boolean) => void;
    setScaledUiError: (mint: string, error: string | null) => void;

    // Utility actions
    clearError: (mint: string, extension: 'pause' | 'scaledUiAmount') => void;
    resetToken: (mint: string) => void;
    getExtensionState: (mint: string) => ExtensionState;
}

// Helper to ensure extension state exists for a mint
function ensureExtensionState(
    extensions: Record<string, ExtensionState>,
    mint: string,
): Record<string, ExtensionState> {
    if (!extensions[mint]) {
        return {
            ...extensions,
            [mint]: createDefaultExtensionState(),
        };
    }
    return extensions;
}

export const useTokenExtensionStore = create<TokenExtensionStore>()((set, get) => ({
    extensions: {},

    // Fetch pause state from chain
    fetchPauseState: async (mint: string, rpcUrl: string) => {
        // Ensure state exists
        set(state => ({
            extensions: ensureExtensionState(state.extensions, mint),
        }));

        try {
            const isPaused = await checkTokenPauseState(mint, rpcUrl);
            set(state => ({
                extensions: {
                    ...state.extensions,
                    [mint]: {
                        ...state.extensions[mint],
                        pause: {
                            ...state.extensions[mint].pause,
                            isPaused,
                            lastFetched: Date.now(),
                            error: null,
                        },
                    },
                },
            }));
        } catch {
            // Don't set error for fetch failures - token might not have pausable extension
            set(state => ({
                extensions: {
                    ...state.extensions,
                    [mint]: {
                        ...state.extensions[mint],
                        pause: {
                            ...state.extensions[mint].pause,
                            lastFetched: Date.now(),
                        },
                    },
                },
            }));
        }
    },

    // Toggle pause state
    togglePause: async (mint, options, signer) => {
        const { extensions } = get();
        const currentState = extensions[mint]?.pause ?? createDefaultExtensionState().pause;

        // Prevent double operations
        if (currentState.isUpdating) return false;

        const newPausedState = !currentState.isPaused;
        const previousState = currentState.isPaused;

        // Optimistically update
        set(state => ({
            extensions: {
                ...ensureExtensionState(state.extensions, mint),
                [mint]: {
                    ...state.extensions[mint],
                    pause: {
                        ...state.extensions[mint].pause,
                        isPaused: newPausedState,
                        isUpdating: true,
                        error: null,
                    },
                },
            },
        }));

        try {
            const pauseOptions: PauseOptions = {
                mintAddress: mint,
                pauseAuthority: options.pauseAuthority,
                feePayer: options.feePayer,
                rpcUrl: options.rpcUrl,
            };

            const result = newPausedState
                ? await pauseTokenWithWallet(pauseOptions, signer)
                : await unpauseTokenWithWallet(pauseOptions, signer);

            if (!result.success) {
                // Revert on failure
                const errorMessage = result.error || 'Operation failed';
                set(state => ({
                    extensions: {
                        ...state.extensions,
                        [mint]: {
                            ...state.extensions[mint],
                            pause: {
                                ...state.extensions[mint].pause,
                                isPaused: previousState,
                                isUpdating: false,
                                error: errorMessage,
                            },
                        },
                    },
                }));
                toast.error(newPausedState ? 'Failed to pause token' : 'Failed to unpause token', {
                    description: errorMessage,
                });
                return false;
            }

            // Success
            set(state => ({
                extensions: {
                    ...state.extensions,
                    [mint]: {
                        ...state.extensions[mint],
                        pause: {
                            ...state.extensions[mint].pause,
                            isUpdating: false,
                            error: null,
                        },
                    },
                },
            }));
            toast.success(newPausedState ? 'Token paused' : 'Token unpaused');
            return true;
        } catch (err) {
            // Revert on error
            const errorMessage = humanizeError(err);
            set(state => ({
                extensions: {
                    ...state.extensions,
                    [mint]: {
                        ...state.extensions[mint],
                        pause: {
                            ...state.extensions[mint].pause,
                            isPaused: previousState,
                            isUpdating: false,
                            error: errorMessage,
                        },
                    },
                },
            }));
            toast.error(newPausedState ? 'Failed to pause token' : 'Failed to unpause token', {
                description: errorMessage,
            });
            return false;
        }
    },

    setPauseUpdating: (mint, isUpdating) => {
        set(state => ({
            extensions: {
                ...ensureExtensionState(state.extensions, mint),
                [mint]: {
                    ...state.extensions[mint],
                    pause: {
                        ...state.extensions[mint].pause,
                        isUpdating,
                    },
                },
            },
        }));
    },

    setPauseError: (mint, error) => {
        set(state => ({
            extensions: {
                ...ensureExtensionState(state.extensions, mint),
                [mint]: {
                    ...state.extensions[mint],
                    pause: {
                        ...state.extensions[mint].pause,
                        error,
                    },
                },
            },
        }));
    },

    // Update scaled UI multiplier
    updateScaledUiMultiplier: async (mint, options, signer) => {
        const { extensions } = get();
        const currentState = extensions[mint]?.scaledUiAmount ?? createDefaultExtensionState().scaledUiAmount;

        // Prevent double operations
        if (currentState.isUpdating) return false;

        set(state => ({
            extensions: {
                ...ensureExtensionState(state.extensions, mint),
                [mint]: {
                    ...state.extensions[mint],
                    scaledUiAmount: {
                        ...state.extensions[mint].scaledUiAmount,
                        isUpdating: true,
                        error: null,
                    },
                },
            },
        }));

        try {
            const result = await updateScaledUiMultiplierLib(
                {
                    mint,
                    multiplier: options.multiplier,
                    rpcUrl: options.rpcUrl,
                },
                signer,
            );

            if (!result.success) {
                const errorMessage = result.error || 'Operation failed';
                set(state => ({
                    extensions: {
                        ...state.extensions,
                        [mint]: {
                            ...state.extensions[mint],
                            scaledUiAmount: {
                                ...state.extensions[mint].scaledUiAmount,
                                isUpdating: false,
                                error: errorMessage,
                            },
                        },
                    },
                }));
                toast.error('Failed to update multiplier', {
                    description: errorMessage,
                });
                return false;
            }

            // Success - update multiplier
            set(state => ({
                extensions: {
                    ...state.extensions,
                    [mint]: {
                        ...state.extensions[mint],
                        scaledUiAmount: {
                            multiplier: result.multiplier ?? options.multiplier,
                            isUpdating: false,
                            error: null,
                        },
                    },
                },
            }));
            toast.success('Multiplier updated');
            return true;
        } catch (err) {
            const errorMessage = humanizeError(err);
            set(state => ({
                extensions: {
                    ...state.extensions,
                    [mint]: {
                        ...state.extensions[mint],
                        scaledUiAmount: {
                            ...state.extensions[mint].scaledUiAmount,
                            isUpdating: false,
                            error: errorMessage,
                        },
                    },
                },
            }));
            toast.error('Failed to update multiplier', {
                description: errorMessage,
            });
            return false;
        }
    },

    setScaledUiUpdating: (mint, isUpdating) => {
        set(state => ({
            extensions: {
                ...ensureExtensionState(state.extensions, mint),
                [mint]: {
                    ...state.extensions[mint],
                    scaledUiAmount: {
                        ...state.extensions[mint].scaledUiAmount,
                        isUpdating,
                    },
                },
            },
        }));
    },

    setScaledUiError: (mint, error) => {
        set(state => ({
            extensions: {
                ...ensureExtensionState(state.extensions, mint),
                [mint]: {
                    ...state.extensions[mint],
                    scaledUiAmount: {
                        ...state.extensions[mint].scaledUiAmount,
                        error,
                    },
                },
            },
        }));
    },

    // Utility: clear error for specific extension
    clearError: (mint, extension) => {
        set(state => {
            const ext = state.extensions[mint];
            if (!ext) return state;

            return {
                extensions: {
                    ...state.extensions,
                    [mint]: {
                        ...ext,
                        [extension]: {
                            ...ext[extension],
                            error: null,
                        },
                    },
                },
            };
        });
    },

    // Utility: reset all state for a token
    resetToken: (mint: string) => {
        set(state => {
            const { [mint]: _, ...rest } = state.extensions;
            return { extensions: rest };
        });
    },

    // Utility: get extension state with defaults
    getExtensionState: (mint: string) => {
        return get().extensions[mint] ?? createDefaultExtensionState();
    },
}));

// Default pause state for selector
const DEFAULT_PAUSE_STATE: PauseState = {
    isPaused: false,
    isUpdating: false,
    error: null,
    lastFetched: null,
};

// Default scaled UI state for selector
const DEFAULT_SCALED_UI_STATE: ScaledUiAmountState = {
    multiplier: null,
    isUpdating: false,
    error: null,
};

/**
 * Selector hook for pause state of a specific token
 * Uses useShallow to prevent unnecessary re-renders
 */
export function usePauseState(mint: string | undefined): PauseState {
    return useTokenExtensionStore(
        useShallow(state => (mint ? state.extensions[mint]?.pause ?? DEFAULT_PAUSE_STATE : DEFAULT_PAUSE_STATE)),
    );
}

/**
 * Selector hook for scaled UI amount state of a specific token
 * Uses useShallow to prevent unnecessary re-renders
 */
export function useScaledUiAmountState(mint: string | undefined): ScaledUiAmountState {
    return useTokenExtensionStore(
        useShallow(state =>
            mint ? state.extensions[mint]?.scaledUiAmount ?? DEFAULT_SCALED_UI_STATE : DEFAULT_SCALED_UI_STATE,
        ),
    );
}
