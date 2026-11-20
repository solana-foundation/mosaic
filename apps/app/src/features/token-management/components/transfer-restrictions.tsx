import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ClipboardList, Plus, ShieldX, ShieldCheck } from 'lucide-react';
import { type AccessListState, shortAddress } from '@/features/token-management/lib/access-list-state';

interface TransferRestrictionsProps {
    state: AccessListState;
    tokenSymbol?: string;
    onAddToAccessList: () => void;
    onRemoveFromAccessList: (address: string) => void;
    onRetry: () => void;
}

function Notice({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-3xl border bg-card overflow-hidden">
            <div className="p-5">
                <h3 className="font-semibold text-foreground text-lg">Access List</h3>
                <div className="text-sm text-muted-foreground mt-1">{children}</div>
            </div>
        </div>
    );
}

export function TransferRestrictions({
    state,
    tokenSymbol = 'tokens',
    onAddToAccessList,
    onRemoveFromAccessList,
    onRetry,
}: TransferRestrictionsProps) {
    if (state.status === 'loading') {
        return (
            <Notice>
                <span className="inline-flex items-center gap-2">
                    <Spinner size={14} />
                    Reading the access list from chain…
                </span>
            </Notice>
        );
    }

    if (state.status === 'not-initialised') {
        return (
            <Notice>
                No access list is attached to this token yet, so its mode (allowlist or blocklist) is unknown.
            </Notice>
        );
    }

    if (state.status === 'unsupported') {
        return <Notice>This token&apos;s access list can&apos;t be shown here: {state.reason}.</Notice>;
    }

    if (state.status === 'error') {
        return (
            <Notice>
                <p>Couldn&apos;t read the access list: {state.message}</p>
                <Button variant="secondary" size="sm" className="h-9 px-4 rounded-xl mt-3" onClick={onRetry}>
                    Retry
                </Button>
            </Notice>
        );
    }

    // Configuration for blocklist vs allowlist
    const listConfig = {
        blocklist: {
            title: 'Blocklist',
            description: `Block specific addresses from transferring $${tokenSymbol}`,
            emptyTitle: 'No blocked addresses',
            emptyDescription: state.canManage
                ? 'Add addresses to prevent them from transferring this token.'
                : 'No address is blocked from transferring this token.',
            EmptyIcon: ShieldX,
        },
        allowlist: {
            title: 'Allowlist',
            description: `Only these addresses can transfer $${tokenSymbol}`,
            emptyTitle: 'No allowed addresses',
            emptyDescription: 'Nobody can receive or transfer this token until an address is added.',
            EmptyIcon: ShieldCheck,
        },
    };

    const config = listConfig[state.mode];
    const EmptyIcon = config.EmptyIcon;

    return (
        <div className="rounded-3xl border bg-card overflow-hidden">
            {/* Header */}
            <div className="p-5 flex items-start justify-between gap-4">
                <div>
                    <h3 className="font-semibold text-foreground text-lg">{config.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
                    {!state.canManage && (
                        <p className="text-sm text-muted-foreground mt-1">
                            Read-only. Only the list authority {shortAddress(state.authority)} can change this list.
                        </p>
                    )}
                </div>
                {state.canManage && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-9 px-4 rounded-xl shrink-0"
                        onClick={onAddToAccessList}
                    >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add address
                    </Button>
                )}
            </div>

            {/* Address List */}
            {state.wallets.length > 0 ? (
                <div className="divide-y divide-border border-t">
                    {state.wallets.map(addr => (
                        <div key={addr} className="flex items-center justify-between px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                                    <ClipboardList className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                                </div>
                                <span className="font-medium text-foreground">{shortAddress(addr)}</span>
                            </div>
                            {state.canManage && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-9 px-4 rounded-xl"
                                    onClick={() => onRemoveFromAccessList(addr)}
                                >
                                    Remove
                                </Button>
                            )}
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
                    <p className="text-sm text-muted-foreground max-w-[280px]">{config.emptyDescription}</p>
                </div>
            )}
        </div>
    );
}
