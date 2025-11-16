import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, Ban, Flame, ArrowRightLeft, Trash2 } from 'lucide-react';

interface ActionSidebarProps {
    isPaused: boolean;
    onTogglePause: () => void;
    onMintTokens: () => void;
    onForceTransfer: () => void;
    onForceBurn?: () => void;
    onRemoveFromStorage?: () => void;
}

export function ActionSidebar({
    isPaused,
    onTogglePause,
    onMintTokens,
    onForceTransfer,
    onForceBurn,
    onRemoveFromStorage,
}: ActionSidebarProps) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Admin Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {/* <Button className="w-full" variant="outline">
            <Edit className="h-4 w-4 mr-2" />
            Edit Token
          </Button> */}
                    {/* <Button className="w-full" variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Configure Extensions
          </Button> */}
                    <Button className="w-full" variant="outline" onClick={onMintTokens}>
                        <Coins className="h-4 w-4 mr-2" />
                        Mint Tokens
                    </Button>
                    <Button className="w-full" variant="outline" onClick={onForceTransfer}>
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Force Transfer
                    </Button>
                    {onForceBurn && (
                        <Button className="w-full" variant="outline" onClick={onForceBurn}>
                            <Flame className="h-4 w-4 mr-2" />
                            Force Burn
                        </Button>
                    )}
                    <Button className="w-full" variant={isPaused ? 'default' : 'outline'} onClick={onTogglePause}>
                        {isPaused ? (
                            <>
                                <Coins className="h-4 w-4 mr-2" />
                                Unpause Token
                            </>
                        ) : (
                            <>
                                <Ban className="h-4 w-4 mr-2" />
                                Pause Token
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Storage Management</CardTitle>
                    <CardDescription>Manage local token data</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button className="w-full" variant="outline" onClick={onRemoveFromStorage}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove from Local Storage
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                        This only removes the token from your browser&apos;s storage. The token will continue to exist
                        on the blockchain.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
