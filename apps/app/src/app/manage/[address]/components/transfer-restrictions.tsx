import { Button } from '@/components/ui/button';
import { ClipboardList, Plus, ShieldX, ShieldCheck } from 'lucide-react';

interface TransferRestrictionsProps {
    accessList: string[];
    listType: 'allowlist' | 'blocklist';
    tokenSymbol?: string;
    onAddToAccessList: () => void;
    onRemoveFromAccessList: (address: string) => void;
}

export function TransferRestrictions({
    accessList,
    listType,
    tokenSymbol = 'tokens',
    onAddToAccessList,
    onRemoveFromAccessList,
}: TransferRestrictionsProps) {
    // Configuration for blocklist vs allowlist
    const listConfig = {
        blocklist: {
            title: 'Blocklist',
            description: `Block specific addresses from transferring $${tokenSymbol}`,
            emptyTitle: 'No blocked addresses',
            emptyDescription: 'Add addresses to prevent them from transferring this token.',
            EmptyIcon: ShieldX,
        },
        allowlist: {
            title: 'Allowlist',
            description: `Only these addresses can transfer $${tokenSymbol}`,
            emptyTitle: 'No allowed addresses',
            emptyDescription: 'Add addresses to allow them to transfer this token.',
            EmptyIcon: ShieldCheck,
        },
    };

    const config = listConfig[listType];
    const EmptyIcon = config.EmptyIcon;

    const truncateAddress = (address: string) => {
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    };

    return (
        <div className="rounded-3xl border bg-card overflow-hidden">
            {/* Header */}
            <div className="p-5 flex items-start justify-between gap-4">
                <div>
                    <h3 className="font-semibold text-foreground text-lg">{config.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
                </div>
                <Button 
                    variant="secondary" 
                    size="sm"
                    className="h-9 px-4 rounded-xl shrink-0"
                    onClick={onAddToAccessList}
                >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add address
                </Button>
            </div>

            {/* Address List */}
            {accessList.length > 0 ? (
                <div className="divide-y divide-border border-t">
                    {accessList.map((addr) => (
                        <div key={addr} className="flex items-center justify-between px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                                    <ClipboardList className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                                </div>
                                <span className="font-medium text-foreground">
                                    {truncateAddress(addr)}
                                </span>
                            </div>
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                className="h-9 px-4 rounded-xl"
                                onClick={() => onRemoveFromAccessList(addr)}
                            >
                                Remove
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                /* Empty State */
                <div className="border-t px-5 py-12 flex flex-col items-center justify-center text-center">
                    <div className="p-3 rounded-2xl bg-muted mb-4">
                        <EmptyIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h4 className="font-medium text-foreground mb-1">{config.emptyTitle}</h4>
                    <p className="text-sm text-muted-foreground max-w-[280px]">
                        {config.emptyDescription}
                    </p>
                </div>
            )}
        </div>
    );
}
