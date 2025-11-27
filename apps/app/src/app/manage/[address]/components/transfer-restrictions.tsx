import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Plus, X, Shield, Ban } from 'lucide-react';

interface TransferRestrictionsProps {
    accessList: string[];
    listType: 'allowlist' | 'blocklist';
    onAddToAccessList: () => void;
    onRemoveFromAccessList: (address: string) => void;
}

export function TransferRestrictions({
    accessList,
    listType,
    onAddToAccessList,
    onRemoveFromAccessList,
}: TransferRestrictionsProps) {
    // Configuration for blocklist vs allowlist
    const listConfig = {
        blocklist: {
            icon: Ban,
            title: 'Blocklist',
            badgeText: 'Stablecoin',
            badgeClasses: 'bg-red-100 text-red-800',
            iconClasses: 'text-red-600',
            description: 'Block specific addresses from transferring this stablecoin',
            emptyMessage: 'No addresses in blocklist',
        },
        allowlist: {
            icon: Shield,
            title: 'Allowlist',
            badgeText: 'Arcade Token',
            badgeClasses: 'bg-green-100 text-green-800',
            iconClasses: 'text-green-600',
            description: 'Allow only specific addresses to transfer this arcade token',
            emptyMessage: 'No addresses in allowlist',
        },
    };

    const config = listConfig[listType];
    const IconComponent = config.icon;

    const renderAddressList = () => {
        if (accessList.length === 0) {
            return <p className="text-sm text-muted-foreground">{config.emptyMessage}</p>;
        }

        return (
            <div className="space-y-2">
                {accessList.map((addr) => (
                    <div key={addr} className="flex items-center justify-between p-2 bg-muted rounded">
                        <code className="text-xs font-mono flex-1">
                            {addr.slice(0, 8)}...{addr.slice(-8)}
                        </code>
                        <Button variant="ghost" size="sm" onClick={() => onRemoveFromAccessList(addr)}>
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center">
                    <Settings className="h-5 w-5 mr-2" />
                    Transfer Restrictions
                </CardTitle>
                <CardDescription>Control who can transfer tokens</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                                <IconComponent className={`h-4 w-4 mr-2 ${config.iconClasses}`} />
                                <h5 className="font-medium">{config.title}</h5>
                                <span className={`ml-2 text-xs px-2 py-1 rounded ${config.badgeClasses}`}>
                                    {config.badgeText}
                                </span>
                            </div>
                            <Button variant="outline" size="sm" onClick={onAddToAccessList}>
                                <Plus className="h-4 w-4 mr-1" />
                                Add Address
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{config.description}</p>
                        {renderAddressList()}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

