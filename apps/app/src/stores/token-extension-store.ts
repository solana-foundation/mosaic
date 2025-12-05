import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { type TransactionModifyingSigner } from '@solana/kit';
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

    // Scaled UI Amount actions
    updateScaledUiMultiplier: (
        mint: string,
        options: Omit<UpdateScaledUiMultiplierOptions, 'mint'>,
        signer: TransactionModifyingSigner,
    ) => Promise<boolean>;

    // Generic extension field updater (replaces individual setters)
    updateExtensionField: <K extends keyof ExtensionState>(
        mint: string,
        extension: K,
        updates: Partial<ExtensionState[K]>,
    ) => void;

    // Utility actions
    clearError: (mint: string, extension: keyof ExtensionState) => void;
    resetToken: (mint: string) => void;
    getExtensionState: (mint: string) => ExtensionState;
}

// Helper to ensure extension state exists (mutates in place with Immer)
function ensureExtension(state: TokenExtensionStore, mint: string): ExtensionState {
    if (!state.extensions[mint]) {
        state.extensions[mint] = createDefaultExtensionState();
    }
    return state.extensions[mint];
}

// Generic async operation result type
interface AsyncOperationResult {
    success: boolean;
    error?: string;
}

// Generic async operation helper for extension updates
interface AsyncOperationOptions<K extends keyof ExtensionState, R extends AsyncOperationResult> {
    get: () => TokenExtensionStore;
    set: (fn: (state: TokenExtensionStore) => void) => void;
    mint: string;
    extensionKey: K;
    operation: () => Promise<R>;
    optimisticUpdate?: (ext: ExtensionState[K]) => void;
    onSuccess: (ext: ExtensionState[K], result: R) => void;
    onFailure: (ext: ExtensionState[K]) => void;
    successToast: string;
    errorToast: string;
}

async function executeAsyncOperation<K extends keyof ExtensionState, R extends AsyncOperationResult>(
    options: AsyncOperationOptions<K, R>,
): Promise<boolean> {
    const {
        get,
        set,
        mint,
        extensionKey,
        operation,
        optimisticUpdate,
        onSuccess,
        onFailure,
        successToast,
        errorToast,
    } = options;

    // Check if already updating
    const currentExt = get().extensions[mint]?.[extensionKey] as { isUpdating?: boolean } | undefined;
    if (currentExt?.isUpdating) return false;

    // Set updating state + optimistic update
    set(state => {
        const ext = ensureExtension(state, mint);
        const extState = ext[extensionKey] as { isUpdating: boolean; error: string | null };
        extState.isUpdating = true;
        extState.error = null;
        optimisticUpdate?.(ext[extensionKey]);
    });

    try {
        const result = await operation();

        if (!result.success) {
            const errorMessage = result.error || 'Operation failed';
            set(state => {
                const ext = ensureExtension(state, mint);
                const extState = ext[extensionKey] as { isUpdating: boolean; error: string | null };
                extState.isUpdating = false;
                extState.error = errorMessage;
                onFailure(ext[extensionKey]);
            });
            toast.error(errorToast, { description: errorMessage });
            return false;
        }

        // Success
        set(state => {
            const ext = ensureExtension(state, mint);
            const extState = ext[extensionKey] as { isUpdating: boolean; error: string | null };
            extState.isUpdating = false;
            extState.error = null;
            onSuccess(ext[extensionKey], result);
        });
        toast.success(successToast);
        return true;
    } catch (err) {
        const errorMessage = humanizeError(err);
        set(state => {
            const ext = ensureExtension(state, mint);
            const extState = ext[extensionKey] as { isUpdating: boolean; error: string | null };
            extState.isUpdating = false;
            extState.error = errorMessage;
            onFailure(ext[extensionKey]);
        });
        toast.error(errorToast, { description: errorMessage });
        return false;
    }
}

