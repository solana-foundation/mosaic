import { type LucideIcon, X } from 'lucide-react';
import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface ExtensionModalProps {
    /** Modal title shown in header */
    title: string;
    /** Title shown when in success state */
    successTitle?: string;
    /** Description text below the title */
    description: string;
    /** Optional icon shown before title */
    icon?: LucideIcon;
    /** Additional classes for the icon */
    iconClassName?: string;
    /** Whether the modal is in success state */
    isSuccess: boolean;
    /** Content to show when in success state */
    successView?: React.ReactNode;
    /** Main form content */
    children: React.ReactNode;
    /** Callback when modal is closed - use to reset form state */
    onClose?: () => void;
}

export function ExtensionModal({
    title,
    successTitle,
    description,
    icon: Icon,
    iconClassName,
    isSuccess,
    successView,
    children,
    onClose,
}: ExtensionModalProps) {
    const displayTitle = isSuccess && successTitle ? successTitle : title;

    return (
        <AlertDialogContent className={cn('sm:rounded-3xl p-0 gap-0 max-w-[500px] overflow-hidden')}>
            <div className="overflow-hidden bg-primary/5">
                <AlertDialogHeader className="p-6 pb-4 border-b border-primary/5 bg-primary/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {Icon && <Icon className={cn('h-5 w-5', iconClassName)} />}
                            <AlertDialogTitle className="text-xl font-semibold">{displayTitle}</AlertDialogTitle>
                        </div>
                        <AlertDialogCancel
                            className="rounded-full p-1.5 hover:bg-muted transition-colors border-0 h-auto w-auto mt-0"
                            aria-label="Close"
                            onClick={onClose}
                        >
                            <X className="h-4 w-4" />
                        </AlertDialogCancel>
                    </div>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">{isSuccess && successView ? successView : children}</div>
            </div>
        </AlertDialogContent>
    );
}
