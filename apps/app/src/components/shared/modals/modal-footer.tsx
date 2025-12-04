import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { MODAL_BUTTONS } from '@/features/token-management/constants/modal-text';

interface ModalFooterProps {
    /** Whether the action is currently loading */
    isLoading: boolean;
    /** Click handler for the action button */
    onAction: () => void;
    /** Label for the action button */
    actionLabel: string;
    /** Label shown while loading */
    loadingLabel: string;
    /** Optional icon to show in the action button */
    actionIcon?: LucideIcon;
    /** Whether the action button should be disabled */
    actionDisabled?: boolean;
    /** Label shown when button is disabled (helps user understand why) */
    disabledLabel?: string;
    /** Additional classes for the action button (e.g., bg-red-500 for destructive actions) */
    actionClassName?: string;
}

export function ModalFooter({
    isLoading,
    onAction,
    actionLabel,
    loadingLabel,
    actionIcon: ActionIcon,
    actionDisabled = false,
    disabledLabel,
    actionClassName,
}: ModalFooterProps) {
    // Determine what label to show
    const getButtonLabel = () => {
        if (isLoading) return loadingLabel;
        if (actionDisabled && disabledLabel) return disabledLabel;
        return actionLabel;
    };

    const showIcon = !isLoading && (!actionDisabled || !disabledLabel);

    return (
        <div className="grid grid-cols-2 gap-3 pt-2">
            <AlertDialogCancel className="w-full h-12 rounded-xl mt-0" disabled={isLoading}>
                {MODAL_BUTTONS.CANCEL}
            </AlertDialogCancel>
            <Button
                onClick={onAction}
                disabled={isLoading || actionDisabled}
                className={cn(
                    'w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all',
                    actionClassName,
                )}
            >
                {isLoading && <Spinner size={16} className="mr-2" />}
                {showIcon && ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
                {getButtonLabel()}
            </Button>
        </div>
    );
}
