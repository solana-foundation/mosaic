import { ShieldX } from 'lucide-react';
import { AlertDialogCancel } from '@/components/ui/alert-dialog';
import { MODAL_BUTTONS } from '@/features/token-management/constants/modal-text';

export type UnauthorizedType =
    | 'mint'
    | 'freeze'
    | 'thaw'
    | 'forceBurn'
    | 'forceTransfer'
    | 'pause'
    | 'unpause'
    | 'metadata';

interface UnauthorizedConfig {
    title: string;
    description: string;
    authorityLabel: string;
}

const unauthorizedConfig: Record<UnauthorizedType, UnauthorizedConfig> = {
    mint: {
        title: 'Mint Authority Required',
        description: 'Only the mint authority can create new tokens.',
        authorityLabel: 'Mint Authority',
    },
    freeze: {
        title: 'Freeze Authority Required',
        description: 'Only the freeze authority can freeze token accounts.',
        authorityLabel: 'Freeze Authority',
    },
    thaw: {
        title: 'Freeze Authority Required',
        description: 'Only the freeze authority can thaw frozen token accounts.',
        authorityLabel: 'Freeze Authority',
    },
    forceBurn: {
        title: 'Permanent Delegate Required',
        description: 'Only the permanent delegate can force burn tokens from any account.',
        authorityLabel: 'Permanent Delegate',
    },
    forceTransfer: {
        title: 'Permanent Delegate Required',
        description: 'Only the permanent delegate can force transfer tokens between accounts.',
        authorityLabel: 'Permanent Delegate',
    },
    pause: {
        title: 'Pause Authority Required',
        description: 'Only the pause authority can pause token transfers.',
        authorityLabel: 'Pause Authority',
    },
    unpause: {
        title: 'Pause Authority Required',
        description: 'Only the pause authority can unpause token transfers.',
        authorityLabel: 'Pause Authority',
    },
    metadata: {
        title: 'Metadata Authority Required',
        description: 'Only the metadata authority can update token metadata.',
        authorityLabel: 'Metadata Authority',
    },
};

interface UnauthorizedViewProps {
    /** The type of action that requires authorization */
    type: UnauthorizedType;
    /** The address that has the required authority */
    authorityAddress?: string;
    /** The connected wallet address */
    walletAddress?: string | null;
}

export function UnauthorizedView({ type, authorityAddress, walletAddress }: UnauthorizedViewProps) {
    const config = unauthorizedConfig[type];

    return (
        <div className="space-y-5">
            <div className="text-center py-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                    <ShieldX className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-amber-700 dark:text-amber-300">{config.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">{config.description}</p>
            </div>

            {authorityAddress && (
                <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                            {config.authorityLabel}
                        </label>
                        <div className="font-mono text-sm break-all">{authorityAddress}</div>
                    </div>
                    {walletAddress && (
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Your Wallet</label>
                            <div className="font-mono text-sm break-all text-muted-foreground">{walletAddress}</div>
                        </div>
                    )}
                </div>
            )}

            <p className="text-xs text-center text-muted-foreground">
                Connect a wallet with the required authority to perform this action.
            </p>

            <div className="pt-2">
                <AlertDialogCancel className="w-full h-12 rounded-xl mt-0">
                    {MODAL_BUTTONS.UNDERSTOOD}
                </AlertDialogCancel>
            </div>
        </div>
    );
}