export const useTokenExtensionStore = create<TokenExtensionStore>()(
    immer((set, get) => ({
        extensions: {},

        // Fetch pause state from chain
        fetchPauseState: async (mint: string, rpcUrl: string) => {
            // Ensure state exists
            set(state => {
                ensureExtension(state, mint);
            });

            try {
                const isPaused = await checkTokenPauseState(mint, rpcUrl);
                set(state => {
                    const ext = ensureExtension(state, mint);
                    ext.pause.isPaused = isPaused;
                    ext.pause.lastFetched = Date.now();
                    ext.pause.error = null;
                });
            } catch {
                // Don't set error for fetch failures - token might not have pausable extension
                set(state => {
                    const ext = ensureExtension(state, mint);
                    ext.pause.lastFetched = Date.now();
                });
            }
        },

        // Toggle pause state
        togglePause: async (mint, options, signer) => {
            const currentState = get().extensions[mint]?.pause ?? createDefaultExtensionState().pause;
            const newPausedState = !currentState.isPaused;
            const previousState = currentState.isPaused;

            return executeAsyncOperation({
                get,
                set,
                mint,
                extensionKey: 'pause',
                optimisticUpdate: pause => {
                    (pause as PauseState).isPaused = newPausedState;
                },
                operation: async () => {
                    const pauseOptions: PauseOptions = {
                        mintAddress: mint,
                        pauseAuthority: options.pauseAuthority,
                        feePayer: options.feePayer,
                        rpcUrl: options.rpcUrl,
                    };
                    return newPausedState
                        ? pauseTokenWithWallet(pauseOptions, signer)
                        : unpauseTokenWithWallet(pauseOptions, signer);
                },
                onSuccess: () => {
                    // isPaused already set optimistically
                },
                onFailure: pause => {
                    (pause as PauseState).isPaused = previousState;
                },
                successToast: newPausedState ? 'Token paused' : 'Token unpaused',
                errorToast: newPausedState ? 'Failed to pause token' : 'Failed to unpause token',
            });
        },

        // Update scaled UI multiplier
        updateScaledUiMultiplier: async (mint, options, signer) => {
            return executeAsyncOperation({
                get,
                set,
                mint,
                extensionKey: 'scaledUiAmount',
                operation: async () =>
                    updateScaledUiMultiplierLib(
                        {
                            mint,
                            multiplier: options.multiplier,
                            rpcUrl: options.rpcUrl,
                        },
                        signer,
                    ),
                onSuccess: (scaledUi, result) => {
                    (scaledUi as ScaledUiAmountState).multiplier = (result.multiplier as number) ?? options.multiplier;
                },
                onFailure: () => {
                    // No optimistic update to revert
                },
                successToast: 'Multiplier updated',
                errorToast: 'Failed to update multiplier',
            });
        },

        // Generic extension field updater
        updateExtensionField: <K extends keyof ExtensionState>(
            mint: string,
            extension: K,
            updates: Partial<ExtensionState[K]>,
        ) => {
            set(state => {
                const ext = ensureExtension(state, mint);
                Object.assign(ext[extension], updates);
            });
        },

        // Utility: clear error for specific extension
        clearError: (mint, extension) => {
            set(state => {
                const ext = state.extensions[mint];
                if (ext) {
                    (ext[extension] as { error: string | null }).error = null;
                }
            });
        },

        // Utility: reset all state for a token
        resetToken: (mint: string) => {
            set(state => {
                delete state.extensions[mint];
            });
        },

        // Utility: get extension state with defaults
        getExtensionState: (mint: string) => {
            return get().extensions[mint] ?? createDefaultExtensionState();
        },
    })),
);

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
        useShallow(state => (mint ? (state.extensions[mint]?.pause ?? DEFAULT_PAUSE_STATE) : DEFAULT_PAUSE_STATE)),
    );
}

/**
 * Selector hook for scaled UI amount state of a specific token
 * Uses useShallow to prevent unnecessary re-renders
 */
export function useScaledUiAmountState(mint: string | undefined): ScaledUiAmountState {
    return useTokenExtensionStore(
        useShallow(state =>
            mint ? (state.extensions[mint]?.scaledUiAmount ?? DEFAULT_SCALED_UI_STATE) : DEFAULT_SCALED_UI_STATE,
        ),
    );
}
