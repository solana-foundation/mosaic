import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { updateScaledUiMultiplier } from '@/lib/management/scaled-ui-amount';
import { useConnector } from '@solana/connector/react';
import { useConnectorSigner } from '@/hooks/use-connector-signer';
import { TokenDisplay } from '@/types/token';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TokenExtensionsProps {
    token: TokenDisplay;
}

export function TokenExtensions({ token }: TokenExtensionsProps) {
    const { connected, selectedAccount, cluster } = useConnector();

    if (connected && selectedAccount && cluster) {
        return <ManageTokenExtensionsWithWallet token={token} />;
    }

    return (
        <div className="flex-1 p-8">
             <Card>
                <CardHeader>
                    <CardTitle>Wallet Required</CardTitle>
                    <CardDescription>Please connect your wallet to manage token extensions.</CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
}

function ManageTokenExtensionsWithWallet({ token }: { token: TokenDisplay }) {
    const [showScaledUiEditor, setShowScaledUiEditor] = useState(false);
    const [newMultiplier, setNewMultiplier] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string>('');

    // Use the connector signer hook which provides a gill-compatible transaction signer
    const transactionSendingSigner = useConnectorSigner();

    return (
        <Card className="">
            <CardHeader className="p-5">
                <CardTitle className="font-semibold text-foreground text-lg">Token Extensions</CardTitle>
                <CardDescription className="text-sm text-muted-foreground -mt-1">Configure token-level settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-2">
                 {/* Metadata Pointer */}
                <div className="flex items-start justify-between space-x-4 p-4 bg-muted/50 rounded-lg">
                     <div className="space-y-1">
                        <h4 className="text-sm font-medium">MetadataPointer</h4>
                        <p className="text-sm text-muted-foreground">
                            Points to where the token&apos;s name, symbol, and metadata are stored.
                        </p>
                    </div>
                    <div className="flex items-center space-x-2">
                         {token.metadataUri && (
                             <code className="px-2 py-1 bg-background rounded text-xs font-mono border">
                                {token.metadataUri.length > 20 ? token.metadataUri.slice(0, 10) + '...' + token.metadataUri.slice(-8) : token.metadataUri}
                             </code>
                         )}
                        <Button variant="outline" size="sm">Edit</Button>
                    </div>
                </div>

                {/* Pausable Config - Placeholder as actual pause state is managed in sidebar/header actions mostly, but extensions list usually shows if it IS pausable */}
                 {token.extensions?.includes('Pausable') && (
                     <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                        <div className="space-y-1">
                            <h4 className="text-sm font-medium">PausableConfig</h4>
                            <p className="text-sm text-muted-foreground">
                                Lets an authority pause all token transfers globally.
                            </p>
                        </div>
                         {/* Switch is disabled as this is just showing capability usually, or needs actual logic to toggle capability if possible (usually immutable after init unless pointer swap) */}
                        <Switch checked={true} disabled />
                    </div>
                 )}

                 {/* Scaled UI Amount */}
                {token.extensions?.includes('Scaled UI Amount') && (
                    <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                        <div className="flex items-center justify-between">
                             <div className="space-y-1">
                                <h4 className="text-sm font-medium">Scaled UI Amount (Editable)</h4>
                                <p className="text-sm text-muted-foreground">
                                    Change how balances appear (cosmetic only)
                                </p>
                            </div>
                            <div className="flex items-center space-x-2">
                                 {showScaledUiEditor ? (
                                     <div className="space-y-2">
                                         <div className="flex items-center space-x-2">
                                             <Input
                                                type="number"
                                                value={newMultiplier}
                                                onChange={(e) => {
                                                    setNewMultiplier(e.target.value);
                                                    setError('');
                                                }}
                                                className="w-24 h-8"
                                                placeholder="1.0"
                                                disabled={isSaving}
                                             />
                                             <Button 
                                                size="sm"
                                                onClick={async () => {
                                                    if (!token.address || !transactionSendingSigner) {
                                                        setError('Wallet not connected');
                                                        return;
                                                    }

                                                    // Parse and validate multiplier
                                                    const trimmedValue = newMultiplier.trim();
                                                    if (!trimmedValue) {
                                                        setError('Please enter a multiplier value');
                                                        return;
                                                    }

                                                    const multiplier = parseFloat(trimmedValue);
                                                    if (!Number.isFinite(multiplier) || multiplier <= 0) {
                                                        setError('Please enter a valid multiplier greater than 0');
                                                        return;
                                                    }

                                                    setIsSaving(true);
                                                    setError('');

                                                    try {
                                                        await updateScaledUiMultiplier(
                                                            { mint: token.address, multiplier },
                                                            transactionSendingSigner,
                                                        );
                                                        // Only clear and close on success
                                                        setNewMultiplier('');
                                                        setShowScaledUiEditor(false);
                                                    } catch (err) {
                                                        setError(err instanceof Error ? err.message : 'Failed to update scaled UI multiplier');
                                                    } finally {
                                                        setIsSaving(false);
                                                    }
                                                }}
                                                disabled={isSaving || !newMultiplier.trim()}
                                             >
                                                {isSaving ? 'Saving...' : 'Save'}
                                             </Button>
                                             <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => {
                                                    setShowScaledUiEditor(false);
                                                    setNewMultiplier('');
                                                    setError('');
                                                }}
                                                disabled={isSaving}
                                             >
                                                Cancel
                                             </Button>
                                         </div>
                                         {error && (
                                             <Alert variant="destructive">
                                                 <AlertDescription>{error}</AlertDescription>
                                             </Alert>
                                         )}
                                     </div>
                                 ) : (
                                     <div className="flex items-center space-x-2">
                                         <code className="px-2 py-1 bg-background rounded text-xs font-mono border">
                                            {/* We don't have current multiplier in TokenDisplay usually, unless added. Assuming 1 or from detail */}
                                            {/* TODO: Add multiplier to TokenDisplay if needed */}
                                            0.005
                                         </code>
                                         <Button variant="outline" size="sm" onClick={() => setShowScaledUiEditor(true)}>Edit</Button>
                                     </div>
                                 )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Default Account State */}
                 {token.extensions?.includes('Default Account State') && (
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                         <div className="space-y-1">
                            <h4 className="text-sm font-medium">Default Account State</h4>
                            <p className="text-sm text-muted-foreground">
                                Configures default state (Frozen/Initialized) for new accounts.
                            </p>
                        </div>
                         <Switch checked={true} disabled />
                    </div>
                )}

                 {(!token.extensions || token.extensions.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                        No extensions enabled on this token.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

